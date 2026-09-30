/**
 * Reservation write path — the part that has to be correct.
 *
 * Responsibilities, in order:
 *   1. Reject bookings that break a business rule (closed, too large, past,
 *      beyond the booking window) with a message a guest can act on.
 *   2. Pick the best-fit table for the requested window.
 *   3. Insert inside a transaction and let the database have the final say.
 *
 * On (3): a transaction alone is *not* sufficient. `SELECT ... FOR UPDATE`
 * serialises writers on one database, but the availability check and the insert
 * would still have to happen atomically, and on serverless there may be several
 * application instances. So the correctness comes from the GiST exclusion
 * constraint on `Reservation.slot` (see the migration). We attempt optimistically
 * and, on a retryable conflict (SQLSTATE 23P01, or the occasional 40P01/40001
 * deadlock that concurrent inserts into the same GiST index can produce), re-read
 * and retry with the next-best table. The constraint is the lock; the transaction
 * is just tidiness.
 */
import { loadDayContext, pickTable, type TableLike } from "./availability";
import { BLOCKING_STATUSES } from "./constants";
import { isRetryableConflict, prisma } from "./db";
import { zonedTimeToUtc } from "./datetime";
import type { CreateReservationInput } from "./validation";

export type CreateReservationResult =
  | { ok: true; reservation: CreatedReservation }
  | { ok: false; code: ReservationFailureCode; message: string; suggestedTimes?: string[] };

export type ReservationFailureCode =
  | "NO_TABLES"
  | "PAST_SLOT"
  | "TOO_LARGE"
  | "CLOSED"
  | "HOLIDAY"
  | "CONFLICT"
  | "INVALID_WINDOW";

export type CreatedReservation = {
  id: string;
  date: string;
  time: string;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  status: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  confirmationCode: string;
  manageToken: string;
  table: { id: string; number: number; capacity: number; zone: string } | null;
};

export type ReservationSettings = {
  timezone: string;
  diningDurationMin: number;
  maxPartySize: number;
  bookingWindowDays: number;
  minNoticeHours: number;
  holidays: string[];
  isAcceptingReservations: boolean;
};

/** How many times to re-pick a table after a constraint violation. */
const MAX_ATTEMPTS = 8;

/** Confirmation codes avoid vowels and ambiguous glyphs — read aloud at the door. */
const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ23456789";

function generateConfirmationCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function generateManageToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Business-rule gate. Returns a failure, or null when the request may proceed. */
export function validateBookingRules(
  input: Pick<CreateReservationInput, "date" | "time" | "partySize">,
  settings: ReservationSettings,
): { ok: false; code: ReservationFailureCode; message: string } | null {
  if (!settings.isAcceptingReservations) {
    return {
      ok: false,
      code: "CLOSED",
      message: "We are not taking online reservations at the moment. Please call the restaurant instead.",
    };
  }

  if (input.partySize > settings.maxPartySize) {
    return {
      ok: false,
      code: "TOO_LARGE",
      message: `For parties larger than ${settings.maxPartySize}, please call us so we can plan the room properly.`,
    };
  }

  if (settings.holidays.includes(input.date)) {
    return { ok: false, code: "HOLIDAY", message: "We are closed on that date. Please choose another day." };
  }

  const now = new Date();
  const startsAt = zonedTimeToUtc(input.date, input.time, settings.timezone);

  if (startsAt.getTime() <= now.getTime()) {
    return { ok: false, code: "PAST_SLOT", message: "That time has already passed." };
  }

  // Same-day minimum notice.
  if (
    input.date === now.toISOString().slice(0, 10) &&
    startsAt.getTime() - now.getTime() < settings.minNoticeHours * 3_600_000
  ) {
    return {
      ok: false,
      code: "PAST_SLOT",
      message: `We ask for at least ${settings.minNoticeHours} hours' notice for same-day bookings.`,
    };
  }

  // Booking window — how far ahead guests may book.
  const maxIso = new Date(now.getTime() + settings.bookingWindowDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (input.date > maxIso) {
    return {
      ok: false,
      code: "INVALID_WINDOW",
      message: `Reservations open ${settings.bookingWindowDays} days in advance.`,
    };
  }

  return null;
}

/**
 * Creates a reservation and assigns a table.
 *
 * Returns a discriminated union rather than throwing: every failure here is an
 * expected business outcome the UI must explain to a guest, not an exception.
 */
export async function createReservation(
  input: CreateReservationInput,
  settings: ReservationSettings,
  options: { userId?: string | null; tableId?: string | null; createdByAdmin?: boolean } = {},
): Promise<CreateReservationResult> {
  const rule = validateBookingRules(input, settings);
  if (rule) return rule;

  const startsAt = zonedTimeToUtc(input.date, input.time, settings.timezone);
  const endsAt = new Date(startsAt.getTime() + settings.diningDurationMin * 60_000);

  let { busy, tables } = await loadDayContext({
    dateIso: input.date,
    timezone: settings.timezone,
  });

  // A staff member may pin a specific table; a guest never can.
  let targetTableId: string | null = options.tableId ?? null;

  if (targetTableId) {
    const target = tables.find((t) => t.id === targetTableId) as TableLike | undefined;
    if (!target) {
      return { ok: false, code: "NO_TABLES", message: "That table is not available." };
    }
    if (target.capacity < input.partySize) {
      return {
        ok: false,
        code: "NO_TABLES",
        message: `Table ${target.number} seats ${target.capacity}, which is too small for a party of ${input.partySize}.`,
      };
    }
    const clash = busy.some(
      (b) => b.tableId === target.id && b.startsAt < endsAt && startsAt < b.endsAt,
    );
    if (clash) {
      return {
        ok: false,
        code: "CONFLICT",
        message: `Table ${target.number} is already booked at that time.`,
      };
    }
  } else {
    const chosen = pickTable({
      tables,
      busy,
      partySize: input.partySize,
      startsAt,
      endsAt,
      preferredZone: input.zonePref ?? null,
    });
    if (!chosen) {
      return {
        ok: false,
        code: "NO_TABLES",
        message: "Every table suitable for your party is taken at that time. Please try another slot.",
      };
    }
    targetTableId = chosen.id;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const created = await prisma.reservation.create({
        data: {
          date: new Date(`${input.date}T00:00:00.000Z`),
          time: input.time,
          startsAt,
          endsAt,
          partySize: input.partySize,
          // Guest bookings are confirmed immediately; PENDING is reserved for
          // staff-created bookings that still need a deposit or a call.
          status: options.createdByAdmin ? "PENDING" : "CONFIRMED",
          zonePref: (input.zonePref ?? null) as never,
          specialRequests: input.specialRequests || null,
          occasion: input.occasion || null,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone || null,
          userId: options.userId ?? null,
          tableId: targetTableId,
          confirmationCode: generateConfirmationCode(),
          manageToken: generateManageToken(),
          // `slot` is intentionally absent: it is GENERATED ALWAYS, so
          // PostgreSQL derives the tstzrange from startsAt/endsAt itself. Letting
          // the database own it means the range can never drift from the
          // timestamps the exclusion constraint actually protects.
        },
        include: { table: { select: { id: true, number: true, capacity: true, zone: true } } },
      });

      return {
        ok: true,
        reservation: {
          id: created.id,
          date: input.date,
          time: created.time,
          startsAt: created.startsAt,
          endsAt: created.endsAt,
          partySize: created.partySize,
          status: created.status,
          guestName: created.guestName,
          guestEmail: created.guestEmail,
          guestPhone: created.guestPhone,
          confirmationCode: created.confirmationCode,
          manageToken: created.manageToken,
          table: created.table,
        },
      };
    } catch (err) {
      if (!isRetryableConflict(err)) throw err;

      // Somebody claimed that table between our read and our write. Re-read the
      // day and try the next-best table, excluding the one that just lost.
      const refreshed = await loadDayContext({ dateIso: input.date, timezone: settings.timezone });
      busy = refreshed.busy;
      tables = refreshed.tables;

      const next = pickTable({
        tables,
        busy,
        partySize: input.partySize,
        startsAt,
        endsAt,
        preferredZone: input.zonePref ?? null,
        excludeTableIds: targetTableId ? [targetTableId] : [],
      });

      if (!next) {
        return {
          ok: false,
          code: "NO_TABLES",
          message: "That time was just taken. Please choose another slot.",
        };
      }
      targetTableId = next.id;
    }
  }

  return {
    ok: false,
    code: "CONFLICT",
    message: "We could not complete that booking. Please try again.",
  };
}

/** Statuses that stop a booking from occupying its table. */
export const ACTIVE_STATUSES = BLOCKING_STATUSES;
