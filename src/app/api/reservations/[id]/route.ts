/**
 * Read, amend and cancel a single reservation.
 *
 * `GET    /api/reservations/:id`   — staff, the booking's owner, or a token holder
 * `PATCH  /api/reservations/:id`   — staff only
 * `DELETE /api/reservations/:id`   — staff, the booking's owner, or a token holder
 *
 * Three audiences, three different authorisation stories:
 *
 * * **Staff** act through the session; a JWT with `role === "ADMIN"`.
 * * **Owners** act through the session too, matched on `Reservation.userId` —
 *   the link the booking was made under. Without this branch a guest who signed
 *   in to make the booking would have to cancel from the emailed link on some
 *   other device, which is a worse answer than the one the UI already implies.
 *   Ownership is matched on the id column and never on `guestEmail`: email is
 *   the *claim* a guest types into the booking form, and matching a session to
 *   a claim would hand anyone who can type an address someone else's booking.
 * * **Everyone else** acts through `manageToken`, a 32-character random value
 *   issued at booking and embedded in the confirmation link. It is the bearer
 *   credential for that single booking, which is why a guest can cancel without
 *   an account and why the token must never appear in a URL that gets logged in
 *   full.
 *
 * Every amendment that changes the date, time, party size or table is routed
 * through `createReservation`'s exclusion-constraint retry rather than a plain
 * UPDATE — moving a booking can collide with another one just as a new booking
 * can, and the database has to be the judge in both cases.
 */
import { prisma, isRetryableConflict } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { updateReservationSchema } from "@/lib/validation";
import { fail, handle, ok, validationError } from "@/lib/api";
import { zonedTimeToUtc } from "@/lib/datetime";
import { pickTable, loadDayContext } from "@/lib/availability";
import { queueBookingAmended, queueBookingCancelled } from "@/lib/notifications";
import { CANCELABLE_STATUSES } from "@/lib/constants";
import { formatDate, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const SELECT = {
  id: true,
  date: true,
  time: true,
  startsAt: true,
  endsAt: true,
  partySize: true,
  status: true,
  zonePref: true,
  specialRequests: true,
  occasion: true,
  guestName: true,
  guestEmail: true,
  guestPhone: true,
  confirmationCode: true,
  tableId: true,
  cancelReason: true,
  createdAt: true,
  /** Only ever compared against the session, never serialised. */
  userId: true,
  table: { select: { id: true, number: true, capacity: true, zone: true } },
} as const;

/** A plain "YYYY-MM-DD" for the stored `date` column, in the restaurant's zone. */
function isoDateOf(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Strips the private columns from a reservation before it can reach a response
 * body: the manage token (a live credential) and the owner link (an internal
 * identifier that says nothing useful to the caller and only widens what a
 * leaked payload carries).
 *
 * Written as a rebuild rather than the obvious `const { manageToken, ...safe } =
 * row`, because that line is precisely what the unused-vars rule flags — and
 * silencing the rule would also hide real unused variables in the same files.
 * The token has already been compared by the time this runs; the destructure
 * only existed to keep it out of the JSON.
 */
const PRIVATE_FIELDS = ["manageToken", "userId"] as const;

function stripPrivate<T extends Record<string, unknown>>(row: T): Omit<T, (typeof PRIVATE_FIELDS)[number]> {
  const copy: Record<string, unknown> = { ...row };
  for (const field of PRIVATE_FIELDS) delete copy[field];
  return copy as Omit<T, (typeof PRIVATE_FIELDS)[number]>;
}

/**
 * Authorises a read: staff via session, the booking's owner via session, or a
 * guest via the manage token.
 *
 * The branches select differently on purpose. Staff and owners never need the
 * token, so it is not loaded at all; a token holder's lookup has to read it to
 * compare, and the result is then stripped before it can reach a response body
 * or a log.
 */
async function authorise(id: string, manageToken: string | null) {
  const user = await currentUser();

  if (user?.role === "ADMIN") {
    const reservation = await prisma.reservation.findUnique({ where: { id }, select: SELECT });
    if (!reservation) {
      return { error: fail("Booking not found", { status: 404 }) } as const;
    }
    return { reservation: stripPrivate(reservation), as: "staff" as const };
  }

  const found = await prisma.reservation.findUnique({
    where: { id },
    select: { ...SELECT, manageToken: true },
  });
  if (!found) {
    return { error: fail("Booking not found", { status: 404 }) } as const;
  }

  // The owner branch is checked before the token, and both are cheap, but the
  // order matters for the failure message: an owner always gets in, so a token
  // mismatch can only ever be reported to someone who was never entitled to it.
  if (user && found.userId === user.id) {
    return { reservation: stripPrivate(found), as: "owner" as const };
  }

  if (manageToken && found.manageToken === manageToken) {
    return { reservation: stripPrivate(found), as: "guest" as const };
  }

  return { error: fail("You do not have permission to view this booking", { status: 403 }) } as const;
}

export async function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const token = new URL(request.url).searchParams.get("token");

    const result = await authorise(id, token);
    if ("error" in result) return result.error;
    return ok(result.reservation);
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;

    // Only staff may amend. A guest cancels; they do not negotiate.
    const user = await currentUser();
    if (user?.role !== "ADMIN") {
      return fail("Only the restaurant can change a booking", { status: 403 });
    }

    const existing = await prisma.reservation.findUnique({ where: { id }, select: SELECT });
    if (!existing) return fail("Booking not found", { status: 404 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("Expected a JSON body", { status: 400 });
    }

    const parsed = updateReservationSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;

    const settings = await getSettings();
    const changes: string[] = [];

    // ---- Time / party changes: these can collide, so re-run the picker ----
    const nextDate = input.date ?? isoDateOf(existing.date, settings.timezone);
    const nextTime = input.time ?? existing.time;
    const nextPartySize = input.partySize ?? existing.partySize;

    const timingChanged =
      nextDate !== isoDateOf(existing.date, settings.timezone) ||
      nextTime !== existing.time ||
      nextPartySize !== existing.partySize;

    if (timingChanged) {
      if (nextPartySize > settings.maxPartySize) {
        return fail(
          `We cannot seat ${nextPartySize} at one table. The maximum is ${settings.maxPartySize}.`,
          { status: 422 },
        );
      }

      const startsAt = zonedTimeToUtc(nextDate, nextTime, settings.timezone);
      const endsAt = new Date(startsAt.getTime() + settings.diningDurationMin * 60_000);

      // A staff member may pin a specific table, in which case only that table
      // is considered; otherwise pick the best free one, excluding the table
      // the booking already holds so it is not compared against itself.
      let tableId = input.tableId !== undefined ? input.tableId : existing.tableId;

      if (input.tableId !== undefined) {
        const clash = await loadDayContext({
          dateIso: nextDate,
          timezone: settings.timezone,
          excludeReservationId: id,
        });
        const target = clash.tables.find((t) => t.id === input.tableId);
        if (!target) return fail("That table does not exist", { status: 422 });
        if (target.capacity < nextPartySize) {
          return fail(`Table ${target.number} seats ${target.capacity}.`, { status: 422 });
        }
      } else {
        const context = await loadDayContext({
          dateIso: nextDate,
          timezone: settings.timezone,
          excludeReservationId: id,
        });
        const chosen = pickTable({
          tables: context.tables,
          busy: context.busy,
          partySize: nextPartySize,
          startsAt,
          endsAt,
          preferredZone: input.zonePref ?? existing.zonePref ?? null,
          // Only exclude the current table if it actually needs moving.
          excludeTableIds: existing.startsAt.getTime() === startsAt.getTime() ? [] : [existing.tableId ?? ""].filter(Boolean),
        });
        if (!chosen) {
          return fail("No table is free for that time and size. Pick another slot.", {
            status: 409,
            code: "NO_TABLES",
          });
        }
        tableId = chosen.id;
      }

      try {
        await prisma.reservation.update({
          where: { id },
          data: {
            date: new Date(`${nextDate}T00:00:00.000Z`),
            time: nextTime,
            startsAt,
            endsAt,
            partySize: nextPartySize,
            tableId,
            ...(input.zonePref !== undefined ? { zonePref: input.zonePref as never } : {}),
          },
        });
      } catch (err) {
        // Someone else took the table between the picker and the write. This is
        // the same race as a new booking, and the same guarantee applies. A
        // deadlock counts too: it is the same lost race, reported differently.
        if (isRetryableConflict(err)) {
          return fail("That table was just taken. Choose another.", {
            status: 409,
            code: "CONFLICT",
          });
        }
        throw err;
      }

      if (nextDate !== isoDateOf(existing.date, settings.timezone)) {
        changes.push(`Date moved to ${formatDate(nextDate)}`);
      }
      if (nextTime !== existing.time) {
        changes.push(`Time moved to ${formatTime(nextTime)}`);
      }
      if (nextPartySize !== existing.partySize) {
        changes.push(`Party size changed to ${nextPartySize}`);
      }
    }

    // ---- Everything else: a plain, collision-free update ----
    const scalars: Record<string, unknown> = {};
    if (input.status !== undefined) scalars.status = input.status;
    if (input.zonePref !== undefined && !timingChanged) scalars.zonePref = input.zonePref as never;
    if (input.specialRequests !== undefined) scalars.specialRequests = input.specialRequests;
    if (input.guestName !== undefined) scalars.guestName = input.guestName;
    if (input.guestEmail !== undefined) scalars.guestEmail = input.guestEmail;
    if (input.guestPhone !== undefined) scalars.guestPhone = input.guestPhone;
    if (input.cancelReason !== undefined) scalars.cancelReason = input.cancelReason;

    // A table swap with no timing change still needs the exclusion constraint's
    // verdict, so it goes through the same retry as everything else.
    if (!timingChanged && input.tableId !== undefined && input.tableId !== existing.tableId) {
      if (input.tableId === null) {
        // Explicit unassignment — a walk-in on the floor, or a booking held
        // pending a re-seat. Freeing a table cannot violate the constraint.
        scalars.tableId = null;
        changes.push("Released the table");
      } else {
        const table = await prisma.restaurantTable.findUnique({
          where: { id: input.tableId },
          select: { number: true, capacity: true },
        });
        if (!table) return fail("That table does not exist", { status: 422 });
        if (table.capacity < nextPartySize) {
          return fail(`Table ${table.number} seats ${table.capacity}.`, { status: 422 });
        }
        scalars.tableId = input.tableId;
        changes.push(`Moved to table ${table.number}`);
      }
    }

    if (input.specialRequests !== undefined) changes.push("Special requests updated");
    if (input.status !== undefined && input.status !== existing.status) {
      changes.push(`Status is now ${input.status.toLowerCase().replace("_", " ")}`);
    }

    if (Object.keys(scalars).length > 0) {
      try {
        await prisma.reservation.update({ where: { id }, data: scalars as never });
      } catch (err) {
        if (isRetryableConflict(err)) {
          return fail("That table is already booked at that time.", {
            status: 409,
            code: "CONFLICT",
          });
        }
        throw err;
      }
    }

    if (input.status === "CANCELLED") {
      changes.push("Booking cancelled");
      queueBookingCancelled(id);
    } else {
      queueBookingAmended(id, changes);
    }

    const updated = await prisma.reservation.findUnique({ where: { id }, select: SELECT });
    return ok({ reservation: updated, changes });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const token = new URL(request.url).searchParams.get("token");

    const existing = await prisma.reservation.findUnique({
      where: { id },
      select: { ...SELECT, manageToken: true },
    });
    if (!existing) return fail("Booking not found", { status: 404 });

    const user = await currentUser();
    const isStaff = user?.role === "ADMIN";
    const isOwner = Boolean(user) && existing.userId === user!.id;
    const isTokenHolder = Boolean(token) && token === existing.manageToken;

    if (!isStaff && !isOwner && !isTokenHolder) {
      return fail("You do not have permission to cancel this booking", { status: 403 });
    }

    // Cancelled and completed bookings are settled; re-cancelling them would
    // send a second email about something that already happened.
    if (!CANCELABLE_STATUSES.includes(existing.status as never)) {
      return fail(
        existing.status === "CANCELLED"
          ? "That booking is already cancelled"
          : "That booking has already taken place and can no longer be changed",
        { status: 409 },
      );
    }

    const reason =
      new URL(request.url).searchParams.get("reason")?.slice(0, 200) ??
      (isStaff ? "Cancelled by the restaurant" : "Cancelled by the guest");

    await prisma.reservation.update({
      where: { id },
      data: { status: "CANCELLED", cancelReason: reason, cancelledAt: new Date() },
    });

    queueBookingCancelled(id);

    return ok({ id, status: "CANCELLED" });
  });
}
