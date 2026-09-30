/**
 * The scheduled job: reminder emails and stale-booking reconciliation.
 *
 * `POST /api/cron/reminders` (and `GET`, because most free schedulers issue a
 * plain GET and refusing them would be a papercut).
 *
 * ## Why this route exists
 *
 * `sendDueReminders` and `reconcilePastBookings` were written long before
 * anything could call them. Without an entry point they are dead code: no guest
 * would ever receive a reminder, and a booking left at PENDING long after the
 * party should have arrived would sit in the book forever, quietly inflating
 * the day's numbers.
 *
 * ## Two ways in, and why both
 *
 * This project runs with no accounts, no API keys and no scheduler, so the
 * primary way to run the job is `npm run cron`, which calls the two functions
 * directly with no HTTP and no secrets. This route is for when the app is
 * deployed somewhere that can schedule an HTTP call — and it is guarded by a
 * shared secret, because an unguarded endpoint that sends email is a way for
 * anyone on the internet to use your mail quota.
 *
 * If `CRON_SECRET` is unset the route falls back to requiring an admin session,
 * which is enough to trigger it by hand from a signed-in browser and impossible
 * to abuse from outside.
 *
 * ## Running it twice is harmless
 *
 * Both functions are written to be idempotent: a reminder is only selected when
 * `reminderSentAt IS NULL` and is stamped immediately after sending, so a
 * second run finds nothing due. Reconciliation only touches rows still at
 * PENDING or CONFIRMED whose `endsAt` has passed, so a second run finds nothing
 * stale. A scheduler that fires twice, or retries, changes nothing — which is the
 * property that makes it safe to wire to whatever free cron the host offers.
 */
import { fail, handle, ok } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { reconcilePastBookings, sendDueReminders } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Constant-time-ish comparison.
 *
 * `===` on a secret leaks its length and prefix through timing. It is not a real
 * risk against a TLS endpoint, but a plain equality check here would be the kind
 * of thing that gets copied into something it should not have been, so the
 * comparison is written the boring defensive way.
 */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function authorise(request: Request): Promise<Response | null> {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const header = request.headers.get("authorization") ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const query = new URL(request.url).searchParams.get("secret") ?? "";

    if (secretMatches(bearer, secret) || secretMatches(query, secret)) return null;

    // No "hint" about which half was wrong — an endpoint that says "bad token"
    // and not "missing token" tells an attacker the format.
    return fail("Not authorised", { status: 401, code: "UNAUTHORIZED" });
  }

  // No secret configured: fall back to a staff session so the job can still be
  // triggered by hand, and so a self-hosted install is not locked out of a
  // feature it is entitled to.
  const user = await currentUser();
  if (user?.role !== "ADMIN") {
    return fail("Not authorised", { status: 401, code: "UNAUTHORIZED" });
  }
  return null;
}

async function run(request: Request) {
  return handle(async () => {
    const denied = await authorise(request);
    if (denied) return denied;

    /**
     * Both run in one pass, reminders first.
     *
     * The order is not arbitrary but it is not load-bearing either: reminders
     * read rows and reconciliation writes them, and running the reader first
     * means the counts reported below describe the world as it was before this
     * tick changed anything — which is the number worth putting in a log.
     */
    const reminders = await sendDueReminders();
    const reconciled = await reconcilePastBookings();

    return ok({ reminders, reconciled });
  });
}

export const GET = run;
export const POST = run;
