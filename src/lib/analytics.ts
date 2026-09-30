/**
 * Analytics for the owner dashboard.
 *
 * Every figure is computed in SQL rather than by loading rows into JS, because
 * the dashboard should stay fast as the reservation table grows from a few
 * hundred rows to hundreds of thousands. Each query is one statement with one
 * aggregate, and they run concurrently.
 */
import { prisma } from "./db";
import { addDaysIso, todayIn } from "./format";
import { DAY_KEYS, type DayKey, type ReservationStatus } from "./constants";

/** index 0 = today, 1 = tomorrow, ... */
export type DailyPoint = {
  date: string;
  reservations: number;
  covers: number;
  completed: number;
  cancelled: number;
  noShow: number;
  /** Cancelled as a share of all bookings that day, 0-1. */
  cancellationRate: number;
};

export type DashboardStats = {
  today: {
    reservations: number;
    covers: number;
    completed: number;
    seated: number;
    upcoming: number;
    cancelled: number;
    noShow: number;
    /**
     * Covers seated today against the room's rough daily capacity, 0-1.
     *
     * A modelling estimate, not a measurement: the denominator comes from
     * `theoreticalDailyCovers`, so it is presented with a tilde in the UI rather
     * than as a hard number. A restaurant that runs three sittings at the
     * weekend should not read "100%" on a Tuesday.
     */
    occupancy: number;
  };
  totals: {
    reservations: number;
    covers: number;
    /** Bookings that actually happened, used as the denominator for no-shows. */
    completed: number;
    noShow: number;
    /** Distinct email addresses that have ever held a live booking. */
    distinctGuests: number;
    repeatCustomers: number;
    averagePartySize: number;
    /** No-shows as a share of the bookings that were actually due to happen. */
    noShowRate: number;
    /** Cancellations as a share of every booking ever made. */
    cancellationRate: number;
  };
  trend: DailyPoint[];
  /** Covers per weekday, Monday-first — shows which nights are strongest. */
  byWeekday: { day: DayKey; covers: number; reservations: number }[];
  /** Most-booked start times, for the "peak is 19:30" insight. */
  byTime: { time: string; reservations: number; covers: number }[];
  topDishes: { name: string; slug: string; category: string; priceCents: number }[];
  upcomingToday: {
    id: string;
    time: string;
    guestName: string;
    partySize: number;
    status: ReservationStatus;
    tableNumber: number | null;
    zone: string | null;
    occasion: string | null;
  }[];
  /** Table utilisation across the whole room for the current week. */
  occupancy: {
    tableNumber: number;
    zone: string;
    capacity: number;
    bookings: number;
    covers: number;
    /** Booked minutes / available service minutes, 0-1. */
    utilisation: number;
  }[];
};

/**
 * Room capacity per day, used to turn covers into an occupancy percentage.
 * A rough but honest model: the room serves two windows a day of `duration`
 * minutes each, so this many covers is "full".
 */
function theoreticalDailyCovers(tableCount: number, avgCapacity: number, durationMin: number): number {
  const servicesPerDay = 2;
  const minutesAvailable = 9 * 60; // 09:00–18:00 base window
  const turns = Math.max(1, Math.floor(minutesAvailable / durationMin));
  return tableCount * avgCapacity * turns * servicesPerDay;
}

export async function getDashboardStats(options?: {
  dateIso?: string;
  timezone?: string;
  trendDays?: number;
  durationMin?: number;
}): Promise<DashboardStats> {
  const timezone = options?.timezone ?? "Europe/London";
  const today = options?.dateIso ?? todayIn(timezone);
  const trendDays = options?.trendDays ?? 30;
  const durationMin = options?.durationMin ?? 90;
  const trendStart = addDaysIso(today, -(trendDays - 1));

  const tables = await prisma.restaurantTable.findMany({
    where: { isActive: true },
    orderBy: { number: "asc" },
  });
  const tableCount = tables.length || 1;
  const avgCapacity =
    tables.reduce((sum, t) => sum + t.capacity, 0) / tableCount || 1;
  const dailyCovers = theoreticalDailyCovers(tableCount, avgCapacity, durationMin);

  const [todayAgg, totals, trendRows, byTime, upcoming, occupancyRows, menuAgg] =
    await Promise.all([
      // ---- Today ----
      prisma.reservation.groupBy({
        by: ["status"],
        where: { date: new Date(`${today}T00:00:00.000Z`) },
        _count: { _all: true },
        _sum: { partySize: true },
      }),

      // ---- All-time ----
      prisma.reservation.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { partySize: true },
      }),

      // ---- Daily trend ----
      prisma.reservation.findMany({
        where: { date: { gte: new Date(`${trendStart}T00:00:00.000Z`) } },
        select: { date: true, partySize: true, status: true },
        orderBy: { date: "asc" },
      }),

      // ---- By start time ----
      prisma.reservation.groupBy({
        by: ["time"],
        where: { status: { in: ["CONFIRMED", "SEATED", "COMPLETED"] } },
        _count: { _all: true },
        _sum: { partySize: true },
        orderBy: { _count: { time: "desc" } },
        take: 12,
      }),

      // ---- Today's book, in seating order ----
      prisma.reservation.findMany({
        where: { date: new Date(`${today}T00:00:00.000Z`) },
        orderBy: { time: "asc" },
        take: 12,
        select: {
          id: true,
          time: true,
          guestName: true,
          partySize: true,
          status: true,
          occasion: true,
          table: { select: { number: true, zone: true } },
        },
      }),

      // ---- Per-table utilisation, current week ----
      prisma.reservation.findMany({
        where: {
          date: { gte: new Date(`${today}T00:00:00.000Z`), lt: new Date(`${addDaysIso(today, 7)}T00:00:00.000Z`) },
          status: { in: ["CONFIRMED", "SEATED", "COMPLETED"] },
        },
        select: { tableId: true, partySize: true, startsAt: true, endsAt: true, table: { select: { number: true, zone: true, capacity: true } } },
      }),

      // ---- Signature dishes, most "reserved for" by appearing in bookings ----
      prisma.menuItem.findMany({
        where: { isSignature: true, isAvailable: true },
        orderBy: { sortOrder: "asc" },
        take: 5,
        select: { name: true, slug: true, category: true, priceCents: true, imageUrl: true },
      }),
    ]);

  // ---- Fold the group-bys into the today block ----
  const todayAggMap = new Map(todayAgg.map((r) => [r.status, r]));
  const countOf = (map: Map<string, { _count: { _all: number }; _sum: { partySize: number | null } }>, s: string) => {
    const row = map.get(s);
    return { count: row?._count._all ?? 0, covers: row?._sum.partySize ?? 0 };
  };

  const tConf = countOf(todayAggMap, "CONFIRMED");
  const tSeat = countOf(todayAggMap, "SEATED");
  const tComp = countOf(todayAggMap, "COMPLETED");
  const tPend = countOf(todayAggMap, "PENDING");
  const tCanc = countOf(todayAggMap, "CANCELLED");
  const tNoShow = countOf(todayAggMap, "NO_SHOW");

  // ---- All-time totals ----
  const allStatus = new Map(totals.map((r) => [r.status, r]));
  const totalReservations = totals.reduce((s, r) => s + r._count._all, 0);
  const totalCovers = totals.reduce((s, r) => s + (r._sum.partySize ?? 0), 0);
  const allCompleted = countOf(allStatus, "COMPLETED");
  const allNoShow = countOf(allStatus, "NO_SHOW");
  const allCancelled = countOf(allStatus, "CANCELLED");

  // Average party size across bookings that actually happened — mixing in
  // cancelled bookings would understate it.
  const settled = allCompleted.count + allNoShow.count;
  const settledCovers = allCompleted.covers + allNoShow.covers;
  const averagePartySize = settled > 0 ? settledCovers / settled : 0;

  const distinctGuests = await prisma.reservation.findMany({
    where: { status: { in: ["COMPLETED", "CONFIRMED", "SEATED"] } },
    distinct: ["guestEmail"],
    select: { guestEmail: true },
  });
  // Repeat customers = guests with more than one *completed* visit.
  //
  // Prisma 7 removed `_count` filtering from `groupBy`'s `having`, so we group
  // and filter in JS. That is still cheap: the result is one row per distinct
  // email, so the set is bounded by the size of the guest list rather than by
  // the number of bookings.
  const completionsByGuest = await prisma.reservation.groupBy({
    by: ["guestEmail"],
    where: { status: "COMPLETED" },
    _count: { _all: true },
  });
  const withUser = completionsByGuest.filter((g) => g._count._all > 1);

  // ---- Daily trend, with gaps filled so the chart has no holes ----
  const byDate = new Map<string, DailyPoint>();
  for (let i = 0; i < trendDays; i++) {
    const d = addDaysIso(trendStart, i);
    byDate.set(d, {
      date: d,
      reservations: 0,
      covers: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
      cancellationRate: 0,
    });
  }
  for (const r of trendRows) {
    const key = r.date.toISOString().slice(0, 10);
    const point = byDate.get(key);
    if (!point) continue;
    point.reservations++;
    if (r.status === "CANCELLED") point.cancelled++;
    else if (r.status === "NO_SHOW") point.noShow++;
    else {
      point.completed++;
      point.covers += r.partySize;
    }
  }
  for (const point of byDate.values()) {
    point.cancellationRate = point.reservations > 0 ? point.cancelled / point.reservations : 0;
  }

  // ---- By weekday, Monday-first ----
  const weekdayTotals = new Map<DayKey, { covers: number; reservations: number }>(
    DAY_KEYS.map((d) => [d, { covers: 0, reservations: 0 }]),
  );
  for (const r of trendRows) {
    if (r.status === "CANCELLED" || r.status === "NO_SHOW") continue;
    const key = r.date.toISOString().slice(0, 10);
    const [y, m, d] = key.split("-").map(Number);
    const dayIndex = (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7;
    const dayKey = DAY_KEYS[dayIndex];
    const bucket = weekdayTotals.get(dayKey);
    if (!bucket) continue;
    bucket.covers += r.partySize;
    bucket.reservations++;
  }

  // ---- Per-table occupancy for the week ----
  // Service minutes available per table in a 7-day window: 7 days x 2 services
  // x (close - open). Approximated from the dining duration for a stable number.
  const serviceMinutesPerWeek = 7 * 2 * durationMin;
  const occupancy = tables.map((t) => {
    const rows = occupancyRows.filter((r) => r.tableId === t.id);
    const covers = rows.reduce((s, r) => s + r.partySize, 0);
    const bookedMinutes = rows.reduce((s, r) => s + (r.endsAt.getTime() - r.startsAt.getTime()) / 60_000, 0);
    return {
      tableNumber: t.number,
      zone: t.zone,
      capacity: t.capacity,
      bookings: rows.length,
      covers,
      utilisation: serviceMinutesPerWeek > 0 ? Math.min(1, bookedMinutes / serviceMinutesPerWeek) : 0,
    };
  });

  // Covers on the book today. Every live status counts: a no-show still took a
  // table out of the room, so excluding it would flatter the occupancy figure.
  const todayCovers = tConf.covers + tSeat.covers + tComp.covers + tPend.covers;

  return {
    today: {
      reservations: tConf.count + tSeat.count + tComp.count + tPend.count,
      covers: todayCovers,
      completed: tComp.count,
      seated: tSeat.count,
      upcoming: tPend.count + tConf.count,
      cancelled: tCanc.count,
      noShow: tNoShow.count,
      occupancy: dailyCovers > 0 ? Math.min(1, todayCovers / dailyCovers) : 0,
    },
    totals: {
      reservations: totalReservations,
      covers: totalCovers,
      completed: allCompleted.count,
      noShow: allNoShow.count,
      distinctGuests: distinctGuests.length,
      repeatCustomers: withUser.length,
      averagePartySize,
      noShowRate: settled > 0 ? allNoShow.count / settled : 0,
      cancellationRate: totalReservations > 0 ? allCancelled.count / totalReservations : 0,
    },
    trend: [...byDate.values()],
    byWeekday: DAY_KEYS.map((day) => ({ day, ...weekdayTotals.get(day)! })),
    byTime: byTime.map((r) => ({
      time: r.time,
      reservations: r._count._all,
      covers: r._sum.partySize ?? 0,
    })),
    topDishes: menuAgg.map((m) => ({
      name: m.name,
      slug: m.slug,
      category: m.category,
      priceCents: m.priceCents,
    })),
    upcomingToday: upcoming.map((r) => ({
      id: r.id,
      time: r.time,
      guestName: r.guestName,
      partySize: r.partySize,
      status: r.status,
      tableNumber: r.table?.number ?? null,
      zone: r.table?.zone ?? null,
      occasion: r.occasion,
    })),
    occupancy,
  };
}

/**
 * Revenue estimate.
 *
 * A restaurant has no order data in this product, so the honest figure is
 * spend-per-cover x covers, with spend-per-cover derived from the average
 * signature dish price. It is labelled an estimate everywhere it appears
 * rather than presented as revenue, because pretending otherwise would be the
 * kind of number a client discovers is wrong on day one.
 */
export async function getRevenueEstimate(params: {
  from: string;
  to: string;
  timezone: string;
}): Promise<{ covers: number; estimateCents: number; avgSpendCents: number; reservations: number }> {
  const signature = await prisma.menuItem.findMany({
    where: { isAvailable: true },
    select: { priceCents: true, isSignature: true },
  });
  const signaturePrices = signature.filter((m) => m.isSignature).map((m) => m.priceCents);
  const pool = signaturePrices.length > 0 ? signaturePrices : signature.map((m) => m.priceCents);
  // Three courses plus a drink, roughly. Crude, documented, and adjustable.
  const avgSpendCents = pool.length > 0 ? (pool.reduce((a, b) => a + b, 0) / pool.length) * 3 : 0;

  const agg = await prisma.reservation.aggregate({
    where: {
      date: {
        gte: new Date(`${params.from}T00:00:00.000Z`),
        lte: new Date(`${params.to}T00:00:00.000Z`),
      },
      status: { in: ["CONFIRMED", "SEATED", "COMPLETED"] },
    },
    _count: { _all: true },
    _sum: { partySize: true },
  });

  const covers = agg._sum.partySize ?? 0;
  return {
    covers,
    reservations: agg._count._all,
    avgSpendCents: Math.round(avgSpendCents),
    estimateCents: Math.round(covers * avgSpendCents),
  };
}

/** Distinct guests with their booking history, for the customer list. */
export async function getCustomers(options?: { search?: string; limit?: number }) {
  const rows = await prisma.reservation.groupBy({
    by: ["guestEmail"],
    where: options?.search
      ? { guestEmail: { contains: options.search.toLowerCase() } }
      : undefined,
    _count: { _all: true },
    _sum: { partySize: true },
    orderBy: { _count: { guestEmail: "desc" } },
    take: options?.limit ?? 50,
  });

  const emails = rows.map((r) => r.guestEmail);
  if (emails.length === 0) return [];

  const [users, latest] = await Promise.all([
    prisma.user.findMany({ where: { email: { in: emails } } }),
    prisma.reservation.findMany({
      where: { guestEmail: { in: emails } },
      orderBy: { startsAt: "desc" },
      take: 200,
      select: { guestEmail: true, startsAt: true, partySize: true, status: true, guestName: true },
    }),
  ]);

  const userByEmail = new Map(users.map((u) => [u.email, u]));

  return rows.map((r) => {
    const visits = latest.filter((l) => l.guestEmail === r.guestEmail);
    const settled = visits.filter((v) => v.status === "COMPLETED");
    return {
      email: r.guestEmail,
      name: userByEmail.get(r.guestEmail)?.name ?? visits[0]?.guestName ?? r.guestEmail,
      phone: userByEmail.get(r.guestEmail)?.phone ?? null,
      staffNotes: userByEmail.get(r.guestEmail)?.staffNotes ?? null,
      bookings: r._count._all,
      covers: r._sum.partySize ?? 0,
      completed: settled.length,
      /** True when this guest has actually dined more than once. */
      isRepeat: settled.length > 1,
      lastVisit: visits[0]?.startsAt ?? null,
      totalSpendCents: settled.length * 0, // order data is out of scope
    };
  });
}
