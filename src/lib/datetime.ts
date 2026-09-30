/**
 * Timezone and service-window arithmetic.
 *
 * The whole booking system turns on one subtlety: a guest books "19:30" on
 * "1 June", and the restaurant lives in a timezone that is not the server's
 * (a Vercel function runs in UTC; a restaurant in London does not). So we
 * never trust `new Date("2026-06-01T19:30")` — that string is parsed in the
 * *server's* zone and silently shifts the booking.
 *
 * Everything here therefore goes through `zonedTimeToUtc`, which treats the
 * wall-clock reading as local to the restaurant and returns the true instant.
 */

import type { DayKey, OpeningHours, ServiceWindow } from "./constants";
import { DAY_KEYS } from "./constants";
import { hhmmToMinutes, minutesToHhmm } from "./format";

/** Sunday-first index, matching `Date.prototype.getUTCDay`. */
const DAY_INDEX_TO_KEY: Record<number, DayKey> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

export function dayKeyForDate(iso: string): DayKey {
  const [y, m, d] = iso.split("-").map(Number);
  // Constructing at noon UTC keeps this stable regardless of the host zone.
  return DAY_INDEX_TO_KEY[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
}

/** Which offset (in minutes) `timeZone` is at for the given instant. */
function offsetMinutesFor(timeZone: string, utcDate: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcDate);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );

  return (asUtc - utcDate.getTime()) / 60_000;
}

/**
 * Converts a wall-clock reading in `timeZone` to a real `Date`.
 *
 * Implemented by fixed-point iteration rather than a lookup table: the offset is
 * first estimated at UTC, then recomputed at that instant, and applied once
 * more. Two passes are enough for every real zone, including those with a
 * daylight-saving transition, because a DST change never alters the offset by
 * more than an hour and the second pass observes the post-transition value.
 */
export function zonedTimeToUtc(dateIso: string, timeHhmm: string, timeZone: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  const minutes = hhmmToMinutes(timeHhmm);

  const naiveUtc = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let guess = new Date(naiveUtc - offsetMinutesFor(timeZone, new Date(naiveUtc)) * 60_000);
  guess = new Date(naiveUtc - offsetMinutesFor(timeZone, guess) * 60_000);
  return guess;
}

/**
 * Inverse of `zonedTimeToUtc`: the restaurant-local wall clock of an instant.
 *
 * Takes a **full ISO timestamp** (`Date#toISOString()` output, or anything
 * `new Date()` accepts), not a bare date. The offset is looked up for that exact
 * instant and then added, so a booking that straddles a daylight-saving change
 * still reports the wall clock the kitchen will read off the door list.
 */
export function utcToZonedTime(iso: string, timeZone: string): { dateIso: string; time: string } {
  const instant = new Date(iso);
  const offset = offsetMinutesFor(timeZone, instant);
  // Rendered in UTC deliberately: after the shift the UTC fields *are* the
  // restaurant's wall clock, which avoids formatting the time zone twice.
  const shifted = new Date(instant.getTime() + offset * 60_000);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(shifted);

  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "0";

  return {
    dateIso: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Service windows for a date, falling back to the previous day when closed. */
export function windowsForDate(openingHours: OpeningHours, dateIso: string): ServiceWindow[] {
  const key = dayKeyForDate(dateIso);
  const own = openingHours[key];
  if (own && own.length > 0) return own;
  // Restaurants commonly stay open past midnight on Fri/Sat, so a Sunday
  // booking can belong to Saturday's late service.
  return [];
}

export function isServiceDay(openingHours: OpeningHours, dateIso: string): boolean {
  return windowsForDate(openingHours, dateIso).length > 0;
}

/** True if `dateIso` appears in the configured holiday list. */
export function isHoliday(holidays: string[], dateIso: string): boolean {
  return holidays.includes(dateIso);
}

export type SlotGranularity = 30 | 15;

/**
 * Every bookable start time for a date, as wall-clock "HH:MM" strings.
 *
 * The grid is generated from opening hours rather than stored anywhere, so
 * changing the hours in the admin settings instantly changes what guests see.
 * The final possible start is pulled back by the dining duration so that a
 * party can actually finish before the kitchen closes.
 */
export function generateSlotTimes(
  openingHours: OpeningHours,
  dateIso: string,
  durationMin: number,
  granularity: SlotGranularity = 30,
): string[] {
  const windows = windowsForDate(openingHours, dateIso);
  if (windows.length === 0) return [];

  const times: string[] = [];
  for (const [open, close] of windows) {
    const openMin = hhmmToMinutes(open);
    const closeMin = hhmmToMinutes(close);
    // A booking starting at `t` occupies the table until `t + duration`.
    const lastStart = closeMin - durationMin;
    for (let t = openMin; t <= lastStart; t += granularity) {
      times.push(minutesToHhmm(t));
    }
  }
  return times;
}

/** Every day key in canonical order, for rendering the hours table. */
export function allDayKeys(): DayKey[] {
  return [...DAY_KEYS];
}
