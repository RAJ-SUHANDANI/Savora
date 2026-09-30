/**
 * Manage a booking with its link.
 *
 * `/manage/<id>?token=<manageToken>`
 *
 * This is the counterpart to the confirmation email: a guest who never made an
 * account can still change their mind. The `manageToken` is a 32-character
 * random value generated at booking time, and it is the sole credential — there
 * is no session, no magic-link round trip, and no password reset flow for a
 * guest who only ever booked once.
 *
 * That has consequences worth being deliberate about, and they are why the page
 * is written the way it is:
 *
 *   * **`noindex`, always.** The URL may *be* the credential, and a shared link
 *     (chat, email forward) hands over full control of the booking it points at.
 *   * **A wrong token and an unknown booking look identical.** A distinct
 *     "not your booking" page would confirm the id exists, which is a small but
 *     free oracle. Both render the same not-found state.
 *   * **The token is not required.** A booking's owner reaches this page
 *     through their session, and `/account` links here without a query string,
 *     so the credential never has to travel in a link the site generates. It is
 *     read only when it is actually needed to answer the request, and it is
 *     never passed down to a component.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Clock, Mail, MapPin, Phone, Users } from "lucide-react";

import { PublicShell } from "@/components/layout/public-shell";
import { ManageActions } from "@/components/reserve/manage-actions";
import { EmptyInbox } from "@/components/ui/empty-state";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { currentUser } from "@/lib/auth";
import { utcToZonedTime } from "@/lib/datetime";
import { siteConfig } from "@/lib/site-config";
import { CANCELABLE_STATUSES, STATUS_LABELS, ZONE_LABELS, type ReservationStatus, type Zone } from "@/lib/constants";
import { formatDate, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your booking",
  description: "View, change or cancel your reservation at Savora.",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function ManageBookingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { token } = await searchParams;
  const credential = Array.isArray(token) ? token[0] : token;

  const [settings, user] = await Promise.all([getSettings(), currentUser()]);

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      manageToken: true,
      confirmationCode: true,
      date: true,
      time: true,
      startsAt: true,
      endsAt: true,
      partySize: true,
      status: true,
      occasion: true,
      specialRequests: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      cancelReason: true,
      zonePref: true,
      table: { select: { number: true, capacity: true, zone: true } },
    },
  });

  /**
   * Three ways in, and all three must be silent about the ones that failed:
   *
   *   * staff, through the session;
   *   * the guest who made the booking, matched on `userId` — this is what lets
   *     `/account` link straight here without ever handling the token, so the
   *     credential stays in the email where it belongs;
   *   * whoever is holding the token, from the emailed link.
   *
   * The owner branch is matched on the `userId` column and never on
   * `guestEmail`, for the same reason the API does it that way: an address typed
   * into a booking form is a claim, not a proof of identity.
   */
  const isStaff = user?.role === "ADMIN";
  const isOwner = Boolean(user) && reservation?.userId === user!.id;
  const hasToken = Boolean(credential) && reservation?.manageToken === credential;
  const authorised = Boolean(reservation) && (isStaff || isOwner || hasToken);

  if (!reservation || !authorised) {
    return (
      <PublicShell>
        <div className="container-editorial py-20 md:py-28">
          <EmptyInbox
            title="We cannot find that booking"
            description="The link may have been truncated when it was forwarded, or it may already have been cancelled. Booking links look like this: savora.example/manage/…?token=…"
            action={{ href: "/reserve", label: "Book a new table" }}
            secondaryAction={{ href: "/contact", label: "Contact us" }}
          />
        </div>
      </PublicShell>
    );
  }

  /**
   * The token is only passed on when the guest arrived *with* it. An owner
   * arriving from `/account` gets none, because there is nothing for them to
   * prove — and not shipping a live credential into a page that did not need
   * one is the whole reason the owner branch exists.
   */
  const forwardedToken = hasToken ? credential! : null;

  const status = reservation.status as ReservationStatus;
  const statusLabel = STATUS_LABELS[status] ?? reservation.status;
  const cancelled = status === "CANCELLED";
  const bookingDate = reservation.date.toISOString().slice(0, 10);

  /**
   * `endsAt` is a real UTC instant, so it has to be converted back into the
   * restaurant's wall clock before it means anything to a guest. Reading
   * `getUTCHours()` off it directly would be an hour wrong for most of the year.
   */
  const endsAtLocal = utcToZonedTime(reservation.endsAt.toISOString(), settings.timezone);

  return (
    <PublicShell>
      <div className="container-editorial py-16 md:py-24">
        <div className="mx-auto max-w-2xl">
          {/* ---- Status banner ---------------------------------------- */}
          <div className="text-center">
            <p className="eyebrow">Reservation {reservation.confirmationCode}</p>
            <h1 className="mt-4 font-display text-display-md">
              {cancelled
                ? "This booking is cancelled"
                : `${firstName(reservation.guestName)}, your table is booked.`}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              {cancelled
                ? reservation.cancelReason
                  ? `Cancelled — ${reservation.cancelReason.toLowerCase()}.`
                  : "This table has been released and the kitchen has been told."
                : `Confirmed for ${formatDate(bookingDate)} at ${formatTime(reservation.time)}.`}
            </p>
          </div>

          {/* ---- The booking ------------------------------------------- */}
          <div className="card mt-10 overflow-hidden">
            <div className="border-b border-border-subtle bg-surface-raised/60 px-7 py-6 text-center">
              <p className="eyebrow">{formatDate(bookingDate)}</p>
              <p className="mt-2 font-display text-4xl">{formatTime(reservation.time)}</p>
              <p className="mt-2 text-sm text-ink-muted">
                Your table is yours from {formatTime(reservation.time)} until about{" "}
                {formatTime(endsAtLocal.time)}
              </p>
            </div>

            <dl className="divide-y divide-border-subtle">
              <Row icon={<Users size={15} />} label="Party">
                {reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}
                {reservation.table ? (
                  <span className="mt-0.5 block text-ink-muted">
                    Table {reservation.table.number}
                    {reservation.table.zone
                      ? ` · ${ZONE_LABELS[reservation.table.zone as Zone] ?? reservation.table.zone}`
                      : ""}
                  </span>
                ) : null}
              </Row>
              {reservation.zonePref ? (
                <Row icon={<MapPin size={15} />} label="Seating requested">
                  {ZONE_LABELS[reservation.zonePref as Zone] ?? reservation.zonePref}
                </Row>
              ) : null}
              <Row icon={<MapPin size={15} />} label="Where">
                {settings.name}
                <span className="mt-0.5 block text-ink-muted">{settings.address}</span>
              </Row>
              <Row icon={<Mail size={15} />} label="Confirmation sent to">
                {reservation.guestEmail}
                {reservation.guestPhone ? (
                  <span className="mt-0.5 block text-ink-muted">{reservation.guestPhone}</span>
                ) : null}
              </Row>
              {reservation.occasion ? (
                <Row icon={<CalendarCheck size={15} />} label="Occasion">
                  {reservation.occasion}
                </Row>
              ) : null}
              {reservation.specialRequests ? (
                <Row icon={<Clock size={15} />} label="Your requests">
                  {reservation.specialRequests}
                </Row>
              ) : null}
            </dl>
          </div>

          {/* ---- Actions ------------------------------------------------ */}
          <div className="mt-9">
            <ManageActions
              id={reservation.id}
              token={forwardedToken}
              status={status}
              statusLabel={statusLabel}
            />
          </div>

          {!cancelled && CANCELABLE_STATUSES.includes(status) ? (
            <p className="mt-7 text-sm leading-relaxed text-ink-muted">
              Need a different time rather than a cancellation?{" "}
              <Link href="/reserve" className="link-underline text-accent">
                Book another table
              </Link>{" "}
              and telephone us on{" "}
              <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="link-underline text-accent">
                {settings.phone}
              </a>{" "}
              — we will release this one at the same time.
            </p>
          ) : null}

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-ink-muted">
            <Link href="/menu" className="link-underline">
              Read the menu
            </Link>
            <Link href="/about" className="link-underline">
              About Savora
            </Link>
            <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="link-underline inline-flex items-center gap-1.5">
              <Phone size={13} aria-hidden="true" />
              {settings.phone}
            </a>
            <a
              href={siteConfig.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="link-underline inline-flex items-center gap-1"
            >
              Directions
              <ArrowRight size={13} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 px-7 py-4">
      <span className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs uppercase tracking-[0.12em] text-ink-subtle">{label}</dt>
        <dd className="mt-1 text-sm leading-relaxed break-words">{children}</dd>
      </div>
    </div>
  );
}

/** "Ida Lindqvist" -> "Ida". A booking is personal; this is a small welcome. */
function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}
