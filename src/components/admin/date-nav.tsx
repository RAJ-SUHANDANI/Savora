"use client";

/**
 * Date navigation for the reservations book.
 *
 * ## The date lives in the URL, not in state
 *
 * `?date=2026-10-02` rather than a `useState` counter, and that is the whole
 * design. A manager doing a service walks the book backwards and forwards
 * repeatedly; with local state, `router.back()` after three steps of "next day"
 * would return to the *dashboard* rather than to the previous day, and reloading
 * — the thing a manager does when their phone locks mid-service — would silently
 * reset to today. A URL makes the current day addressable, bookmarkable and
 * shareable, which is also what lets the browser's own back button do the
 * obvious thing.
 *
 * It also means the server component receives the date and can query on the
 * first paint, so there is no client-side "load, then fetch" flash.
 *
 * ## Why the current query string is passed in rather than read here
 *
 * `useSearchParams()` would work, but it opts this component out of static
 * rendering and requires a Suspense boundary above it. The server page already
 * parsed the search params to build the query, so it hands the rest of them
 * down and this only has to swap one key in a string. Less machinery, same
 * behaviour.
 *
 * The links are real `<Link>`s rather than click handlers on a `<button>`, so
 * middle-click and open-in-new-tab behave the way they do everywhere else on
 * the site. Only the native date input navigates imperatively, because a date
 * picker has no href to point at.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { addDaysIso, formatDate, todayIn } from "@/lib/format";

export function DateNav({
  date,
  timezone,
  /** The page's other search params, serialised. Preserved across a date change. */
  rest = "",
}: {
  date: string;
  timezone: string;
  rest?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  const today = todayIn(timezone);
  const isToday = date === today;

  /**
   * The same page with `date` replaced.
   *
   * `rest` is spliced in verbatim so an active status filter, or the
   * `unassigned` view, survives stepping to another day. Losing the filter every
   * time you click "tomorrow" is the sort of small betrayal that makes someone
   * stop trusting a tool.
   *
   * Built by hand rather than with `URLSearchParams` because `rest` is already
   * encoded and re-encoding it would double-encode any `+` in a search term.
   */
  const hrefFor = (iso: string) => {
    const kept = rest
      .split("&")
      .filter((pair) => pair && !pair.startsWith("date="));
    const query = [...kept, `date=${iso}`].join("&");
    return `/admin/reservations?${query}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-full border border-border-subtle bg-surface">
        <Link
          href={hrefFor(addDaysIso(date, -1))}
          aria-label="Previous day"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Link>

        <p className="min-w-[9.5rem] px-1 text-center text-sm font-medium">{formatDate(date)}</p>

        <Link
          href={hrefFor(addDaysIso(date, 1))}
          aria-label="Next day"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {/* A native date input rather than a custom calendar: a button that opens
          the operating system's own picker is the fast path on the phone in a
          manager's pocket, and it is keyboard-accessible and localised for free.
          The input itself is visually hidden rather than `display:none`, because
          a hidden input cannot be focused and a screen reader cannot reach it. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => input.current?.showPicker?.()}
          className="btn btn-secondary btn-sm"
        >
          <CalendarDays size={14} aria-hidden="true" />
          Pick a date
        </button>
        <input
          ref={input}
          type="date"
          value={date}
          onChange={(event) => {
            if (event.target.value) router.push(hrefFor(event.target.value));
          }}
          aria-label="Choose a date"
          className="pointer-events-none absolute right-0 bottom-0 size-0 opacity-0"
        />
      </div>

      {isToday ? (
        <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
          Today
        </span>
      ) : (
        <Link href={hrefFor(today)} className="btn btn-ghost btn-sm">
          Back to today
        </Link>
      )}
    </div>
  );
}
