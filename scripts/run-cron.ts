/**
 * Run the scheduled job by hand.
 *
 *   npm run cron
 *
 * The reminders and the stale-booking reconciliation need to run periodically.
 * On a hosted platform you would point that platform's scheduler at
 * `GET /api/cron/reminders`. This project has no platform and no accounts, so
 * the primary answer is this script: it calls exactly the same two functions
 * with no HTTP, no secret and no configuration, and works the moment the
 * database is up.
 *
 * Both functions are idempotent — a reminder is only selected when
 * `reminderSentAt IS NULL`, and reconciliation only touches rows whose
 * `endsAt` has passed while still PENDING or CONFIRMED — so running this twice
 * by accident sends nothing twice.
 *
 * Where there is no scheduler at all, a Windows Scheduled Task or a crontab entry
 * calling `npm run cron` once an hour is the whole deployment story:
 *
 *   0  * * * *  cd /path/to/savora && npm run cron >> .cron.log 2>&1
 */
import "dotenv/config";

import { prisma } from "../src/lib/db";
import { reconcilePastBookings, sendDueReminders } from "../src/lib/notifications";

async function main() {
  const startedAt = new Date();

  const reminders = await sendDueReminders();
  const reconciled = await reconcilePastBookings();

  console.log(`[cron] ${startedAt.toISOString()}`);
  console.log(`[cron] reminders sent : ${reminders.sent}`);
  console.log(`[cron] bookings closed: ${reconciled.reconciled}`);

  // A count that is suspiciously zero is worth saying out loud. On a fresh
  // database there is genuinely nothing due, but on a live one a silent zero is
  // most often a query that stopped matching, and this line is the only thing
  // that would show it.
  const upcoming = await prisma.reservation.count({
    where: { status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gt: new Date() } },
  });
  console.log(`[cron] upcoming bookings still on the book: ${upcoming}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[cron] failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
