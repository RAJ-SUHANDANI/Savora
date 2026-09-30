/**
 * A reservation, as a guest sees it on their own dashboard.
 *
 * Two columns at the top: the date and time set in the display face, because
 * that is the only thing on the card that has to be readable from across a
 * table, and the party size on the right as a quiet counter. Everything else is
 * deliberately small and secondary — a guest checking whether they are still
 * coming does not need the table number, but they do need it if they are about
 * to ask for it.
 *
 * This is a server component. The only interactive part is the cancel button,
 * which is its own client island, so the list stays out of the client bundle
 * no matter how many bookings are on it.
 */
import Link from "next/link";
import { ArrowRight, MapPin, Users } from "lucide-react";

import { CancelReservationButton } from "@/components/account/cancel-reservation-button";
import { CANCELABLE_STATUSES, STATUS_LABELS, ZONE_LABELS, type ReservationStatus, type Zone } from "@/lib/constants";
import { cn, formatDate, formatTime, relativeDayLabel } from "@/lib/format";

/** The projection the account page passes in. Keeps the card usable from a query. */
export type AccountReservation = {
  id: string;
  confirmationCode: string;
  /** Business date as `YYYY-MM-DD` in the restaurant's zone. */
  dateIso: string;
  time: string;
  partySize: number;
  status: string;
  zonePref: string | null;
  occasion: string | null;
  specialRequests: string | null;
  table: { number: number; zone: string | null } | null;
};

/**
 * Status colour is carried by a class rather than an inline style so it picks up
 * the dark-mode palette, and is defined in one place because the same six
 * statuses appear in the admin dashboard and in the confirmation email.
 */
const STATUS_TONE: Record<ReservationStatus, string> = {
  PENDING: "bg-saffron/12 text-saffron border-saffron/25",
  CONFIRMED: "bg-olive/12 text-olive border-olive/25",
  SEATED: "bg-accent/12 text-accent border-accent/25",
  COMPLETED: "bg-surface-sunken text-ink-subtle border-border-subtle",
  CANCELLED: "bg-wine/10 text-wine border-wine/25",
  NO_SHOW: "bg-wine/10 text-wine border-wine/25",
};

export function AccountReservationCard({
  reservation,
  today,
}: {
  reservation: AccountReservation;
  /** Today's business date, so "Tonight" can be said without shipping a clock. */
  today: string;
}) {
  const status = reservation.status as ReservationStatus;
  const cancelable = CANCELABLE_STATUSES.includes(status);
  const settled = status === "COMPLETED" || status === "NO_SHOW" || status === "CANCELLED";

  return (
    <article
      className={cn(
        "card card-hover p-6 sm:p-7",
        // A settled booking is history, not a live obligation. Dimming it is
        // the cheapest honest signal and needs no extra legend.
        settled && "opacity-75 hover:opacity-100",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow">
            {reservation.confirmationCode}
            {reservation.occasion ? ` · ${reservation.occasion}` : ""}
          </p>
          <h3 className="mt-2.5 font-display text-display-md">{formatTime(reservation.time)}</h3>
          <p className="mt-1.5 text-sm text-ink-muted">
            {relativeDayLabel(reservation.dateIso, today)}
            <span className="mx-2 text-ink-subtle" aria-hidden="true">
              ·
            </span>
            {formatDate(reservation.dateIso)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
            <Users size={14} className="text-ink-subtle" aria-hidden="true" />
            <span className="tabular-nums">{reservation.partySize}</span>
          </span>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              STATUS_TONE[status] ?? STATUS_TONE.PENDING,
            )}
          >
            {STATUS_LABELS[status] ?? reservation.status}
          </span>
        </div>
      </div>

      {reservation.specialRequests || reservation.zonePref || reservation.table ? (
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-subtle">
          {reservation.table ? (
            <span>Table {reservation.table.number}</span>
          ) : null}
          {reservation.zonePref ? (
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} aria-hidden="true" />
              {ZONE_LABELS[reservation.zonePref as Zone] ?? reservation.zonePref}
            </span>
          ) : null}
          {reservation.specialRequests ? (
            <span className="line-clamp-1 min-w-0 basis-full sm:basis-auto">{reservation.specialRequests}</span>
          ) : null}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5">
        <Link
          href={`/manage/${reservation.id}`}
          className="link-underline inline-flex items-center gap-1.5 text-sm text-accent"
        >
          View the details
          <ArrowRight size={13} aria-hidden="true" />
        </Link>

        {cancelable ? (
          <CancelReservationButton id={reservation.id} />
        ) : (
          <p className="text-xs text-ink-subtle">
            {status === "CANCELLED"
              ? "This table was released."
              : "This booking has already taken place."}
          </p>
        )}
      </div>
    </article>
  );
}
