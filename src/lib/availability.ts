/**
 * Availability engine.
 *
 * Given a date, a party size and an optional zone preference, decide which
 * start times are bookable and which table each would use.
 *
 * Design notes, because this is the part that has to be right:
 *
 * 1. **One query, not N.** All bookings for the day are fetched in a single
 *    round trip and bucketed by table. The naive version re-queries inside a
 *    slot loop, which is O(slots x tables) round trips.
 *
 * 2. **Whole-window overlap.** A candidate is only offered if
 *    [start, start+duration) is *entirely* clear. A table that frees up at
 *    20:15 is not usable for a 19:30 party that wants 90 minutes. Ranges are
 *    half-open, so a 20:30 party can follow a 19:00–20:30 booking exactly.
 *
 * 3. **Advisory, not authoritative.** This function says what *looks* bookable.
 *    The database exclusion constraint (see the migration) is what makes
 *    double bookings impossible; `createReservation` catches its violation and
 *    retries with the next-best table. Splitting the responsibilities this way
 *    keeps this code pure and fast while the guarantee stays absolute.
 *
 * 4. **Smallest table that fits.** A room should not seat a couple on a twelve
 *    -top because it is technically free.
 */
import { BLOCKING_STATUSES } from "./constants";
import { generateSlotTimes, zonedTimeToUtc } from "./datetime";
import { prisma } from "./db";
import type { OpeningHours } from "./constants";

/** Minimal shapes so this module never imports the generated Prisma types. */
export type BusyInterval = {
  reservationId: string;
  tableId: string;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  status: string;
};

export type TableLike = {
  id: string;
  number: number;
  capacity: number;
  zone: string;
  isActive: boolean;
};

export type SlotResult = {
  time: string;
  startsAt: Date;
  endsAt: Date;
  available: boolean;
  /** Tables exist that fit the party, but all are taken. */
  soldOut: boolean;
  suggestedTableId: string | null;
  suggestedTableNumber: number | null;
  tablesFree: number;
  isLastTable: boolean;
  reason?: "closed" | "fully-booked" | "past" | "no-suitable-table";
};

export type AvailabilityOptions = {
  /**
   * Note there is deliberately no `durationMin` here. By the time slots reach
   * `computeAvailability` each one already carries its own `endsAt`, computed by
   * the caller from the restaurant's dining duration. Passing the duration as
   * well would create two sources of truth for the same thing, and a caller
   * that disagreed with itself would get a slot whose window is not the one
   * that gets checked for overlaps.
   */
  preferredZone?: string | null;
  excludeTableIds?: string[];
  now?: Date;
};

/** Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd). */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Ranks candidate tables: preferred zone first, then smallest that fits, then
 * table number for a stable, predictable assignment.
 */
export function rankTables(
  candidates: TableLike[],
  preferredZone?: string | null,
): TableLike[] {
  return [...candidates].sort((a, b) => {
    if (preferredZone) {
      const aMatch = a.zone === preferredZone ? 0 : 1;
      const bMatch = b.zone === preferredZone ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    if (a.capacity !== b.capacity) return a.capacity - b.capacity;
    return a.number - b.number;
  });
}

/** Buckets bookings by table, dropping anything with no table assigned. */
function bucketByTable(busy: BusyInterval[]): Map<string, BusyInterval[]> {
  const byTable = new Map<string, BusyInterval[]>();
  for (const b of busy) {
    if (!b.tableId) continue;
    const list = byTable.get(b.tableId);
    if (list) list.push(b);
    else byTable.set(b.tableId, [b]);
  }
  return byTable;
}

/** Pure: availability for a set of already-resolved candidate slots. */
export function computeAvailability(params: {
  slots: { time: string; startsAt: Date; endsAt: Date }[];
  tables: TableLike[];
  busy: BusyInterval[];
  partySize: number;
  options?: AvailabilityOptions;
}): SlotResult[] {
  const { slots, tables, busy, partySize } = params;
  const { preferredZone, excludeTableIds = [], now } = params.options ?? {};

  const excluded = new Set(excludeTableIds);
  const active = tables.filter((t) => t.isActive);

  // Tables that could seat this party at all, ignoring occupancy. Kept
  // separate from "free" so we can tell a guest "we are full" rather than the
  // more alarming "we cannot seat you".
  const fits = active.filter((t) => t.capacity >= partySize && !excluded.has(t.id));
  const busyByTable = bucketByTable(busy);

  return slots.map<SlotResult>(({ time, startsAt, endsAt }) => {
    const base: SlotResult = {
      time,
      startsAt,
      endsAt,
      available: false,
      soldOut: false,
      suggestedTableId: null,
      suggestedTableNumber: null,
      tablesFree: 0,
      isLastTable: false,
    };

    if (fits.length === 0) {
      return { ...base, reason: "no-suitable-table" };
    }
    if (now && startsAt.getTime() <= now.getTime()) {
      return { ...base, reason: "past" };
    }

    const free = rankTables(fits, preferredZone).filter((table) => {
      const bookings = busyByTable.get(table.id);
      if (!bookings || bookings.length === 0) return true;
      return !bookings.some((b) => overlaps(startsAt, endsAt, b.startsAt, b.endsAt));
    });

    if (free.length === 0) {
      return { ...base, tablesFree: 0, soldOut: true, reason: "fully-booked" };
    }

    const chosen = free[0];
    return {
      ...base,
      available: true,
      tablesFree: free.length,
      suggestedTableId: chosen.id,
      suggestedTableNumber: chosen.number,
      isLastTable: free.length === 1,
    };
  });
}

/**
 * Best free table for a specific booking, used at write time.
 * Returns null when nothing fits, so the caller can produce a clean 409.
 */
export function pickTable(params: {
  tables: TableLike[];
  busy: BusyInterval[];
  partySize: number;
  startsAt: Date;
  endsAt: Date;
  preferredZone?: string | null;
  excludeTableIds?: string[];
}): TableLike | null {
  const { tables, busy, partySize, startsAt, endsAt, preferredZone, excludeTableIds = [] } = params;
  const excluded = new Set(excludeTableIds);
  const busyByTable = bucketByTable(busy);

  const candidates = rankTables(
    tables.filter((t) => t.isActive && t.capacity >= partySize && !excluded.has(t.id)),
    preferredZone,
  );

  for (const table of candidates) {
    const bookings = busyByTable.get(table.id) ?? [];
    if (!bookings.some((b) => overlaps(startsAt, endsAt, b.startsAt, b.endsAt))) return table;
  }
  return null;
}

/**
 * Loads a single wide window of bookings around a day, plus the active tables.
 *
 * The window is deliberately wider than the day: a party seated at 23:00 the
 * previous evening can still be occupying a table at 01:00, and a late seating
 * spills past midnight. Without the padding, the first slot of the morning
 * looks free when it is not.
 */
export async function loadDayContext(params: {
  dateIso: string;
  timezone: string;
  excludeReservationId?: string;
}): Promise<{ busy: BusyInterval[]; tables: TableLike[] }> {
  const { dateIso, timezone, excludeReservationId } = params;

  // Midday anchors rather than midnight: on a spring-forward day 00:00 does not
  // exist in the local zone, and `zonedTimeToUtc` resolves it forward to 01:00 —
  // which would silently shift the window. Noon always exists.
  const prev = zonedTimeToUtc(dateIso, "12:00", timezone);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const next = zonedTimeToUtc(dateIso, "12:00", timezone);
  next.setUTCDate(next.getUTCDate() + 1);

  const [reservations, tables] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        startsAt: { gte: prev, lt: next },
        status: { in: BLOCKING_STATUSES as never },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
      select: { id: true, tableId: true, startsAt: true, endsAt: true, partySize: true, status: true },
    }),
    prisma.restaurantTable.findMany({
      where: { isActive: true },
      orderBy: { number: "asc" },
    }),
  ]);

  return {
    busy: reservations
      .filter((r): r is typeof r & { tableId: string } => r.tableId !== null)
      .map((r) => ({
        reservationId: r.id,
        tableId: r.tableId,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        partySize: r.partySize,
        status: r.status,
      })),
    tables: tables.map((t) => ({
      id: t.id,
      number: t.number,
      capacity: t.capacity,
      zone: t.zone,
      isActive: t.isActive,
    })),
  };
}

/** Public availability for a date, for the booking flow's slot grid. */
export async function getAvailability(
  query: {
    date: string;
    partySize: number;
    zonePref?: string | null;
    excludeReservationId?: string;
    granularity?: 30 | 15;
  },
  settings: {
    timezone: string;
    openingHours: OpeningHours;
    diningDurationMin: number;
  },
) {
  const times = generateSlotTimes(
    settings.openingHours,
    query.date,
    settings.diningDurationMin,
    query.granularity ?? 30,
  );

  const slots = times.map((time) => {
    const startsAt = zonedTimeToUtc(query.date, time, settings.timezone);
    return {
      time,
      startsAt,
      endsAt: new Date(startsAt.getTime() + settings.diningDurationMin * 60_000),
    };
  });

  const { busy, tables } = await loadDayContext({
    dateIso: query.date,
    timezone: settings.timezone,
    excludeReservationId: query.excludeReservationId,
  });

  const results = computeAvailability({
    slots,
    tables,
    busy,
    partySize: query.partySize,
    options: {
      preferredZone: query.zonePref ?? null,
      now: new Date(),
    },
  });

  return {
    slots: results,
    partySize: query.partySize,
    /** Tables that could physically take this party — powers "fully booked" copy. */
    suitableTables: tables.filter((t) => t.capacity >= query.partySize).length,
    openTimes: times,
  };
}
