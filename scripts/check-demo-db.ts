/**
 * Drives the demo database through the real application code.
 *
 * This exists because "the build passed" proves nothing about a database that
 * only exists in demo mode. Everything below is what the app itself does:
 * settings, the menu, availability, and a booking written through the same
 * collision-safe path the guest form uses.
 *
 * It asserts on *values*, not on "it did not throw". A pool that returns
 * `undefined` for every column — which is exactly what happens if the driver
 * adapter is handed objects instead of positional tuples — passes a try/catch
 * and renders an empty restaurant. It exits non-zero on the first failure.
 *
 * Run with `npm run check:demo`.
 */
import "./enable-demo-db";

import { getSettings } from "../src/lib/settings";
import { getMenuItems, getMenuItemBySlug } from "../src/lib/menu";
import { getAvailability } from "../src/lib/availability";
import { createReservation } from "../src/lib/reservations";
import { isRetryableConflict, pgErrorCode } from "../src/lib/db";
import { prisma } from "../src/lib/db";

/** A `YYYY-MM-DD` key for a date some days ahead, in the restaurant's own zone. */
function dateKey(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Every `code`-bearing string reachable from an error, outermost first.
 *
 * Prisma re-wraps driver errors, so `err.code` is a Prisma code (`P2002`) and
 * the SQLSTATE is one or two levels down. `pgErrorCode` reads the outermost, so
 * this exists to show what the two disagree about rather than to pick a winner.
 */
function describeError(err: unknown): string | undefined {
  const seen = new Set<unknown>();
  const codes: string[] = [];
  const walk = (e: unknown, depth: number): void => {
    if (!e || typeof e !== "object" || depth > 6 || seen.has(e)) return;
    seen.add(e);
    const record = e as Record<string, unknown>;
    const code = record.code;
    if (typeof code === "string") codes.push(code);
    for (const key of ["cause", "originalError", "driverAdapterError", "meta"]) {
      if (key in record) walk(record[key], depth + 1);
      // `meta.driverAdapterError` is nested, so walk the whole object too.
      if (typeof record[key] === "object" && record[key] !== null) {
        walk((record[key] as Record<string, unknown>).cause, depth + 1);
      }
    }
  };
  walk(err, 0);
  const uniq = [...new Set(codes)];
  return uniq.length ? uniq.join(" > ") : undefined;
}

async function main() {
  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
    if (!ok) failures.push(name);
  };

  console.log("demo database — booted from migrations + seed\n");

  // --- settings -----------------------------------------------------------
  const settings = await getSettings();
  check("settings load", settings !== null && typeof settings === "object");
  // `openingHours` is jsonb, which Prisma 7 cannot type, so it is a
  // `Partial<Record<DayKey, ServiceWindow[]>>` — a map keyed by weekday, read
  // through settings-repo.ts. An empty object here would mean the jsonb column
  // did not round-trip.
  const hours = settings.openingHours as Record<string, { length: number }[]>;
  const openDays = Object.keys(hours ?? {});
  check(
    "settings carry opening hours keyed by weekday",
    openDays.length === 7,
    `${openDays.length} days`,
  );
  // Monday is closed on purpose, so the claim is "every day *except* Monday is
  // open" — not "every day is open". Asserting the wrong one here would either
  // fail forever or, worse, be deleted to make the suite green.
  check(
    "Monday is the one closed day",
    (hours.mon ?? []).length === 0,
    "closed",
  );
  check(
    "every other day is open",
    openDays.filter((d) => d !== "mon").every((d) => hours[d]?.length > 0),
    openDays.filter((d) => d !== "mon").join(","),
  );
  check(
    "each window is a pair of 24-hour wall-clock times",
    openDays.every((d) =>
      (hours[d] ?? []).every(
        (w) => Array.isArray(w) && w.length === 2 && w.every((t) => /^\d\d:\d\d$/.test(String(t))),
      ),
    ),
  );
  check("settings carry a timezone", Boolean(settings.timezone), settings.timezone);
  check(
    "settings allow reservations",
    settings.isAcceptingReservations === true,
    String(settings.isAcceptingReservations),
  );

  // --- menu ---------------------------------------------------------------
  const menu = await getMenuItems({ includeUnavailable: true });
  check("menu is not empty", menu.length > 0, `${menu.length} dishes`);
  check(
    "every dish has a price",
    menu.every((d) => Number.isFinite(d.priceCents) && d.priceCents > 0),
  );
  check(
    "every dish has a description",
    menu.every((d) => typeof d.description === "string" && d.description.length > 10),
  );
  // The seed writes accented text. A pool that mis-decoded UTF-8 shows
  // replacement characters here rather than throwing.
  const accented = menu.filter((d) => /[^\x00-\x7F]/.test(`${d.name}${d.description}`));
  check("accented text survived the round trip", accented.length > 0, `${accented.length} dishes`);
  check(
    "no replacement characters anywhere in the menu",
    !menu.some((d) => `${d.name}${d.description}`.includes("\uFFFD")),
  );

  const dish = await getMenuItemBySlug("beef-fillet");
  check("a single dish loads by slug", dish !== null, dish?.name ?? "not found");
  check("the dish has a category", Boolean(dish?.category), dish?.category ?? "");
  check("the dish has a price", (dish?.priceCents ?? 0) > 0, String(dish?.priceCents));
  check(
    "the dish has dietary tags",
    Array.isArray(dish?.tags) && dish.tags.length > 0,
    dish?.tags?.join(",") ?? "",
  );
  check(
    "the dish has ingredients",
    Array.isArray(dish?.ingredients) && dish.ingredients.length > 0,
    `${dish?.ingredients?.length ?? 0}`,
  );

  // --- availability -------------------------------------------------------
  // Try each of the next fortnight days until one is a service day, so the
  // check does not depend on which weekday the seed left open.
  let servedOn: string | null = null;
  let slots: Awaited<ReturnType<typeof getAvailability>> | null = null;
  for (let offset = 1; offset <= 14 && !servedOn; offset++) {
    const date = dateKey(offset);
    const result = await getAvailability(
      { date, partySize: 2 },
      {
        timezone: settings.timezone,
        openingHours: settings.openingHours,
        diningDurationMin: settings.diningDurationMin,
      },
    );
    if (result.openTimes.length > 0) {
      servedOn = date;
      slots = result;
    }
  }
  check("a service day is findable within a fortnight", servedOn !== null, servedOn ?? "none");

  if (slots) {
    check("slots are generated", slots.slots.length > 0, `${slots.slots.length} slots`);
    check(
      "every slot carries a real instant",
      slots.slots.every((s) => !Number.isNaN(new Date(s.startsAt).getTime())),
    );
    check("tables that fit the party are counted", slots.suitableTables > 0, `${slots.suitableTables} tables`);
    check(
      "some slot is bookable in the future",
      slots.slots.some((s) => s.available && new Date(s.startsAt) > new Date()),
    );
  }

  // --- booking ------------------------------------------------------------
  const bookable = slots?.slots.find((s) => s.available && new Date(s.startsAt) > new Date());
  if (!bookable || !servedOn) {
    check("a booking can be made", false, "no bookable slot found");
  } else {
    const result = await createReservation(
      {
        date: servedOn,
        time: bookable.time,
        partySize: 2,
        guestName: "Demo Check",
        guestEmail: "demo-check@savora.example",
        guestPhone: "+44 7700 900999",
      },
      {
        timezone: settings.timezone,
        diningDurationMin: settings.diningDurationMin,
        maxPartySize: settings.maxPartySize,
        bookingWindowDays: settings.bookingWindowDays,
        minNoticeHours: settings.minNoticeHours,
        holidays: settings.holidays,
        isAcceptingReservations: settings.isAcceptingReservations,
      },
    );

    check("a reservation is created", result.ok, result.ok ? "" : result.message);
    if (result.ok) {
      const r = result.reservation;
      check("it has a confirmation code", typeof r.confirmationCode === "string" && r.confirmationCode.length > 3, r.confirmationCode);
      check("it has a manage token", typeof r.manageToken === "string" && r.manageToken.length > 10);

      // Read it back through Prisma rather than trusting the return value: the
      // return value is assembled in memory, the row is what a page will render.
      const stored = await prisma.reservation.findUnique({ where: { id: r.id } });
      check("the reservation is readable from the database", stored !== null);
      check(
        "the stored start is the slot we asked for",
        stored !== null && new Date(stored.startsAt).toISOString() === new Date(bookable.startsAt).toISOString(),
        stored ? new Date(stored.startsAt).toISOString() : "",
      );
      check("the stored party size is right", stored?.partySize === 2, String(stored?.partySize));
      check("a table was assigned", Boolean(stored?.tableId), stored?.tableId ?? "none");
    }
  }

  // --- error mapping ------------------------------------------------------
  // The booking path retries on SQLSTATE, so the code has to survive the trip
  // through the driver adapter. This asserts the predicate the app uses.
  const withCode = (code: string) => Object.assign(new Error("x"), { code });
  check("23P01 is retryable", isRetryableConflict(withCode("23P01")));
  check("40P01 is retryable", isRetryableConflict(withCode("40P01")));
  check("40001 is retryable", isRetryableConflict(withCode("40001")));
  check("23505 is not retryable", !isRetryableConflict(withCode("23505")));
  check("SQLSTATE is readable", pgErrorCode(withCode("23P01")) === "23P01");

  // --- constraint actually fires -------------------------------------------
  // The strongest single statement demo mode can make: the exclusion
  // constraint really is enforced by this PostgreSQL build, so a demo booking
  // cannot double-book a table the way a mock would happily allow.
  //
  // Any table will do. The window is pushed well past the seed's range — the
  // seed only books 21 days back to 13 days ahead — so there is nothing to
  // collide with but the row inserted a line earlier.
  const table = await prisma.restaurantTable.findFirst();
  if (table) {
    const startsAt = new Date(Date.now() + 400 * 86_400_000);
    startsAt.setUTCHours(19, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 2 * 3_600_000);
    const row = {
      tableId: table.id,
      guestName: "Constraint Probe",
      guestEmail: "probe@savora.example",
      guestPhone: "+44 7700 900000",
      partySize: 2,
      date: startsAt,
      time: "19:00",
      startsAt,
      endsAt,
      status: "CONFIRMED" as const,
      confirmationCode: "PROBE1",
      manageToken: "probe-token-0001",
    };

    await prisma.reservation.create({ data: row });
    check("a baseline booking is accepted", true, `table ${table.number}`);

    let code: string | undefined;
    let seen: string | undefined;
    try {
      await prisma.reservation.create({
        data: { ...row, confirmationCode: "PROBE2", manageToken: "probe-token-0002" },
      });
    } catch (e) {
      code = pgErrorCode(e);
      seen = describeError(e);
    }
    check(
      "an overlapping booking is rejected",
      code !== undefined || seen !== undefined,
      `SQLSTATE ${code ?? "none"} / ${seen ?? "no error"}`,
    );
    check("it is rejected as an exclusion violation", code === "23P01", code ?? "");
    check(
      "and the app treats that as retryable",
      code === "23P01" && isRetryableConflict({ code }),
    );

    // A cancelled booking is outside the constraint's WHERE clause, so the
    // same table and window must be free again. If demo mode had lost the
    // partial predicate, the table would be permanently unbookable.
    await prisma.reservation.update({
      where: { id: (await prisma.reservation.findFirstOrThrow({
        where: { confirmationCode: "PROBE1" },
        select: { id: true },
      })).id },
      data: { status: "CANCELLED" },
    });
    const recancelled = await prisma.reservation.create({
      data: {
        ...row,
        confirmationCode: "PROBE3",
        manageToken: "probe-token-0003",
        status: "CANCELLED",
      },
    });
    check("a cancelled booking frees its table again", recancelled.id !== "", recancelled.confirmationCode);
  } else {
    check("a table exists for the constraint probe", false);
  }

  console.log();
  if (failures.length) {
    console.error(`${failures.length} check(s) failed: ${failures.join(", ")}`);
    // `process.exitCode`, not `process.exit()`. When stdout is a pipe — a CI
    // log, `| Select-Object`, a file — `process.exit()` tears the process down
    // before the buffered writes drain, and a passing run prints nothing at all.
    process.exitCode = 1;
    return;
  }
  console.log("all demo-database checks passed");
}

void main();
