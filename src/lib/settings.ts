/**
 * Server-side settings access.
 *
 * Restaurant settings are a single row read on nearly every page, so:
 *   * `cache()` deduplicates within a render pass — a page that reads settings
 *     in the layout, the nav and the footer issues one query, not three;
 *   * `fetchSettingsRow()` goes through the repository because `openingHours`
 *     is jsonb, which Prisma 7 cannot type (see settings-repo.ts).
 */
import { cache } from "react";
import type { OpeningHours } from "./constants";
import { prisma } from "./db";
import { fetchSettingsRow, type SavoraSettings } from "./settings-repo";

export type { SavoraSettings };
export type Settings = SavoraSettings;

/** Sensible defaults so the site renders even before the first seed run. */
export const DEFAULT_SETTINGS: SavoraSettings = {
  id: 1,
  name: "Savora",
  tagline: "Seasonal Mediterranean cooking in the heart of the city",
  address: "18 Alder Lane, Colchester, CO1 1SP",
  phone: "+44 1206 555 0188",
  email: "reservations@savora.example",
  openingHours: {
    mon: [],
    tue: [["18:00", "22:00"]],
    wed: [["18:00", "22:00"]],
    thu: [["12:00", "14:30"], ["18:00", "22:00"]],
    fri: [["12:00", "14:30"], ["18:00", "23:00"]],
    sat: [["12:00", "15:00"], ["18:00", "23:00"]],
    sun: [["12:00", "16:00"]],
  } satisfies OpeningHours,
  holidays: [],
  maxPartySize: 12,
  bookingWindowDays: 30,
  diningDurationMin: 90,
  holdDurationMin: 10,
  minNoticeHours: 2,
  timezone: "Europe/London",
  currency: "GBP",
  isAcceptingReservations: true,
  updatedAt: new Date(0),
};

export const getSettings = cache(async (): Promise<SavoraSettings> => {
  const row = await fetchSettingsRow();
  if (row) return row;

  // Creating the singleton on first read means a fresh clone works without
  // running the seed, which is a far kinder failure mode than a 500.
  try {
    await prisma.restaurantSettings.create({
      data: {
        id: 1,
        openingHours: undefined as never,
      } as never,
    });
  } catch (error) {
    console.error("Failed to create settings row, falling back to default:", error);
    return DEFAULT_SETTINGS;
  }
  return (await fetchSettingsRow()) ?? DEFAULT_SETTINGS;
});

export function openingHoursOf(settings: SavoraSettings): OpeningHours {
  return settings.openingHours ?? {};
}
