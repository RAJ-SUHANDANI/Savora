/**
 * Account profile.
 *
 * The signed-in home screen. It exists so that "logged in" is a state with a
 * destination rather than just a different header — signing in previously took
 * you to a list of bookings and nothing else, which made the account feel like a
 * receipt archive rather than a place you belonged.
 *
 * The lifetime numbers at the top are the reason to come here. They are four
 * aggregates over rows this user already owns, so they are free to compute and
 * impossible to leak anyone else's: every filter is on `userId`, taken from the
 * verified session, never from a parameter.
 */
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarHeart,
  Clock3,
  Heart,
  Mail,
  Phone,
  UserRound,
  Users,
} from "lucide-react";

import { PasswordForm, ProfileDetailsForm } from "@/components/account/profile-forms";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate, pluralise } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your details",
  description: "Your Savora account: contact details, password, and a summary of your visits.",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const user = await currentUser();
  // The layout already redirected; this narrows the type, it is not the guard.
  if (!user) return null;

  const settings = await getSettings();
  const now = new Date();

  /**
   * Four counts, one `groupBy`.
   *
   * Not four `count()` calls: each would be its own round trip, and the four
   * filters differ only in the status they match. Grouping reads the user's rows
   * once and buckets them in memory. The set that counts as "visited" excludes
   * `CANCELLED` and `NO_SHOW` — a guest who cancelled at the last minute has
   * not eaten here, and a dashboard that claimed otherwise would be both wrong
   * and insulting.
   */
  const byStatus = await prisma.reservation.groupBy({
    by: ["status"],
    where: { userId: user.id },
    _count: { _all: true },
  });

  const counts = new Map(byStatus.map((row) => [row.status, row._count._all]));
  const totalBookings = byStatus.reduce((sum, row) => sum + row._count._all, 0);
  const eaten = totalBookings - (counts.get("CANCELLED") ?? 0) - (counts.get("NO_SHOW") ?? 0);

  const [cancelled, nextVisit, favourites, profile] = await Promise.all([
    prisma.reservation.findFirst({
      where: { userId: user.id, status: "CANCELLED" },
      orderBy: { startsAt: "desc" },
      select: { date: true, time: true },
    }),
    prisma.reservation.findFirst({
      where: { userId: user.id, startsAt: { gte: now }, status: { in: ["PENDING", "CONFIRMED"] } },
      orderBy: { startsAt: "asc" },
      select: { date: true, time: true, partySize: true },
    }),
    prisma.favorite.count({ where: { userId: user.id } }),
    /**
     * The session's user object carries `id`, `name`, `email` and `role` and
     * nothing else, because that is all the JWT holds. `phone` is not in it, so
     * the form's default value has to come from the row. Reading it here rather
     * than adding it to the token is deliberate: it keeps the token small, and a
     * stale phone in a JWT would silently repopulate the form with last
     * quarter's number.
     */
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { phone: true, createdAt: true },
    }),
  ]);

  /**
   * `date` is a `@db.Date` column, so Prisma hands back a `Date` pinned to
   * midnight UTC. Reading its ISO date directly is correct — and, unlike
   * re-deriving the business date from `startsAt` through the timezone, immune
   * to the BST problem that `startsAt` would have.
   */
  const iso = (dbDate: Date) => dbDate.toISOString().slice(0, 10);

  const memberFor = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(profile.createdAt);

  const stats = [
    {
      icon: Users,
      label: "Visits to Savora",
      value: eaten,
      note: eaten === 0 ? "Your first one is a table away" : `across ${totalBookings} bookings`,
    },
    {
      icon: CalendarHeart,
      label: "Booked with us",
      value: totalBookings,
      note: totalBookings === 0 ? "nothing booked yet" : pluralise(totalBookings, "booking", "bookings"),
    },
    {
      icon: Clock3,
      label: "Next visit",
      value: null,
      note: nextVisit
        ? `${formatDate(iso(nextVisit.date))} at ${nextVisit.time} · ${pluralise(nextVisit.partySize, "cover", "covers")}`
        : "nothing booked",
    },
    {
      icon: Heart,
      label: "Dishes saved",
      value: favourites,
      note: favourites === 0 ? "none yet" : `from the ${settings.name} menu`,
    },
  ] as const;

  return (
    <div className="space-y-8">
      {/* Lifetime summary. Four fixed cells, so a four-column grid at lg and a
          two-by-two below — never a single column, which would push the forms
          a full screen down. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border-subtle bg-border-subtle lg:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, note }) => (
          <div key={label} className="bg-surface p-5 md:p-6">
            <dt className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
              <Icon size={13} aria-hidden="true" className="text-accent" />
              {label}
            </dt>
            <dd className="mt-3">
              {value === null ? (
                <span className="font-display text-2xl leading-tight md:text-3xl">—</span>
              ) : (
                <span className="font-display text-3xl leading-none tabular-nums md:text-4xl">
                  {value}
                </span>
              )}
              <span className="mt-2 block text-xs leading-relaxed text-ink-muted">{note}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <ProfileDetailsForm defaultName={user.name ?? ""} defaultPhone={profile.phone ?? ""} />
        <PasswordForm />
      </div>

      {/* Read-only identity, plus the reasons the email cannot be changed here.
          Showing it in a disabled-looking field with no explanation reads as an
          oversight; showing it with the reason reads as a decision. */}
      <section className="surface-raised rounded-2xl p-6 md:p-8">
        <h2 className="font-display text-xl">Account</h2>
        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="flex gap-3">
            <Mail size={15} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-[0.16em] text-ink-subtle">Email</dt>
              <dd className="mt-1.5 truncate text-sm">{user.email}</dd>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-subtle">
                The sign-in address for this account, and the one every confirmation
                goes to. Changing it means verifying the new address first, so ask
                us and we will sort it out.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Phone size={15} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-[0.16em] text-ink-subtle">
                On file with the restaurant
              </dt>
              <dd className="mt-1.5 text-sm">{settings.phone}</dd>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-subtle">
                If a booking needs moving, this reaches a host directly. Prefer that
                to the contact form for anything urgent.
              </p>
            </div>
          </div>
        </dl>

        {cancelled ? (
          <p className="mt-6 rounded-xl border border-border-subtle bg-surface-raised/60 px-4 py-3 text-xs leading-relaxed text-ink-muted">
            Your most recent cancellation was {formatDate(iso(cancelled.date))} at{" "}
            {cancelled.time}. Cancellations stay on your record because they are part of
            your history &mdash; but they are not counted as visits, and they do not
            affect your standing with us.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3 border-t border-border-subtle pt-6">
          <Link href="/account" className="btn btn-ghost btn-sm">
            <CalendarHeart size={14} aria-hidden="true" /> My bookings
          </Link>
          <Link href="/account/favourites" className="btn btn-ghost btn-sm">
            <Heart size={14} aria-hidden="true" /> Saved dishes
          </Link>
          <Link href="/reserve" className="btn btn-primary btn-sm">
            Book a table <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <p className="flex items-start gap-3 text-sm leading-relaxed text-ink-subtle">
        <UserRound size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Signed in as {user.email}, an account since {memberFor}. This page is private
          to you &mdash; nothing here is visible to other guests, and the
          restaurant&rsquo;s staff see only what they need in order to seat you.{" "}
          {nextVisit
            ? `Your next table is booked for ${formatDate(iso(nextVisit.date))} at ${nextVisit.time}.`
            : "Nothing booked yet &mdash; we would love to see you."}
        </span>
      </p>
    </div>
  );
}
