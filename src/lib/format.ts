/**
 * Formatting and class-name helpers.
 *
 * Server-safe: no Node built-ins, no React imports beyond types.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Integer minor units -> "£24.50". Currency symbol comes from settings. */
export function formatPrice(cents: number, currency = "GBP", locale = "en-GB"): string {
  const amount = cents / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Compact variant for dense UI (dashboards, tables) where width is scarce.
 *
 * Deliberately not `Intl.NumberFormat`: this is a column of prices and the
 * symbol has to sit in the same pixel column on every row, which a
 * locale-formatted value with a non-breaking space in it will not do.
 */
export function formatPriceCompact(cents: number, currency = "GBP"): string {
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  const amount = cents / 100;
  return `${symbol}${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

/**
 * Named number formats for figures that cross the server/client boundary.
 *
 * A *name*, not a function, and that is the entire point. `AnimatedNumber` is a
 * client component and `StatCard` is a server component, so a
 * `format: (n: number) => string` prop is a function being handed to a
 * different JavaScript realm than the one that made it — React's server
 * renderer cannot serialise it, and it fails the whole render with
 * "Functions cannot be passed directly to Client Components". The symptom was
 * an `/admin` page that returned 200 and shipped nothing but its own
 * `loading.tsx` shell.
 *
 * A union of strings is serialisable, so the same helper runs on both sides and
 * the server-rendered markup already carries the final, correctly formatted
 * number — which also means the figure is correct before hydration rather than
 * correcting itself a frame later.
 */
export type NumberFormat =
  /** "1,284" — grouped, rounded. Counts of people, covers, bookings. */
  | "integer"
  /** "1.3k", "12k" — for a stat card too narrow for five digits. */
  | "compact"
  /** "68%" — from a 0–100 number, not a 0–1 fraction. */
  | "percent"
  /** "£1,240" — from *pence*, matching every other price in the app. */
  | "currency"
  /** "4.6" — one decimal place. Average covers per booking, average spend. */
  | "decimal1";

/**
 * Applies a {@link NumberFormat}. Lives here rather than inside the client
 * component because the server needs to produce the same string during SSR,
 * and a server module importing a client module only gets a module *reference*.
 */
export function formatNumber(value: number, format: NumberFormat = "integer"): string {
  switch (format) {
    case "integer":
      return Math.round(value).toLocaleString("en-GB");
    case "compact":
      return new Intl.NumberFormat("en-GB", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
    case "percent":
      return `${Math.round(value).toLocaleString("en-GB")}%`;
    case "currency":
      return formatPriceCompact(Math.round(value));
    case "decimal1":
      return value.toFixed(1);
  }
}

/** "19:30" (24h, as stored) -> "7:30 pm" for display. */
export function formatTime(hhmm: string, locale = "en-GB"): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const date = new Date(Date.UTC(2000, 0, 1, h, m));
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

/** "2026-06-01" -> "1 June 2026". Parsed manually to avoid timezone drift. */
export function formatDate(iso: string, locale = "en-GB"): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateShort(iso: string, locale = "en-GB"): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "tonight", "tomorrow", or a formatted date. */
export function relativeDayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  const next = addDaysIso(today, 1);
  if (iso === next) return "Tomorrow";
  return formatDate(iso);
}

/** Adds days to a YYYY-MM-DD string without constructing a local Date. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** YYYY-MM-DD for "today" in the given IANA timezone (not the server's). */
export function todayIn(timeZone: string): string {
  // en-CA renders as YYYY-MM-DD, which is exactly the shape we want.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Minutes since midnight -> "19:30". */
export function minutesToHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "19:30" -> minutes since midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Truncate on a word boundary rather than mid-word. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}
