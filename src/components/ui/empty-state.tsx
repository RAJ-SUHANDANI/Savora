/**
 * Empty states.
 *
 * The brief asked for designed empty states rather than bare text, so each one
 * has an illustration drawn in SVG using the site's own palette and line
 * weight. The illustrations are deliberately abstract and small — a full
 * character illustration would fight the typography, which is doing the
 * emotional work here.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";

type BaseProps = {
  title: string;
  description?: ReactNode;
  action?: { href: string; label: string };
  secondaryAction?: { href: string; label: string };
  className?: string;
  compact?: boolean;
};

/** Shared frame: centred, generous space, illustration above the copy. */
function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  className,
  compact,
  illustration,
}: BaseProps & { illustration: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-6 py-12" : "px-6 py-20",
        className,
      )}
    >
      <div className="text-accent/70">{illustration}</div>
      <h3
        className={cn(
          "mt-6 font-display",
          compact ? "text-xl" : "text-2xl md:text-3xl",
        )}
      >
        {title}
      </h3>
      {description ? (
        <p className="mt-3 max-w-sm text-balance text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {action ? (
            <Link href={action.href} className="btn btn-primary btn-sm">
              {action.label}
            </Link>
          ) : null}
          {secondaryAction ? (
            <Link href={secondaryAction.href} className="btn btn-secondary btn-sm">
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A plate with a cloche — for "no reservations yet". */
export function EmptyReservations(props: BaseProps) {
  return (
    <EmptyState
      {...props}
      illustration={
        <svg width="104" height="88" viewBox="0 0 104 88" fill="none" aria-hidden="true">
          <ellipse cx="52" cy="76" rx="34" ry="5" className="fill-surface-sunken" />
          <path
            d="M18 58c0-16 15-28 34-28s34 12 34 28"
            className="stroke-accent/50"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M10 58h84" className="stroke-accent/60" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M20 63v9M84 63v9" className="stroke-accent/40" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="52" cy="22" r="4" className="fill-accent/25 stroke-accent/50" strokeWidth="1.5" />
          <path d="M52 26v4" className="stroke-accent/50" strokeWidth="1.5" strokeLinecap="round" />
          {/* Steam: three drifting curves, hinting at a hot dish. */}
          <path
            d="M38 40c-3-3 3-6 0-9M52 38c-3-3 3-6 0-9M66 40c-3-3 3-6 0-9"
            className="stroke-accent/30"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      }
    />
  );
}

/** A heart-in-a-plate — for "no saved dishes". */
export function EmptyFavourites(props: BaseProps) {
  return (
    <EmptyState
      {...props}
      illustration={
        <svg width="96" height="88" viewBox="0 0 96 88" fill="none" aria-hidden="true">
          <ellipse cx="48" cy="70" rx="32" ry="5" className="fill-surface-sunken" />
          <path
            d="M48 66S22 50 22 34a13 13 0 0126-4 13 13 0 0126 4c0 16-26 32-26 32z"
            className="stroke-accent/50"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M16 74h64" className="stroke-accent/30" strokeWidth="1.5" strokeLinecap="round" />
          <path
            d="M30 26l-2-4M48 22v-5M66 26l2-4"
            className="stroke-accent/30"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      }
    />
  );
}

/** A calendar with no entries — for admin empty reservation lists. */
export function EmptyCalendar(props: BaseProps) {
  return (
    <EmptyState
      {...props}
      illustration={
        <svg width="104" height="88" viewBox="0 0 104 88" fill="none" aria-hidden="true">
          <rect x="18" y="20" width="68" height="52" rx="6" className="stroke-accent/45" strokeWidth="1.5" />
          <path d="M18 34h68" className="stroke-accent/45" strokeWidth="1.5" />
          <path d="M32 14v10M72 14v10" className="stroke-accent/45" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="27" y="42" width="12" height="10" rx="2" className="fill-accent/20" />
          <rect x="45" y="42" width="12" height="10" rx="2" className="fill-accent/12" />
          <rect x="63" y="42" width="12" height="10" rx="2" className="fill-accent/12" />
          <rect x="27" y="56" width="12" height="10" rx="2" className="fill-accent/12" />
          <path
            d="M48 61l4 4 8-9"
            className="stroke-accent/70"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      }
    />
  );
}

/** A crossed-out plate — for a sold-out or unavailable menu. */
export function EmptyMenu(props: BaseProps) {
  return (
    <EmptyState
      {...props}
      illustration={
        <svg width="96" height="88" viewBox="0 0 96 88" fill="none" aria-hidden="true">
          <circle cx="48" cy="46" r="26" className="stroke-accent/45" strokeWidth="1.5" />
          <circle cx="48" cy="46" r="16" className="stroke-accent/25" strokeWidth="1" />
          <path d="M30 76l36-60" className="stroke-accent/60" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M14 14l14 14M28 14L14 28" className="stroke-accent/40" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      }
    />
  );
}

/** A search with nothing found — used by the menu filters. */
export function EmptySearch(props: BaseProps) {
  return (
    <EmptyState
      {...props}
      illustration={
        <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden="true">
          <circle cx="39" cy="39" r="20" className="stroke-accent/50" strokeWidth="1.5" />
          <path d="M54 54l16 16" className="stroke-accent/60" strokeWidth="2" strokeLinecap="round" />
          <path d="M32 39h14" className="stroke-accent/35" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      }
    />
  );
}

/** An envelope — for "no messages" or a general fallback. */
export function EmptyInbox(props: BaseProps) {
  return (
    <EmptyState
      {...props}
      illustration={
        <svg width="96" height="80" viewBox="0 0 96 80" fill="none" aria-hidden="true">
          <rect x="16" y="22" width="64" height="44" rx="6" className="stroke-accent/45" strokeWidth="1.5" />
          <path
            d="M16 28l32 20 32-20"
            className="stroke-accent/45"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M36 8h24" className="stroke-accent/30" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M42 2h12" className="stroke-accent/20" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      }
    />
  );
}
