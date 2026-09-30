/**
 * Dev-only: does the admin reservation book actually change a booking?
 *
 *   npx tsx scripts/_reservation-actions-check.ts
 *
 * ## Why this file exists
 *
 * The staff dashboard's reservation rows do not go through a server action.
 * Confirming, seating, completing and cancelling all call
 * `PATCH /api/reservations/:id`, because that route owns the collision-safe
 * write path and duplicating it in a second place would mean two writers that
 * drift. So the book is the one part of the dashboard that can be exercised
 * end-to-end without a browser, and it is the part the user reported as broken.
 *
 * ## The whole point: assert against the row, not the response
 *
 * The route returns 200 with `{ ok: true }` whether or not anything moved, so a
 * status-code check proves nothing. Every transition below is confirmed by
 * re-reading the row from PostgreSQL. A write that silently no-ops - a `scalars`
 * map that never gets built, a status that validates but is never assigned -
 * passes every response assertion and fails here.
 *
 * ## It undoes everything it does
 *
 * The test creates its own reservation on a table it picks, drives it through
 * every status the dashboard offers, then cancels it. It never touches seeded
 * data, so it is safe to run against a development database.
 */
import "dotenv/config";

import { Client } from "pg";
import { prisma } from "../src/lib/db";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const EMAIL = "admin@savora.example";
const PASSWORD = "savora-admin";

let failures = 0;
function check(label: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
  if (!passed) failures += 1;
}

// --- a cookie jar, because fetch has no built-in one ------------------------
const jar = new Map<string, string>();

function remember(response: Response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader() {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: { cookie: cookieHeader(), ...(init.headers ?? {}) },
  });
  remember(response);
  return response;
}

async function main() {
  console.log(`\nAdmin reservation transitions against ${BASE}\n`);

  // --- sign in ---------------------------------------------------------------
  const csrf = (await (await call("/api/auth/csrf")).json()) as { csrfToken: string };
  const signIn = await call("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: EMAIL, password: PASSWORD }),
  });
  check("signed in as staff", signIn.status === 302 || signIn.status === 200, `(got ${signIn.status})`);

  // --- find a table with room and a future day ------------------------------
  const settings = await prisma.restaurantSettings.findFirst();
  const timezone = settings?.timezone ?? "Europe/London";

  const table = await prisma.restaurantTable.findFirst({
    where: { isActive: true },
    orderBy: { capacity: "desc" },
    select: { id: true, number: true, capacity: true },
  });
  if (!table) throw new Error("no active table to test against");
  console.log(`  using table ${table.number} (seats ${table.capacity})\n`);

  // A day far enough out that the booking window and min-notice rules both pass.
  const day = new Date(Date.now() + 21 * 86_400_000);
  const isoDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(day);
  const time = "19:00";

  const startsAt = new Date(`${isoDay}T${time}:00.000Z`);
  const endsAt = new Date(startsAt.getTime() + 90 * 60_000);

  const created = await prisma.reservation.create({
    data: {
      date: new Date(`${isoDay}T00:00:00.000Z`),
      time,
      startsAt,
      endsAt,
      partySize: 2,
      status: "PENDING",
      guestName: "Reservation probe",
      guestEmail: "probe@savora.invalid",
      confirmationCode: "PROBE1",
      manageToken: "probe-token-not-a-real-credential",
      tableId: table.id,
    },
    select: { id: true },
  });

  const statusOf = async () =>
    (await prisma.reservation.findUnique({ where: { id: created.id }, select: { status: true, cancelReason: true } }))
      ?.status;

  try {
    // --- the transitions the dashboard's row buttons offer -------------------
    const steps: { to: string; label: string }[] = [
      { to: "CONFIRMED", label: "confirm" },
      { to: "SEATED", label: "seat" },
      { to: "COMPLETED", label: "complete" },
    ];

    for (const step of steps) {
      const response = await call(`/api/reservations/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: step.to }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      const actual = await statusOf();
      check(
        `${step.label}: PATCH { status: ${step.to} }`,
        response.status === 200 && body.ok === true && actual === step.to,
        `(http ${response.status}, row is ${actual}${body.error ? `, said "${body.error}"` : ""})`,
      );
    }

    // --- cancel, with the reason the dashboard collects ----------------------
    const cancel = await call(`/api/reservations/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED", cancelReason: "Probe: checking the cancel button" }),
    });
    const afterCancel = await prisma.reservation.findUnique({
      where: { id: created.id },
      select: { status: true, cancelReason: true },
    });
    check(
      "cancel with a reason",
      cancel.status === 200 && afterCancel?.status === "CANCELLED",
      `(row is ${afterCancel?.status})`,
    );
    check(
      "the reason the admin typed was stored",
      afterCancel?.cancelReason === "Probe: checking the cancel button",
      `(got "${afterCancel?.cancelReason ?? ""}")`,
    );

    // --- a cancelling booking must free its table ----------------------------
    // This is the assertion that catches a broken exclusion-constraint filter:
    // if CANCELLED still blocked the slot, this insert would be rejected.
    const rebooked = await prisma.reservation.create({
      data: {
        date: new Date(`${isoDay}T00:00:00.000Z`),
        time,
        startsAt,
        endsAt,
        partySize: 2,
        status: "CONFIRMED",
        guestName: "Second probe",
        guestEmail: "probe2@savora.invalid",
        confirmationCode: "PROBE2",
        manageToken: "probe-token-2",
        tableId: table.id,
      },
      select: { id: true },
    });
    check("a cancelled booking released its table", Boolean(rebooked.id));

    // --- the same table at the same time must still be refused ---------------
    let refused = false;
    try {
      await prisma.reservation.create({
        data: {
          date: new Date(`${isoDay}T00:00:00.000Z`),
          time,
          startsAt,
          endsAt,
          partySize: 2,
          status: "CONFIRMED",
          guestName: "Third probe",
          guestEmail: "probe3@savora.invalid",
          confirmationCode: "PROBE3",
          manageToken: "probe-token-3",
          tableId: table.id,
        },
      });
    } catch {
      refused = true;
    }
    check("the live booking still blocks the slot", refused);
  } finally {
    await prisma.reservation.deleteMany({ where: { confirmationCode: { startsWith: "PROBE" } } });
    await prisma.$disconnect();
  }

  console.log("");
  if (failures > 0) {
    console.log(`FAIL (${failures})`);
    process.exit(1);
  }
  console.log("PASS - confirm, seat, complete and cancel all persist");
}

void main().catch(async (err: unknown) => {
  console.error("ERROR", err instanceof Error ? err.message : err);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.end().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
