/**
 * Proves the exclusion constraint actually blocks overlapping bookings.
 *
 *   npm run verify:constraint
 *
 * ## Why this is a script and not a comment in the schema
 *
 * "We have a GiST exclusion constraint so a table cannot be double-booked" is a
 * claim. A GiST exclusion constraint is easy to write and easy to write *wrong*:
 * the wrong operator class, a missing `WHERE` on the partial index, or a range
 * that does not match the generated column will all accept double bookings while
 * looking completely correct in the schema. The only way to know is to try to
 * double-book and watch it fail.
 *
 * ## It can actually fail
 *
 * The original version printed OK/FAIL and exited 0 regardless, which made it
 * worse than no test: a green run would have been reported as proof while
 * proving nothing. Every check now feeds a failure counter, the SQLSTATE is
 * asserted rather than merely printed, and the process exits non-zero if
 * anything went wrong — so it is safe to wire into CI.
 *
 * ## Asserting the SQLSTATE, not just the rejection
 *
 * "The insert threw" is not evidence the *constraint* stopped it. A missing
 * foreign key, a bad cast or a check violation would all throw too, and the
 * booking would still have been double-booked in spirit. `23P01` is
 * `exclusion_violation` and nothing else in this schema raises it, so it
 * distinguishes the guarantee working from the insert failing for a different
 * reason.
 *
 * ## It only touches its own rows
 *
 * The cleanup used to be `delete from "Reservation"` with no `WHERE`, which
 * would have destroyed the entire seeded book. Everything here is namespaced to
 * two throwaway tables created at the start, so running it against a live
 * development database is safe.
 */
import { Client } from "pg";

const PG = { host: "127.0.0.1", port: 5433, user: "savora", password: "savora", database: "savora" };

/** `exclusion_violation` — the only SQLSTATE this test will accept as a pass. */
const EXCLUSION_VIOLATION = "23P01";

/** The tables this script creates, so cleanup can never reach seeded data. */
const TEST_TABLES = ["vc_table_a", "vc_table_b"];
const TEST_DAY = "2026-06-01";

/**
 * A `pg` error, narrowed to the field the test actually reads.
 *
 * `catch (e)` gives `unknown`, and the honest narrowing is to say which shape
 * we are prepared to handle rather than casting to `any` and trusting that
 * `code` exists.
 */
type PgError = { code?: string; message?: string };

function isPgError(value: unknown): value is PgError {
  return typeof value === "object" && value !== null && "code" in value;
}

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  const mark = passed ? "ok  " : "FAIL";
  console.log(`  ${mark} ${label}${detail ? `  ${detail}` : ""}`);
  if (!passed) failures += 1;
}

/** Columns are camelCase in the Prisma schema, so every identifier is quoted. */
/** `slot` is GENERATED ALWAYS, so inserts supply only the timestamps. */
const insertSql = `
  insert into "Reservation"
    ("id", "date", "time", "startsAt", "endsAt", "partySize", "status",
     "guestName", "guestEmail", "confirmationCode", "manageToken", "tableId", "updatedAt")
  values (gen_random_uuid()::text, $1::date, '19:00', $2::timestamptz, $3::timestamptz,
          2, 'CONFIRMED', 'Guest', 'guest@verify.invalid',
          gen_random_uuid()::text, gen_random_uuid()::text, $4, now())
`;

async function main() {
  const c = new Client(PG);
  await c.connect();

  // Clear anything a previous crashed run left behind. Without this, re-running
  // after a failure dies on a duplicate table number and reports that as the
  // constraint being broken, which is the most confusing possible message.
  await c.query(`delete from "Reservation" where "tableId" = any($1::text[])`, [[...TEST_TABLES]]);
  await c.query(`delete from "RestaurantTable" where "id" = any($1::text[])`, [[...TEST_TABLES]]);

  const t1 = (
    await c.query(
      `insert into "RestaurantTable" ("id","number","capacity","zone")
       values ($1, 9001, 4, 'INDOOR') returning "id"`,
      [TEST_TABLES[0]],
    )
  ).rows[0].id as string;

  const t2 = (
    await c.query(
      `insert into "RestaurantTable" ("id","number","capacity","zone")
       values ($1, 9002, 4, 'INDOOR') returning "id"`,
      [TEST_TABLES[1]],
    )
  ).rows[0].id as string;

  const at = (h: number, m = 0) =>
    `${TEST_DAY} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+00`;

  console.log(`\nDouble-booking guarantee, ${TEST_DAY}\n`);

  try {
    // 1. The baseline must succeed, or every later check is vacuous.
    await c.query(insertSql, [TEST_DAY, at(19, 0), at(20, 30), t1]);
    check("a first booking is accepted", true);

    // 2. Exactly abutting (20:30) must be allowed: ranges are [start, end), so a
    //    party leaving at 20:30 does not collide with one seated at 20:30.
    await c.query(insertSql, [TEST_DAY, at(20, 30), at(22, 0), t1]);
    check("an abutting 20:30 sitting is allowed", true, "(touching is not overlapping)");

    // 3. A 30-minute overlap must be rejected, and rejected by the constraint.
    try {
      await c.query(insertSql, [TEST_DAY, at(20, 0), at(21, 30), t1]);
      check("a 20:00-21:30 overlap is rejected", false, "(the insert was allowed!)");
    } catch (e: unknown) {
      const code = isPgError(e) ? e.code : undefined;
      check(
        "a 20:00-21:30 overlap is rejected by the constraint",
        code === EXCLUSION_VIOLATION,
        code === EXCLUSION_VIOLATION ? `(SQLSTATE ${code})` : `(got ${code ?? "a non-SQL error"})`,
      );
    }

    // 4. A different table at the same time is fine — the constraint is per table,
    //    not per restaurant.
    try {
      await c.query(insertSql, [TEST_DAY, at(19, 0), at(20, 30), t2]);
      check("the same slot on a different table is allowed", true);
    } catch (e: unknown) {
      const code = isPgError(e) ? e.code : undefined;
      check("the same slot on a different table is allowed", false, `(refused with ${code})`);
    }

    // 5. Cancelling must free the slot immediately — this is what makes a
    //    cancellation actually mean anything to the calendar.
    await c.query(
      `update "Reservation" set "status"='CANCELLED' where "tableId"=$1 and "startsAt"=$2::timestamptz`,
      [t1, at(19, 0)],
    );
    try {
      await c.query(insertSql, [TEST_DAY, at(19, 0), at(20, 30), t1]);
      check("the slot is reusable after a cancellation", true);
    } catch (e: unknown) {
      const code = isPgError(e) ? e.code : undefined;
      check("the slot is reusable after a cancellation", false, `(refused with ${code})`);
    }

    // 6. The same must hold for NO_SHOW.
    //
    //    This is not a restatement of check 5: the partial index carries a
    //    literal status list — PENDING, CONFIRMED, SEATED — and NO_SHOW is
    //    deliberately absent from it. `reconcilePastBookings` writes NO_SHOW in
    //    bulk, so if that status were wrongly included, every table that had ever
    //    been marked as a no-show would be permanently unbookable. The status
    //    list is the part of the constraint most likely to be edited by accident,
    //    so it is worth a check of its own.
    await c.query(
      `update "Reservation" set "status"='NO_SHOW' where "tableId"=$1 and "startsAt"=$2::timestamptz`,
      [t1, at(19, 0)],
    );
    try {
      await c.query(insertSql, [TEST_DAY, at(19, 0), at(20, 30), t1]);
      check("a NO_SHOW booking does not hold its table", true);
    } catch (e: unknown) {
      const code = isPgError(e) ? e.code : undefined;
      check(
        "a NO_SHOW booking does not hold its table",
        false,
        `(refused with ${code} — the exclusion index is holding a status it should not)`,
      );
    }

    // 7. And a status that *does* block still blocks after all of that, so
    //    checks 5 and 6 cannot be passing because the constraint stopped
    //    working entirely.
    await c.query(
      `update "Reservation" set "status"='SEATED' where "tableId"=$1 and "startsAt"=$2::timestamptz`,
      [t2, at(19, 0)],
    );
    try {
      await c.query(insertSql, [TEST_DAY, at(19, 0), at(20, 30), t2]);
      check("a SEATED booking still holds its table", false, "(the insert was allowed!)");
    } catch (e: unknown) {
      const code = isPgError(e) ? e.code : undefined;
      check(
        "a SEATED booking still holds its table",
        code === EXCLUSION_VIOLATION,
        code === EXCLUSION_VIOLATION ? `(SQLSTATE ${code})` : `(got ${code ?? "a non-SQL error"})`,
      );
    }

    // 8. The real test: five *genuinely simultaneous* inserts for one table
    //    must produce exactly one winner. A check-then-insert application would
    //    let several through here; the database cannot.
    //
    //    Each attempt gets its own connection. `pg` queues a second `query()` on
    //    a client that is already busy and warns about it, which means firing
    //    five off one client would serialise them and prove nothing — the first
    //    would win and the other four would be rejected by an ordinary
    //    sequential insert, exactly as they would be with no concurrency at all.
    //    Five connections is the only way to put the five in the same instant.
    await c.query(`delete from "Reservation" where "tableId" = any($1::text[])`, [[t1, t2]]);

    const racers = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const racer = new Client(PG);
        await racer.connect();
        return racer;
      }),
    );

    try {
      const settled = await Promise.allSettled(
        racers.map((racer) => racer.query(insertSql, [TEST_DAY, at(19, 0), at(20, 30), t1])),
      );
      const won = settled.filter((r) => r.status === "fulfilled").length;
      const lost = settled.filter((r) => r.status === "rejected").length;
      const unexpected = settled.filter(
        (r): r is PromiseRejectedResult =>
          r.status === "rejected" && (!isPgError(r.reason) || r.reason.code !== EXCLUSION_VIOLATION),
      );
      // A failure that does not say *why* is half a test. Name the codes.
      const codes = [
        ...new Set(
          settled
            .filter((r): r is PromiseRejectedResult => r.status === "rejected")
            .map((r) => (isPgError(r.reason) ? r.reason.code : `non-pg: ${String(r.reason)}`)),
        ),
      ].join(" + ");
      check(
        "5 concurrent inserts on one table yield exactly 1 winner",
        won === 1 && lost === 4 && unexpected.length === 0,
        `(${won} won, ${lost} rejected${unexpected.length > 0 ? `, ${unexpected.length} rejected for the wrong reason` : ""}${
          codes ? `; rejection codes: ${codes}` : ""
        })`,
      );
    } finally {
      await Promise.all(racers.map((racer) => racer.end().catch(() => {})));
    }
  } finally {
    // Cleanup runs even when a check throws, scoped to the two tables this
    // script created. Never a bare DELETE.
    await c
      .query(`delete from "Reservation" where "tableId" = any($1::text[])`, [[t1, t2]])
      .catch(() => {});
    await c.query(`delete from "RestaurantTable" where "id" = any($1::text[])`, [[...TEST_TABLES]]);
    await c.end();
  }

  console.log("");
  if (failures > 0) {
    console.log(`FAIL (${failures})`);
    process.exit(1);
  }
  console.log("PASS - the database refuses to double-book a table");
}

main().catch((err: unknown) => {
  console.error("ERROR", err instanceof Error ? err.message : err);
  process.exit(1);
});
