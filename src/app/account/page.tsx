/**
 * My bookings.
 *
 * Two lists from one page, and the split is on `startsAt` rather than on
 * `status`. A guest's mental model is "what is coming" versus "what happened",
 * and splitting on status would strand a booking for next Tuesday in a
 * "pending" bucket that reads like a backlog. Status is shown on each card
 * instead, where it belongs.
 *
 * The two queries are separate rather than one `findMany` followed by a filter
 * because the counts are wildly different: a regular has a handful of upcoming
 * bookings and hundreds of settled ones, and only the recent handful of those
 * are ever shown. Two indexed range scans return 3 rows and 8 rows where one
 * unfiltered read would return all of them.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, Sparkles } from "lucide-react";

import {
  AccountReservationCard,
  type AccountReservation,
} from "@/components/account/reservation-card";
import { AccountSummary } from "@/components/account/account-summary";
import { EmptyReservations } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { pluralise, todayIn } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My bookings",
  description: "Every reservation you have made with Savora.",
  robots: { index: false, follow: false },
};

/** How many settled bookings to keep on the page. Older ones are in the email. */
const PAST_LIMIT = 8;

const SELECT = {
  id: true,
  confirmationCode: true,
  date: true,
  time: true,
  partySize: true,
  status: true,
  zonePref: true,
  occasion: true,
  specialRequests: true,
  table: { select: { number: true, zone: true } },
} as const;

export default async function AccountPage() {
  const user = await currentUser();
  // The layout already redirects; this is for the type, not for the behaviour.
  if (!user) redirect("/signin?callbackUrl=/account");

  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const now = new Date();

  const [upcoming, past] = await Promise.all([
    prisma.reservation.findMany({
      where: { userId: user.id, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      select: SELECT,
    }),
    prisma.reservation.findMany({
      where: { userId: user.id, startsAt: { lt: now } },
      orderBy: { startsAt: "desc" },
      take: PAST_LIMIT,
      select: SELECT,
    }),
  ]);

  /**
   * `date` is a `@db.Date` column, so Prisma hands back a Date pinned to
   * midnight UTC. Reading its ISO date directly is therefore correct and
   * cheaper than re-deriving the business date from `startsAt` through the
   * timezone — and immune to the BST problem that `startsAt` would have.
   */
  const toCard = (r: (typeof upcoming)[number]): AccountReservation => ({
    id: r.id,
    confirmationCode: r.confirmationCode,
    dateIso: r.date.toISOString().slice(0, 10),
    time: r.time,
    partySize: r.partySize,
    status: r.status,
    zonePref: r.zonePref,
    occasion: r.occasion,
    specialRequests: r.specialRequests,
    table: r.table,
  });

  const hasAny = upcoming.length > 0 || past.length > 0;

  /**
   * One count the page does not otherwise need, for the summary strip. Cheap,
   * and the layout's identical query is on a different route so React's
   * per-request deduplication does not apply across them.
   */
  const savedDishes = await prisma.favorite.count({ where: { userId: user.id } });

  /**
   * Mapped once, up front, rather than inside each `.map()` in the body: the
   * summary strip and the booking list both need the same shape, and
   * `toCard` is where the `date` → `dateIso` conversion happens. Mapping here
   * means the strip cannot accidentally receive a raw row — which is exactly the
   * type error this would otherwise have been.
   */
  const upcomingCards = upcoming.map(toCard);
  const pastCards = past.map(toCard);

  return (
    <div>
      <AccountSummary
        userName={user.name}
        email={user.email}
        nextVisit={upcomingCards[0] ?? null}
        upcomingCount={upcomingCards.length}
        savedDishes={savedDishes}
        visitedCount={pastCards.length}
        hasMoreHistory={pastCards.length >= PAST_LIMIT}
      />

      {!hasAny ? (
        <EmptyReservations
          title="No bookings yet"
          description="When you book a table it appears here, with everything you need to change or cancel it. We keep the record so you never have to remember a confirmation code."
          action={{ href: "/reserve", label: "Book your first table" }}
          secondaryAction={{ href: "/menu", label: "Read the menu first" }}
        />
      ) : null}

      {upcomingCards.length > 0 ? (
        <section aria-labelledby="upcoming-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="upcoming-heading" className="font-display text-2xl md:text-3xl">
              Coming up
            </h2>
            <p className="text-sm text-ink-muted">
              {pluralise(upcomingCards.length, "booking")} ahead
            </p>
          </div>

          <div className="mt-6 space-y-5">
            {upcomingCards.map((r, i) => (
              <Reveal key={r.id} index={i}>
                <AccountReservationCard reservation={r} today={today} />
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      {pastCards.length > 0 ? (
        <section aria-labelledby="past-heading" className={upcomingCards.length > 0 ? "mt-16" : ""}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="past-heading" className="font-display text-2xl md:text-3xl">
              Before this
            </h2>
            <p className="text-sm text-ink-muted">
              {upcomingCards.length === 0 ? "Your history with us" : "The last few"}
            </p>
          </div>

          <div className="mt-6 space-y-5">
            {pastCards.map((r, i) => (
              <Reveal key={r.id} index={i}>
                <AccountReservationCard reservation={r} today={today} />
              </Reveal>
            ))}
          </div>

          {upcomingCards.length === 0 ? (
            <p className="mt-8 flex items-center gap-2.5 text-sm text-ink-muted">
              <CalendarPlus size={15} className="text-ink-subtle" aria-hidden="true" />
              Nothing booked at the moment.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Only meaningful when there is history to have an opinion about. */}
      {upcomingCards.length === 0 && pastCards.length > 0 ? (
        <aside className="mt-12 flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-border-subtle bg-surface-raised/60 px-7 py-6">
          <p className="flex items-start gap-3 text-sm leading-relaxed text-ink-muted">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <span>
              It has been a while. The menu changes most weeks, and the terrace is open again —
              the longest tables are the ones we cannot repeat.
            </span>
          </p>
          <Link href="/reserve" className="btn btn-primary btn-sm shrink-0">
            Book again
          </Link>
        </aside>
      ) : null}
    </div>
  );
}
