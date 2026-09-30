/**
 * Availability for a date.
 *
 * `GET /api/reservations/available-slots?date=2026-06-01&partySize=4&zone=INDOOR`
 *
 * Read-only and unauthenticated, because the booking flow needs it before a
 * guest has an account. It reveals nothing a guest could not work out by
 * phoning, and it is rate limited anyway so it cannot be used to enumerate the
 * book.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getAvailability } from "@/lib/availability";
import { getSettings } from "@/lib/settings";
import { fail, handle } from "@/lib/api";
import { clientIp, limit } from "@/lib/rate-limit";
import { ZONES, type Zone } from "@/lib/constants";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"),
  partySize: z.coerce.number().int().min(1).max(30),
  zone: z.enum(ZONES).optional(),
  /**
   * 30 minutes is the default; 15 is offered for the larger tables so a guest
   * can book a tighter fit. The difference is real, because the dining window
   * is what decides whether a table can take a second sitting.
   */
  granularity: z.coerce.number().refine((n) => n === 15 || n === 30, "Use 15 or 30").default(30),
});

export async function GET(request: Request) {
  return handle(async () => {
    // Generous compared to booking: a guest flipping through dates and party
    // sizes makes many of these in a few seconds, and none of them cost money.
    const ip = clientIp(request.headers);
    const rate = await limit(`slots:${ip}`, 120, 60);
    if (!rate.success) {
      return fail("Too many requests. Please slow down.", {
        status: 429,
        code: "RATE_LIMITED",
      });
    }

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid request", { status: 422 });
    }

    const { date, partySize, zone, granularity } = parsed.data;
    const settings = await getSettings();

    if (partySize > settings.maxPartySize) {
      return fail(
        `For parties larger than ${settings.maxPartySize}, please call us so we can plan the room properly.`,
        { status: 422, code: "TOO_LARGE" },
      );
    }

    const result = await getAvailability(
      { date, partySize, zonePref: (zone ?? null) as Zone | null, granularity: granularity as 15 | 30 },
      {
        timezone: settings.timezone,
        openingHours: settings.openingHours,
        diningDurationMin: settings.diningDurationMin,
      },
    );

    return NextResponse.json(
      { ok: true, data: result },
      {
        // Short: availability is the one thing that genuinely changes minute by
        // minute, and a stale slot list is what produces a failed booking.
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  });
}
