"use client";

/**
 * Step 1 — the date.
 *
 * A horizontal strip of every bookable day, rather than a month calendar. The
 * booking window is 30 days, and a month grid wastes most of its cells on days
 * that cannot be booked; a strip is also the shape people already recognise
 * from travel booking, so it needs no instructions.
 *
 * Closed days are computed **on the client**, from the same `openingHours` the
 * server uses to generate slots. That is possible because `lib/datetime.ts` is
 * pure — no database, no Node built-ins — and it matters: a guest who is told
 * "closed" on the strip does not discover it three taps later on the slot grid.
 *
 * The native date input is kept alongside the strip rather than instead of it.
 * It is the only way to reach a date by keyboard without tabbing through thirty
 * buttons, and it is what screen-reader and date-picker users reach for first.
 */
import { useMemo } from "react";
import { CalendarDays, CalendarOff } from "lucide-react";
import { motion } from "framer-motion";

import { DAY_SHORT, DAY_LABELS } from "@/lib/constants";
import type { DayKey, OpeningHours } from "@/lib/constants";
import { dayKeyForDate, isServiceDay } from "@/lib/datetime";
import { addDaysIso, cn, formatDate } from "@/lib/format";
import { DURATION, EASE, gridStagger, gridItem } from "@/lib/motion";
import { StepHeading } from "@/components/reserve/step-heading";

type Props = {
  today: string;
  minDate: string;
  maxDate: string;
  holidays: string[];
  openingHours: OpeningHours;
  value: string | null;
  onChange: (date: string) => void;
  phone: string;
};

type Day = {
  iso: string;
  dayNumber: string;
  month: string;
  weekday: string;
  dayKey: DayKey;
  closed: boolean;
  isToday: boolean;
  isTomorrow: boolean;
};

export function DateStep({
  today,
  minDate,
  maxDate,
  holidays,
  openingHours,
  value,
  onChange,
  phone,
}: Props) {
  const days = useMemo<Day[]>(() => {
    const holidaySet = new Set(holidays);
    const out: Day[] = [];
    const total = Math.max(0, daysBetween(minDate, maxDate) + 1);

    for (let i = 0; i < total; i++) {
      const iso = addDaysIso(minDate, i);
      // Parsed at midday UTC: the weekday must not shift with the host zone.
      const at = new Date(`${iso}T12:00:00Z`);
      out.push({
        iso,
        dayNumber: String(at.getUTCDate()),
        month: at.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
        weekday: DAY_SHORT[dayKeyForDate(iso)],
        dayKey: dayKeyForDate(iso),
        closed: holidaySet.has(iso) || !isServiceDay(openingHours, iso),
        isToday: iso === today,
        isTomorrow: iso === addDaysIso(today, 1),
      });
    }
    return out;
  }, [minDate, maxDate, holidays, openingHours, today]);

  return (
    <div>
      <StepHeading
        stepLabel="Step one"
        title="When would you like to come?"
        hint={`We take bookings up to ${formatDate(maxDate)}.`}
      />

      {/* ---- The strip --------------------------------------------------- */}
      <motion.ul
        variants={gridStagger(0.02)}
        initial="hidden"
        animate="visible"
        className="mt-9 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-3 [scrollbar-width:thin]"
      >
        {days.map((day, i) => {
          const selected = day.iso === value;
          return (
            <motion.li
              key={day.iso}
              variants={gridItem}
              custom={i}
              className="shrink-0 snap-start"
            >
              <button
                type="button"
                disabled={day.closed}
                onClick={() => onChange(day.iso)}
                aria-pressed={selected}
                aria-label={
                  day.closed
                    ? `${DAY_LABELS[day.dayKey]} ${day.dayNumber} ${day.month} — closed`
                    : `${DAY_LABELS[day.dayKey]} ${day.dayNumber} ${day.month}`
                }
                className={cn(
                  "flex w-[5.25rem] flex-col items-center gap-1 rounded-2xl border px-2 py-3.5 text-center transition-all duration-300",
                  selected
                    ? "border-accent bg-accent text-accent-contrast shadow-[var(--shadow-lifted)]"
                    : day.closed
                      ? "cursor-not-allowed border-transparent bg-surface-raised/60 text-ink-subtle opacity-60"
                      : "border-border-subtle bg-surface text-ink hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[var(--shadow-subtle)]",
                )}
              >
                <span
                  className={cn(
                    "text-[0.6875rem] font-medium uppercase tracking-[0.14em]",
                    selected ? "text-accent-contrast/75" : "text-ink-subtle",
                  )}
                >
                  {day.isToday ? "Today" : day.isTomorrow ? "Tmrw" : day.weekday}
                </span>
                <span className="font-display text-2xl leading-none">
                  {day.dayNumber}
                </span>
                <span
                  className={cn(
                    "text-[0.625rem] uppercase tracking-wider",
                    selected ? "text-accent-contrast/70" : "text-ink-subtle",
                  )}
                >
                  {day.closed ? "Closed" : day.month}
                </span>
              </button>
            </motion.li>
          );
        })}
      </motion.ul>

      {/* ---- Jump control ------------------------------------------------ */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="inline-flex items-center gap-2.5 text-sm text-ink-muted">
          <CalendarDays size={15} className="text-ink-subtle" aria-hidden="true" />
          <span>Or choose a date directly</span>
          <input
            type="date"
            value={value ?? ""}
            min={minDate}
            max={maxDate}
            onChange={(e) => {
              // Guarded rather than trusted: a typed or hand-edited value can be
              // outside the window the strip offers, and the server would reject
              // it with a message the guest cannot act on.
              if (e.target.value >= minDate && e.target.value <= maxDate) {
                onChange(e.target.value);
              }
            }}
            className="field tap-target w-auto text-sm"
          />
        </label>

        {value ? (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE.out }}
            className="text-sm text-ink-muted"
          >
            Booking for{" "}
            <strong className="font-medium text-ink">
              {formatDate(value)}
            </strong>
          </motion.p>
        ) : null}
      </div>

      {days.every((d) => d.closed) ? (
        <p className="mt-8 flex items-start gap-2.5 rounded-xl border border-border-subtle bg-surface-raised px-4 py-3.5 text-sm leading-relaxed text-ink-muted">
          <CalendarOff size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <span>
            We are closed for the whole of the booking window — usually a
            holiday. Please telephone us on{" "}
            <a href={`tel:${phone.replace(/\s/g, "")}`} className="link-underline text-accent">
              {phone}
            </a>{" "}
            and we will find you something.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** Whole days from `a` to `b`, both `YYYY-MM-DD`, in UTC. */
function daysBetween(a: string, b: string): number {
  const start = Date.parse(`${a}T00:00:00Z`);
  const end = Date.parse(`${b}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}
