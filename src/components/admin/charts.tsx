"use client";

/**
 * Dashboard charts.
 *
 * All of this is client-side, and all of it renders nothing on the server.
 * Recharts measures its container with `ResizeObserver`, which does not exist
 * during SSR, so a `<ResponsiveContainer>` would emit a zero-width chart into
 * the HTML and then resize itself on hydration — a visible jump on every
 * dashboard load.
 *
 * Rather than a `useState`/`useEffect` mount flag (which the `react-hooks`
 * rules rightly complain about, because it is a state write in an effect body),
 * hydration is detected with `useSyncExternalStore`. React calls the server
 * snapshot during SSR and the client snapshot during hydration, so the correct
 * value arrives with no effect and no extra render. Until then the caller sees
 * a `ChartSkeleton` of the same height, so nothing shifts when the chart lands.
 */
import { useSyncExternalStore } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DAY_SHORT, type DayKey } from "@/lib/constants";
import { formatTime } from "@/lib/format";

/** No subscription is needed; the difference is server snapshot vs client. */
const subscribeNever = () => () => {};
const useHydrated = () => useSyncExternalStore(subscribeNever, () => true, () => false);

/** Chart colours, read from the design tokens so dark mode just works. */
const INK_MUTED = "var(--color-ink-muted)";
const GRID = "var(--color-border-subtle)";
const ACCENT = "var(--color-accent)";
const OLIVE = "var(--color-olive)";

/**
 * Custom tooltip.
 *
 * Recharts' default tooltip is a white box with a grey border, which is right
 * for a charting library's default and wrong for a warm editorial site — so
 * this restyles it with the site's own surface tokens and, crucially, keeps the
 * value legible in dark mode.
 */
function ChartTooltip({
  active,
  payload,
  label,
  labelFormat,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
  labelFormat?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border-strong bg-surface-raised px-3.5 py-2.5 shadow-lifted">
      {label !== undefined ? (
        <p className="text-xs font-medium text-ink">
          {labelFormat ? labelFormat(String(label)) : String(label)}
        </p>
      ) : null}
      <ul className="mt-1.5 space-y-1">
        {payload.map((entry, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-ink-muted">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color ?? ACCENT }}
              aria-hidden="true"
            />
            {entry.name ? <span className="capitalize">{entry.name}</span> : null}
            <span className="ml-auto font-medium tabular-nums text-ink">
              {typeof entry.value === "number" ? entry.value.toLocaleString("en-GB") : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shared axis/grid styling so all three charts read as one set. */
const axisProps = {
  stroke: INK_MUTED,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Daily covers and reservations over the trend window.
 *
 * Two series rather than one because they answer different questions: covers is
 * what the kitchen has to cook, reservations is what the floor has to turn.
 * A busy night of small tables and a quiet night of big ones look identical on
 * a covers-only line.
 */
export function CoversTrend({
  data,
  height = 260,
}: {
  data: { date: string; covers: number; reservations: number }[];
  height?: number;
}) {
  const hydrated = useHydrated();
  if (!hydrated) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="coversFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          {...axisProps}
          // A 30-day window has more ticks than a chart has room for; showing
          // roughly every fifth day keeps the labels legible and unrotated.
          interval="preserveStartEnd"
          minTickGap={28}
          tickFormatter={(v: string) => v.slice(8) + "/" + v.slice(5, 7)}
        />
        <YAxis {...axisProps} width={46} allowDecimals={false} />
        <Tooltip content={<ChartTooltip labelFormat={shortDate} />} cursor={{ stroke: GRID }} />
        <Area
          type="monotone"
          dataKey="covers"
          name="covers"
          stroke={ACCENT}
          strokeWidth={2}
          fill="url(#coversFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="reservations"
          name="bookings"
          stroke={OLIVE}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          fill="none"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Covers by weekday — shows which nights the room actually needs. */
export function WeekdayCovers({
  data,
  height = 200,
}: {
  data: { day: DayKey; covers: number; reservations: number }[];
  height?: number;
}) {
  const hydrated = useHydrated();
  if (!hydrated) return null;

  // Highlight the strongest night so the chart makes a point rather than
  // presenting seven identical bars.
  const peak = data.reduce((max, d) => (d.covers > max.covers ? d : max), data[0]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="day" {...axisProps} tickFormatter={(v: DayKey) => DAY_SHORT[v]} />
        <YAxis {...axisProps} width={46} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: GRID, fillOpacity: 0.4 }} />
        <Bar dataKey="covers" name="covers" radius={[6, 6, 0, 0]} maxBarSize={44}>
          {data.map((d) => (
            <Cell key={d.day} fill={peak && d.day === peak.day ? ACCENT : "var(--color-sand-deep)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Seating times, busiest first — the "staff up at 19:30" insight. */
export function PeakTimes({
  data,
  height = 220,
}: {
  data: { time: string; reservations: number; covers: number }[];
  height?: number;
}) {
  const hydrated = useHydrated();
  if (!hydrated) return null;

  // Recharts lays a horizontal BarChart out bottom-up, so reversing puts the
  // earliest — and in a restaurant, most useful — slot at the top.
  const ordered = [...data].reverse();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={ordered} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="time"
          {...axisProps}
          width={62}
          tickFormatter={(v: string) => formatTime(v)}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: GRID, fillOpacity: 0.4 }} />
        <Bar dataKey="covers" name="covers" fill={ACCENT} radius={[0, 6, 6, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** "30/09" -> "30 Sept", matching the site's date style. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
