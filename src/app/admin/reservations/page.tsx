import Link from "next/link";
import { CalendarRange, Filter, TriangleAlert } from "lucide-react";

import { DateNav } from "@/components/admin/date-nav";
import { PageHeader } from "@/components/admin/page-header";
import {
  ReservationBook,
  type BookEntry,
  type BookTable,
} from "@/components/admin/reservation-book";
import { EmptyCalendar } from "@/components/ui/empty-state";
import { BLOCKING_STATUSES, RESERVATION_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { addDaysIso, pluralise, todayIn } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";

/**
 * The book.
 *
 * ## Everything about "which day" and "which status" lives in the URL
 *
 * `?date=&status=&unassigned=`. That is deliberate for three reasons, all of
 * which show up during an actual service:
 *
 *   * The server can query on the first paint, so there is no skeleton flash on
 *     every day-step.
 *   * A manager can bookmark or message a colleague "look at Thursday 7pm" and
 *     have it mean something.
 *   * Back and forward work per-day, which is how people actually work.
 *
 * ## Why this page does not use server actions for the rows
 *
 * Amending a booking can collide with another one. The re-picker, the exclusion
 * constraint retry and the guest notification all live in
 * `PATCH /api/reservations/:id`, so that is what `ReservationBook` calls. See
 * the comment at the top of that component.
 */

/** Query for one business date. `date` is a `@db.Date`, so compare on the column. */
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Search = {
  date?: string;
  status?: string;
  unassigned?: string;
};

export const metadata = { title: "Reservations — Savora" };

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const today = todayIn(settings.timezone);

  /**
   * Validate the date rather than trusting the query string.
   *
   * An unparseable value here would be handed to Prisma as a `@db.Date` and
   * come back as a database error page, which is an alarming answer to a
   * mistyped URL. `ISO_DATE` plus a real-calendar-date check rejects both
   * `2026-13-45` and anything that is not a date at all.
   */
  const requested = params.date ?? "";
  const date = ISO_DATE.test(requested) && !Number.isNaN(Date.parse(`${requested}T00:00:00Z`))
    ? requested
    : today;

  /**
   * A status filter is a one-word allowlist, not a free string. It is written
   * into a Prisma `where`, and an unrecognised value should show everything
   * rather than a database error.
   */
  const status = RESERVATION_STATUSES.includes(params.status as never)
    ? (params.status as (typeof RESERVATION_STATUSES)[number])
    : null;

  const unassignedOnly = params.unassigned === "1";

  const [entries, counts, tables] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        date: new Date(`${date}T00:00:00Z`),
        ...(status ? { status } : {}),
        ...(unassignedOnly ? { tableId: null } : {}),
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        time: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        partySize: true,
        status: true,
        tableId: true,
        zonePref: true,
        occasion: true,
        specialRequests: true,
        confirmationCode: true,
        table: { select: { number: true } },
      },
    }),

    /**
     * Status counts for the whole day, *not* the filtered view.
     *
     * The filter chips have to keep showing how many bookings are behind each
     * one, or turning a filter on silently hides the size of what it is hiding
     * and a manager cannot tell "no no-shows today" from "no-shows are
     * filtered out". A second, unfiltered `groupBy` is cheaper than making the
     * chips lie.
     */
    prisma.reservation.groupBy({
      by: ["status"],
      where: { date: new Date(`${date}T00:00:00Z`) },
      _count: { _all: true },
    }),

    prisma.restaurantTable.findMany({
      orderBy: { number: "asc" },
      select: { id: true, number: true, capacity: true, zone: true, isActive: true },
    }),
  ]);

  const countBy = new Map(counts.map((row) => [row.status, row._count._all]));
  const dayTotal = counts.reduce((sum, row) => sum + row._count._all, 0);
  const unassigned = await prisma.reservation.count({
    where: { date: new Date(`${date}T00:00:00Z`), tableId: null, status: { in: BLOCKING_STATUSES } },
  });

  const book: BookEntry[] = entries.map((row) => ({
    id: row.id,
    time: row.time,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    guestPhone: row.guestPhone,
    partySize: row.partySize,
    status: row.status,
    tableId: row.tableId,
    tableNumber: row.table?.number ?? null,
    zone: row.zonePref,
    occasion: row.occasion,
    specialRequests: row.specialRequests,
    confirmationCode: row.confirmationCode,
  }));

  const bookTables: BookTable[] = tables.map((t) => ({
    id: t.id,
    number: t.number,
    capacity: t.capacity,
    zone: t.zone,
    isActive: t.isActive,
  }));

  /**
   * Every search param *except* the date, re-serialised for `DateNav` to splice
   * the new date into. Dropping the date here is what makes stepping a day
   * preserve the active filter.
   */
  const rest = new URLSearchParams();
  if (status) rest.set("status", status);
  if (unassignedOnly) rest.set("unassigned", "1");

  const chipHref = (next: { status?: string | null; unassigned?: boolean }) => {
    const query = new URLSearchParams(rest.toString());
    if (next.status) query.set("status", next.status);
    else query.delete("status");
    if (next.unassigned) query.set("unassigned", "1");
    else query.delete("unassigned");
    query.set("date", date);
    return `/admin/reservations?${query.toString()}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Reservations"
        title="The book"
        description={`${pluralise(dayTotal, "booking")} on ${date === today ? "today" : "this day"} · ${entries.reduce((n, r) => n + r.partySize, 0)} covers shown.`}
        actions={
          <>
            <Link href={chipHref({ unassigned: !unassignedOnly })} className="btn btn-secondary btn-sm">
              <Filter size={14} aria-hidden="true" />
              {unassignedOnly ? "Show every table" : "Only unassigned"}
            </Link>
            <Link
              href={`/admin/reservations?date=${addDaysIso(today, 1)}`}
              className="btn btn-primary btn-sm"
            >
              <CalendarRange size={14} aria-hidden="true" />
              Tomorrow
            </Link>
          </>
        }
      />

      {unassigned > 0 && !unassignedOnly ? (
        <Link
          href={chipHref({ unassigned: true })}
          className="mb-6 flex items-center gap-3 rounded-xl border border-saffron/40 bg-saffron/10 px-4 py-3 text-sm transition-colors hover:bg-saffron/15"
        >
          <TriangleAlert size={15} className="shrink-0 text-saffron" aria-hidden="true" />
          <span>
            <strong className="font-medium">{unassigned}</strong> of today&rsquo;s bookings
            {dayTotal === 1 ? " has" : " have"} no table assigned.
          </span>
        </Link>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <DateNav date={date} timezone={settings.timezone} rest={rest.toString()} />

        {/* Status chips. Each shows the day-wide count so the filters never hide
            the size of what they are hiding. */}
        <nav aria-label="Filter by status" className="flex flex-wrap items-center gap-1.5">
          <Link
            href={chipHref({ status: null })}
            aria-current={!status ? "true" : undefined}
            className={
              !status
                ? "rounded-full bg-espresso px-3 py-1 text-xs font-medium text-cream"
                : "rounded-full border border-border-subtle px-3 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-raised"
            }
          >
            All {dayTotal}
          </Link>
          {RESERVATION_STATUSES.map((key) => {
            const n = countBy.get(key) ?? 0;
            if (n === 0 && status !== key) return null;
            const active = status === key;
            return (
              <Link
                key={key}
                href={chipHref({ status: key })}
                aria-current={active ? "true" : undefined}
                className={
                  active
                    ? "rounded-full bg-espresso px-3 py-1 text-xs font-medium text-cream"
                    : "rounded-full border border-border-subtle px-3 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-raised"
                }
              >
                {STATUS_LABELS[key]} {n}
              </Link>
            );
          })}
        </nav>
      </div>

      {book.length === 0 ? (
        <EmptyCalendar
          title={status ? `No ${STATUS_LABELS[status].toLowerCase()} bookings` : "Nothing in the book"}
          description={
            status
              ? "Try clearing the status filter, or step to another day."
              : "No one has booked this day yet. Once they do they appear here, ready to confirm and seat."
          }
          action={
            status || unassignedOnly ? (
              { href: chipHref({ status: null, unassigned: false }), label: "Clear the filters" }
            ) : undefined
          }
        />
      ) : (
        <ReservationBook entries={book} tables={bookTables} />
      )}
    </>
  );
}
