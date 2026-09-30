/**
 * Create a reservation.
 *
 * `POST /api/reservations`
 *
 * The only write path a guest can reach, so it is the most defended endpoint in
 * the app. The order matters and is deliberate:
 *
 *   1. Rate limit, *before* any work — the cheapest possible rejection.
 *   2. Honeypot, before parsing anything expensive.
 *   3. Schema validation, so the database never sees a malformed row.
 *   4. The write itself, which is guarded by the database exclusion constraint.
 *
 * `createReservation` returns a discriminated union rather than throwing, so a
 * double-booking is a 409 with copy a guest can act on — "that time was just
 * taken, here are the next three" — not a 500.
 */
import { NextResponse } from "next/server";

import { createReservation } from "@/lib/reservations";
import { createReservationSchema } from "@/lib/validation";
import { getSettings } from "@/lib/settings";
import { currentUser } from "@/lib/auth";
import { fail, guardReservationRateLimit, handle, ok, validationError } from "@/lib/api";
import { queueBookingConfirmation } from "@/lib/notifications";
import { getAvailability } from "@/lib/availability";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const limited = await guardReservationRateLimit(request);
    if (limited) return limited;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("Expected a JSON body", { status: 400 });
    }

    // The honeypot field is `max(0)`, so Zod rejects it — but checking first
    // means a bot gets a generic rejection rather than per-field validation
    // detail that tells it which field gave it away.
    const raw = body as Record<string, unknown> | null;
    if (raw && typeof raw.website === "string" && raw.website.length > 0) {
      // Respond as though it succeeded: a bot that gets an error will try the
      // field again, one that gets a 200 will move on.
      return ok({ ignored: true });
    }

    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const settings = await getSettings();
    const user = await currentUser();

    const result = await createReservation(parsed.data, {
      timezone: settings.timezone,
      diningDurationMin: settings.diningDurationMin,
      maxPartySize: settings.maxPartySize,
      bookingWindowDays: settings.bookingWindowDays,
      minNoticeHours: settings.minNoticeHours,
      holidays: settings.holidays,
      isAcceptingReservations: settings.isAcceptingReservations,
    }, { userId: user?.id ?? null });

    if (!result.ok) {
      // On a conflict, offer the next few genuinely-free times rather than just
      // saying no. This is the difference between a guest retrying and a guest
      // phoning in a bad mood.
      let suggestedTimes: string[] | undefined;
      if (result.code === "CONFLICT" || result.code === "NO_TABLES") {
        const availability = await getAvailability(
          { date: parsed.data.date, partySize: parsed.data.partySize, zonePref: parsed.data.zonePref },
          {
            timezone: settings.timezone,
            openingHours: settings.openingHours,
            diningDurationMin: settings.diningDurationMin,
          },
        );
        suggestedTimes = availability.slots
          .filter((s) => s.available && s.time !== parsed.data.time)
          .slice(0, 4)
          .map((s) => s.time);
      }

      const status = result.code === "TOO_LARGE" || result.code === "CLOSED" ? 422 : 409;
      return NextResponse.json(
        {
          ok: false,
          error: result.message,
          code: result.code,
          suggestedTimes,
        },
        { status },
      );
    }

    // Confirmation email goes out after the response is on the wire. `after()`
    // keeps it off the critical path, so a slow mail provider cannot make the
    // booking feel broken — and `sendEmail` never throws, so it cannot fail
    // the booking either.
    queueBookingConfirmation(result.reservation.id);

    return ok({ reservation: result.reservation }, { status: 201 });
  });
}
