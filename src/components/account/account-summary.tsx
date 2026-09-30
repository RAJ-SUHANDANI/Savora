import Link from "next/link";
import { CalendarCheck, CalendarPlus, Heart, UserRound } from "lucide-react";

import { formatDate, formatTime, pluralise } from "@/lib/format";

/**
 * The strip at the top of "My bookings".
 *
 * ## Why it exists
 *
 * Signing in used to land on a list — and for a guest who had never booked with
 * us, on an empty-state message. Neither says "you have an account now, here is
 * what having one does". This strip answers that in one line, and gives the
 * three signed-in destinations a way in that does not depend on having already
 * noticed the tab bar.
 *
 * ## Why the next visit leads
 *
 * The next table is the only thing on this page with a deadline, so it gets the
 * large cell. The rest are counts, and counts do not need to be read twice.
 *
 * Every value is passed in rather than queried here: the page has already read
 * all of them, and a component that goes back to the database duplicates three
 * queries to render four numbers.
 */

type NextVisit = {
  dateIso: string;
  time: string;
  partySize: number;
  confirmationCode: string;
};

export function AccountSummary({
  userName,
  email,
  nextVisit,
  upcomingCount,
  savedDishes,
  visitedCount,
  hasMoreHistory,
}: {
  userName?: string | null;
  email?: string | null;
  nextVisit: NextVisit | null;
  upcomingCount: number;
  savedDishes: number;
  visitedCount: number;
  /** True when `past` hit its limit, so "N visits" is a floor not a total. */
  hasMoreHistory: boolean;
}) {
  const firstName = userName?.trim().split(/\s+/)[0] ?? null;

  return (
    <section
      aria-label="Your account at a glance"
      className="mb-12 overflow-hidden rounded-2xl border border-border-subtle"
    >
      <div className="grid gap-px bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
        {/* The one cell with a deadline in it. */}
        <div className="bg-surface p-5 lg:col-span-2 lg:p-6">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-subtle">
            <CalendarCheck size={13} className="text-accent" aria-hidden="true" />
            {nextVisit ? "Your next table" : "Nothing booked yet"}
          </p>

          {nextVisit ? (
            <>
              <p className="mt-3 font-display text-2xl leading-tight lg:text-3xl">
                {formatDate(nextVisit.dateIso)}
                <span className="text-ink-subtle">,</span> {formatTime(nextVisit.time)}
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                {pluralise(nextVisit.partySize, "cover", "covers")} ·{" "}
                <span className="tabular-nums">{nextVisit.confirmationCode}</span>
                {upcomingCount > 1 ? ` · ${pluralise(upcomingCount, "booking")} ahead` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-display text-2xl leading-tight lg:text-3xl">
                We would love to seat you
              </p>
              <Link href="/reserve" className="btn btn-primary btn-sm mt-4">
                <CalendarPlus size={14} aria-hidden="true" />
                Find a table
              </Link>
            </>
          )}
        </div>

        <Link
          href="/account/favourites"
          className="group bg-surface p-5 transition-colors hover:bg-surface-raised/60 lg:p-6"
        >
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-subtle">
            <Heart size={13} className="text-accent" aria-hidden="true" />
            Saved dishes
          </p>
          <p className="mt-3 font-display text-3xl leading-none tabular-nums">{savedDishes}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            {savedDishes === 0
              ? "Tap the heart on any dish to keep it here"
              : "ready for the next time you are deciding"}
          </p>
        </Link>

        <div className="bg-surface p-5 lg:p-6">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-subtle">
            <UserRound size={13} className="text-accent" aria-hidden="true" />
            Your account
          </p>
          <p className="mt-3 truncate font-display text-xl leading-tight">
            {firstName ?? "Your account"}
          </p>
          {email ? <p className="mt-1.5 truncate text-xs text-ink-muted">{email}</p> : null}
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            {visitedCount === 0
              ? "No visits recorded yet"
              : hasMoreHistory
                ? `${visitedCount}+ visits with us`
                : `${pluralise(visitedCount, "visit")} with us`}
          </p>
          <Link
            href="/account/profile"
            className="link-underline tap-target mt-2 text-xs text-accent"
          >
            Edit your details
          </Link>
        </div>
      </div>
    </section>
  );
}
