/**
 * Claiming guest bookings after sign-in.
 *
 * ## The bug this exists to fix
 *
 * A guest can book without an account — that is the point of the site. Those
 * rows are written with `userId: null` and only `guestEmail` filled in, because
 * there is no session to read an id from. `/account` then lists bookings with
 * `where: { userId }`, an indexed lookup, and those rows are invisible forever.
 *
 * The visible symptom was a guest who booked a table, created an account with
 * the *same email address*, and found their booking missing. From their side the
 * two are obviously the same person: they typed the address, and then proved
 * they own it by signing in with it. The database was the only thing that
 * disagreed.
 *
 * ## Why sign-in is the right moment
 *
 * Claiming anywhere else has a problem:
 *
 *   * **On the booking form** it does nothing — a guest who is not yet signed in
 *     is, by definition, not signed in, so there is no `userId` to claim onto.
 *   * **On every `/account` render** it turns a read page into a write page.
 *     `/account` is fetched constantly, and "scan the whole reservation table
 *     for orphans matching this address" on each of those requests is both slow
 *     and semantically wrong — a read should not be able to mutate.
 *   * **In a middleware or interceptor** has no database handle and runs on
 *     static assets.
 *
 * Sign-in is the one event that means "this person has just proved they control
 * this email address", which is precisely the authority needed to attach
 * bookings made under it. It happens once, it is idempotent, and it is cheap.
 *
 * ## Why this is not a security hole
 *
 * The `userId: null` filter is the load-bearing part. A reservation that already
 * belongs to somebody is never touched, so:
 *
 *   * Signing in cannot steal another guest's booking, even one placed on the
 *     same address — the moment *they* sign in they claim it, and after that it
 *     is off limits to everyone.
 *   * The id of the account claiming is the id Auth.js just authenticated. It
 *     comes from the callback argument, never from the request body, so it
 *     cannot be forged by a crafted form post.
 *   * A row is only ever moved from "belonging to nobody" to "belonging to the
 *     person who owns the address on it". There is no path in this app that
 *     reassigns a reservation between two user ids.
 *
 * It also cannot resurrect a cancelled booking into looking valid — cancellation
 * is a status on the row, untouched here, and `/account` still refuses to
 * cancel anything past `CANCELABLE_STATUSES`.
 */
import { prisma } from "@/lib/db";

/**
 * Attach unclaimed guest bookings to a freshly authenticated account.
 *
 * `updateMany` rather than `findMany` + a loop: one statement, one transaction,
 * and no chance of the read and the write disagreeing with each other.
 *
 * The address is compared **exactly**, not case-insensitively, and that is not
 * an oversight. `guestEmail` is written through the `email` field of
 * `createReservationSchema`, which is `z.string().trim().toLowerCase()`, so
 * every row in the table is already lowercase and this argument is lowercased
 * to match. An equality match then uses the plain `@@index([guestEmail])`
 * btree. Asking for `mode: "insensitive"` instead would compile to
 * `LOWER("guestEmail") = $1`, which is not that index, and would turn a sign-in
 * into a sequential scan of the reservation table.
 *
 * Returns the number of rows claimed, purely so the caller can log it.
 */
export async function claimGuestReservations(userId: string, email: string): Promise<number> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return 0;

  const { count } = await prisma.reservation.updateMany({
    where: {
      userId: null,
      // `userId: null` is the load-bearing half of this filter — it is what
      // makes the claim idempotent and non-stealing. The address match only
      // narrows the unowned rows down to the ones this person could have made.
      guestEmail: normalised,
    },
    data: { userId },
  });

  return count;
}
