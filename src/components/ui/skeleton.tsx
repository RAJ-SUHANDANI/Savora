/**
 * Skeleton loaders.
 *
 * Skeletons mirror the real layout's dimensions rather than being a generic
 * grey block, so nothing jumps when data lands. Each has a comment explaining
 * what it is standing in for.
 */

import { cn } from "@/lib/format";
import type { CSSProperties } from "react";

/**
 * Base shimmer block.
 *
 * `style` is accepted so a caller can vary height or opacity — the slot and
 * chart skeletons use that to fake the shape of the data that is coming, which
 * stops the layout jumping when the real content lands.
 */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("skeleton rounded-md", className)} style={style} aria-hidden="true" />;
}

/** Stands in for a menu card: image area, then name, then two lines of body. */
export function MenuCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
      <div className="space-y-2 pt-1">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** A row in the menu grid skeleton. */
export function MenuGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading the menu"
    >
      {Array.from({ length: count }, (_, i) => (
        <MenuCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Stands in for a time-slot button. Sized to the real slot so the grid does not
 * reflow when slots arrive.
 */
export function SlotSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5" role="status" aria-label="Loading availability">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className="h-12 rounded-xl"
          // A gentle cascade reads as "loading" rather than "broken".
          style={{ opacity: 1 - i * 0.04 }}
        />
      ))}
    </div>
  );
}

/** Stands in for one day's worth of slots, used while the date changes. */
export function DateStripSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="flex gap-2 overflow-hidden" role="status" aria-label="Loading dates">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-20 w-16 shrink-0 rounded-2xl" />
      ))}
    </div>
  );
}

/** A reservation card in the account dashboard. */
export function ReservationCardSkeleton() {
  return (
    <div className="card p-6" aria-hidden="true">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
    </div>
  );
}

/** A row in the admin reservations table. */
export function TableRowSkeleton({ columns = 6 }: { columns?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: columns }, (_, i) => (
        <td key={i} className="px-4 py-4">
          <Skeleton className="h-3.5 w-full max-w-24" />
        </td>
      ))}
    </tr>
  );
}

/** A stat tile on the admin overview. */
export function StatSkeleton() {
  return (
    <div className="card p-6" aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-16" />
      <Skeleton className="mt-4 h-3 w-32" />
    </div>
  );
}

/** A chart placeholder. */
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("card p-6", className)} aria-hidden="true">
      <Skeleton className="h-4 w-40" />
      <div className="mt-6 flex h-56 items-end gap-2">
        {Array.from({ length: 14 }, (_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-md"
            // Varying heights so it reads as a chart, not a barcode.
            style={{ height: `${28 + ((i * 37) % 62)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Full-page loader for route transitions. */
export function PageSkeleton() {
  return (
    <div className="container-editorial py-20" role="status" aria-label="Loading">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-6 h-14 w-2/3 max-w-xl" />
      <Skeleton className="mt-4 h-4 w-1/2 max-w-md" />
      <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <MenuCardSkeleton key={i} />
      ))}
      </div>
    </div>
  );
}
