/**
 * Opening hours.
 *
 * Renders the `openingHours` jsonb as a week. Two details matter more than they
 * look:
 *
 * 1. **Multiple services per day.** Thursday is lunch *and* dinner, so a day can
 *    hold a list of windows. Rendering only the first would quietly lie about
 *    when the restaurant is open.
 *
 * 2. **Today is marked.** A guest checking whether they can eat tonight is
 *    scanning for one row; bolding it saves a round trip to the mental calendar.
 *    The row is marked with `aria-current` as well as weight, so it is not
 *    colour-only information.
 */
import { DAY_KEYS, DAY_SHORT, type DayKey, type OpeningHours } from "@/lib/constants";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/format";

/** Monday-first index, matching `DAY_KEYS`. */
function dayKeyOf(dateIso: string): DayKey | null {
  const jsDay = new Date(`${dateIso}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return DAY_KEYS[(jsDay + 6) % 7];
}

export function HoursList({
  openingHours,
  today,
  compact = false,
}: {
  openingHours: OpeningHours;
  /** YYYY-MM-DD in the restaurant's timezone, used to mark the current day. */
  today: string;
  compact?: boolean;
}) {
  const todayKey = dayKeyOf(today);

  return (
    <dl className={cn("w-full", compact ? "text-sm" : "text-sm")}>
      {DAY_KEYS.map((key) => {
        const windows = openingHours[key] ?? [];
        const isToday = key === todayKey;

        return (
          <div
            key={key}
            aria-current={isToday ? "date" : undefined}
            className={cn(
              "flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-b-0",
              isToday && "font-medium",
            )}
          >
            <dt className={cn("text-ink-muted", isToday && "text-ink")}>
              {compact ? DAY_SHORT[key] : key.charAt(0).toUpperCase() + key.slice(1)}
            </dt>
            <dd
              className={cn(
                "text-right tabular-nums text-ink-subtle",
                isToday && "text-ink",
              )}
            >
              {windows.length === 0 ? (
                <span className="text-ink-subtle/70">Closed</span>
              ) : (
                windows.map(([open, close]) => (
                  <span key={`${open}-${close}`} className="block">
                    {formatTime(open)} — {formatTime(close)}
                  </span>
                ))
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** True when a date falls inside the booking window the owner has configured. */
export function isOpenOn(openingHours: OpeningHours, dateIso: string): boolean {
  const key = dayKeyOf(dateIso);
  if (!key) return false;
  return (openingHours[key] ?? []).length > 0;
}
