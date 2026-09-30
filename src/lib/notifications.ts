import { after } from "next/server";
import { sendEmail } from "./email";
import { bookingAmended, bookingCancelled, bookingConfirmation, bookingReminder } from "./email-templates";
import { prisma } from "./db";
import type { Zone } from "./constants";

/**
 * Notification side-effects for the reservation lifecycle.
 *
 * Every function is fire-and-forget: called after the database write has
 * committed, and never allowed to fail the request. `after()` from Next.js is
 * used so the work continues after the response is sent, without keeping the
 * visitor waiting on a mail server.
 *
 * All of it degrades gracefully. With no email provider configured, messages
 * are written to `.outbox/` and browsable at /dev/outbox — so the emails can be
 * designed and reviewed for free, and the code paths are identical to the ones
 * that will send in production.
 */

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000"
  );
}

type ReservationForEmail = {
  id: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  date: Date;
  time: string;
  partySize: number;
  confirmationCode: string;
  manageToken: string;
  specialRequests: string | null;
  occasion: string | null;
  table: { number: number; zone: string } | null;
};

function toTemplateData(r: ReservationForEmail) {
  const dateIso = r.date.toISOString().slice(0, 10);
  return {
    guestName: r.guestName,
    dateIso,
    time: r.time,
    partySize: r.partySize,
    tableNumber: r.table?.number ?? null,
    zone: (r.table?.zone as Zone | undefined) ?? null,
    confirmationCode: r.confirmationCode,
    manageUrl: `${baseUrl()}/manage/${r.manageToken}`,
    specialRequests: r.specialRequests,
    occasion: r.occasion,
  };
}

const RESERVATION_SELECT = {
  id: true,
  guestName: true,
  guestEmail: true,
  guestPhone: true,
  date: true,
  time: true,
  partySize: true,
  confirmationCode: true,
  manageToken: true,
  specialRequests: true,
  occasion: true,
  table: { select: { number: true, zone: true } },
} as const;

/** Fires the confirmation email after a successful booking. */
export function queueBookingConfirmation(reservationId: string) {
  after(async () => {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: RESERVATION_SELECT,
    });
    if (!reservation) return;

    const template = bookingConfirmation(toTemplateData(reservation));
    await sendEmail({
      to: reservation.guestEmail,
      toName: reservation.guestName,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [{ name: "type", value: "confirmation" }],
    });
  });
}

/** Fires when a guest cancels. */
export function queueBookingCancelled(reservationId: string) {
  after(async () => {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: RESERVATION_SELECT,
    });
    if (!reservation) return;

    const template = bookingCancelled(toTemplateData(reservation));
    await sendEmail({
      to: reservation.guestEmail,
      toName: reservation.guestName,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [{ name: "type", value: "cancellation" }],
    });
  });
}

/** Fires when the owner amends a booking, listing what actually changed. */
export function queueBookingAmended(reservationId: string, changes: string[]) {
  if (changes.length === 0) return;
  after(async () => {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: RESERVATION_SELECT,
    });
    if (!reservation) return;

    const template = bookingAmended({ ...toTemplateData(reservation), changes });
    await sendEmail({
      to: reservation.guestEmail,
      toName: reservation.guestName,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [{ name: "type", value: "amendment" }],
    });
  });
}

/**
 * Sends reminders for every booking starting in the next `withinHours`.
 *
 * Intended to be called from a Vercel Cron job (`/api/cron/reminders`, hourly)
 * and from `npm run reminders` in development. Idempotent by design: a booking
 * with `reminderSentAt` already set is skipped, so running the job twice cannot
 * send a guest two reminders.
 */
export async function sendDueReminders(options?: { withinHours?: number; now?: Date }) {
  const withinHours = options?.withinHours ?? 25;
  const now = options?.now ?? new Date();
  const horizon = new Date(now.getTime() + withinHours * 3_600_000);

  const due = await prisma.reservation.findMany({
    where: {
      startsAt: { gt: now, lte: horizon },
      status: { in: ["CONFIRMED", "PENDING"] },
      reminderSentAt: null,
    },
    select: RESERVATION_SELECT,
    take: 200,
  });

  let sent = 0;
  for (const reservation of due) {
    const template = bookingReminder(toTemplateData(reservation));
    await sendEmail({
      to: reservation.guestEmail,
      toName: reservation.guestName,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [{ name: "type", value: "reminder" }],
    });
    // Marked after send so a transient failure leaves it eligible for retry
    // rather than silently dropping the reminder.
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { reminderSentAt: new Date() },
    });
    sent++;
  }

  return { due: due.length, sent };
}

/**
 * Sweeps past PENDING bookings that were never confirmed.
 *
 * PENDING is the state a staff-created booking sits in. Anything that has come
 * and gone without being seated is marked NO_SHOW so the dashboard's numbers
 * stay honest and a night manager can see the miss.
 */
export async function reconcilePastBookings(now = new Date()) {
  const stale = await prisma.reservation.findMany({
    where: {
      endsAt: { lt: now },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { id: true, status: true },
    take: 500,
  });

  let updated = 0;
  for (const booking of stale) {
    await prisma.reservation.update({
      where: { id: booking.id },
      data: { status: booking.status === "PENDING" ? "NO_SHOW" : "COMPLETED" },
    });
    updated++;
  }
  return { reconciled: updated };
}
