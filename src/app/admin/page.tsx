import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  TrendingUp,
  UserRound,
  UserX,
  Utensils,
} from "lucide-react";

import { CoversTrend, PeakTimes, WeekdayCovers } from "@/components/admin/charts";
import { PageHeader } from "@/components/admin/page-header";
import { ServiceList } from "@/components/admin/service-list";
import { StatCard } from "@/components/admin/stat-card";
import { EmptyCalendar } from "@/components/ui/empty-state";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import { getDashboardStats, getRevenueEstimate } from "@/lib/analytics";
import { CANCELABLE_STATUSES } from "@/lib/constants";
import { addDaysIso, formatDate, formatPriceCompact, todayIn } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";

export const metadata = { title: "Overview — Savora" };

export default async function AdminOverviewPage() {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);

  // Computed once, from a single Date, so the query and the copy above it can
  // never disagree about what "now" is mid-render.
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 14);

  const [stats, revenue, unassigned] = await Promise.all([
    getDashboardStats({ timezone: settings.timezone, dateIso: today }),
    getRevenueEstimate({
      from: addDaysIso(today, -29),
      to: today,
      timezone: settings.timezone,
    }),
    // Bookings in the next fortnight with nobody assigned to a table. This is
    // the one number on the page that is a *to-do* rather than a measurement,
    // so it earns the most prominent slot.
    prisma.reservation.count({
      where: {
        tableId: null,
        startsAt: { gte: now, lte: horizon },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    }),
  ]);

  const bookingUrl = `/admin/reservations?date=${today}`;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Good ${greeting()}, ${settings.name}.`}
        description={`${formatDate(today)} · ${stats.today.reservations} bookings and ${stats.today.covers} covers on the book.`}
        actions={
          <Link href={bookingUrl} className="btn btn-primary btn-sm">
            <CalendarDays size={14} aria-hidden="true" />
            Open today&rsquo;s book
          </Link>
        }
      />

      {unassigned > 0 ? (
        <Link
          href="/admin/reservations?unassigned=1"
          className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-saffron/40 bg-saffron/10 px-5 py-4 transition-colors hover:bg-saffron/15"
        >
          <p className="flex items-center gap-3 text-sm text-ink">
            <Utensils size={16} className="shrink-0 text-saffron" aria-hidden="true" />
            <span>
              <strong className="font-semibold">
                {unassigned} booking{unassigned === 1 ? "" : "s"}
              </strong>{" "}
              in the next fortnight still {unassigned === 1 ? "has" : "have"} no table.
            </span>
          </p>
          <span className="flex items-center gap-1.5 text-xs font-medium text-saffron">
            Assign them
            <ArrowRight size={13} aria-hidden="true" />
          </span>
        </Link>
      ) : null}

      {/* ---- Today ---- */}
      <section aria-labelledby="today-heading" className="mb-14">
        <h2 id="today-heading" className="eyebrow mb-4">
          Today
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Covers"
            value={stats.today.covers}
            icon={<Utensils size={16} aria-hidden="true" />}
            delayMs={0}
            hint={`Across ${stats.today.reservations} bookings`}
          />
          <StatCard
            label="Rough occupancy"
            value={Math.round(stats.today.occupancy * 100)}
            format="percent"
            icon={<TrendingUp size={16} aria-hidden="true" />}
            delayMs={80}
            // Stated as an estimate, because it is one: the denominator is a
            // model of turns per table, not a count of covers the room served.
            hint="Against a modelled two sittings per table — an estimate, not a count"
          />
          <StatCard
            label="Seated"
            value={stats.today.seated + stats.today.completed}
            delayMs={160}
            hint={`${stats.today.completed} finished, ${stats.today.seated} still at the table`}
          />
          <StatCard
            label="Cancellations"
            value={stats.today.cancelled}
            delayMs={240}
            hint={
              stats.today.reservations + stats.today.cancelled > 0
                ? `${Math.round((stats.today.cancelled / (stats.today.reservations + stats.today.cancelled)) * 100)}% of today's bookings`
                : "No bookings today"
            }
          />
        </div>
      </section>

      {/* ---- Charts ---- */}
      <section aria-labelledby="trend-heading" className="mb-14">
        <h2 id="trend-heading" className="eyebrow mb-4">
          The last 30 days
        </h2>
        <div className="card p-6">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h3 className="font-display text-xl">Covers and bookings</h3>
              <p className="mt-1 text-sm text-ink-muted">
                Covers is what the kitchen cooks; bookings is what the floor turns.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-5 rounded-full bg-accent" aria-hidden="true" />
                Covers
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-5 rounded-full bg-olive"
                  style={{ backgroundImage: "repeating-linear-gradient(90deg,currentColor 0 4px,transparent 4px 7px)" }}
                  aria-hidden="true"
                />
                Bookings
              </span>
            </div>
          </div>
          <CoversTrend data={stats.trend} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card p-6">
            <h3 className="font-display text-lg">Covers by weekday</h3>
            <p className="mt-1 mb-5 text-sm text-ink-muted">The strongest night is highlighted.</p>
            <WeekdayCovers data={stats.byWeekday} />
          </div>
          <div className="card p-6">
            <h3 className="font-display text-lg">Busiest seating times</h3>
            <p className="mt-1 mb-5 text-sm text-ink-muted">
              Across every booking that actually happened.
            </p>
            <PeakTimes data={stats.byTime.slice(0, 8)} />
          </div>
        </div>
      </section>

      {/* ---- Today's book ---- */}
      <section aria-labelledby="book-heading" className="mb-14">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="book-heading" className="eyebrow">
            Today&rsquo;s book
          </h2>
          <Link href={bookingUrl} className="text-xs text-ink-muted transition-colors hover:text-ink">
            See all {stats.today.reservations}
          </Link>
        </div>

        {stats.upcomingToday.length === 0 ? (
          <div className="card">
            <EmptyCalendar
              compact
              title="No bookings for today"
              description="When guests book, today's service appears here in seating order."
              action={{ href: "/admin/reservations", label: "Open the reservations" }}
            />
          </div>
        ) : (
          <ServiceList items={stats.upcomingToday} cancellableStatuses={CANCELABLE_STATUSES} />
        )}
      </section>

      {/* ---- All-time ---- */}
      <section aria-labelledby="alltime-heading">
        <h2 id="alltime-heading" className="eyebrow mb-4">
          Since opening
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Bookings"
            value={stats.totals.reservations}
            icon={<CalendarDays size={16} aria-hidden="true" />}
            hint={`${stats.totals.covers.toLocaleString("en-GB")} covers served`}
          />
          <StatCard
            label="Distinct guests"
            value={stats.totals.distinctGuests}
            icon={<UserRound size={16} aria-hidden="true" />}
            hint={`${stats.totals.repeatCustomers} have dined more than once`}
          />
          <StatCard
            label="Average party"
            value={stats.totals.averagePartySize}
            format="decimal1"
            hint="Counting only bookings that went ahead"
          />
          <StatCard
            label="No-show rate"
            value={Math.round(stats.totals.noShowRate * 100)}
            format="percent"
            icon={<UserX size={16} aria-hidden="true" />}
            hint={`${stats.totals.noShow} no-shows against ${stats.totals.completed} completed bookings`}
          />
        </div>

        <div className="card mt-6 flex flex-wrap items-center justify-between gap-5 p-6">
          <div>
            <p className="eyebrow">Estimated takings, last 30 days</p>
            <p className="mt-2 font-display text-3xl tabular-nums">
              {formatPriceCompact(revenue.estimateCents, settings.currency)}
            </p>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-muted">
              {revenue.covers} covers at an assumed {formatPriceCompact(revenue.avgSpendCents, settings.currency)} spend per
              head. Savora does not take orders, so this is a planning figure — not a revenue report.
            </p>
          </div>
          <Link href="/admin/customers" className="btn btn-secondary btn-sm shrink-0">
            Browse customers
          </Link>
        </div>
      </section>

      <Orientation />
    </>
  );
}

/**
 * "What is this, and what can I do in it?"
 *
 * The first thing a new member of staff needs, and the one thing a dashboard
 * almost never tells them. Six sections, each with a link and the actions it
 * allows — the answer to "can I mark something sold out from here?" without
 * having to go and find out.
 *
 * Deliberately at the *bottom* of the overview rather than the top. The numbers
 * are the reason to open this page; a directory of links is not, and putting it
 * first would mean scrolling past the day's takings to reach the thing that
 * mattered. It is also the last thing to become noise — once someone knows the
 * layout, they never need it again.
 *
 * The copy is `ADMIN_SECTIONS`, the same source the sidebar and the top bar
 * read, so it cannot describe a screen that does not exist.
 */
function Orientation() {
  return (
    <section aria-labelledby="orientation-heading" className="mt-16 border-t border-border-subtle pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="orientation-heading" className="font-display text-2xl">
          Where everything is
        </h2>
        <p className="text-sm text-ink-muted">Six screens. This is what each one is for.</p>
      </div>

      <ul className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ADMIN_SECTIONS.filter((section) => section.href !== "/admin").map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="group flex h-full flex-col rounded-2xl border border-border-subtle bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-surface-raised/60"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{section.label}</span>
                <ArrowRight
                  size={14}
                  aria-hidden="true"
                  className="shrink-0 text-ink-subtle transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-accent"
                />
              </span>
              <span className="mt-2 text-xs leading-relaxed text-ink-muted">
                {section.description}
              </span>
              <span className="mt-4 block border-t border-border-subtle pt-3.5">
                <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-ink-subtle">
                  You can
                </span>
                <ul className="mt-2 space-y-1">
                  {section.canDo.map((ability) => (
                    <li key={ability} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/60" aria-hidden="true" />
                      {ability}
                    </li>
                  ))}
                </ul>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Time-of-day greeting for the dashboard header. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
