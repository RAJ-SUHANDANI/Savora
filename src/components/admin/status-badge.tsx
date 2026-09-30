import { STATUS_LABELS, type ReservationStatus } from "@/lib/constants";
import { cn } from "@/lib/format";

/**
 * Reservation status pill.
 *
 * Intentionally a plain component with no "use client": it holds no state, so
 * it can be rendered by a server page and by an interactive client component
 * alike. Marking it client-side would drag it into the browser bundle for no
 * reason.
 *
 * Each tone is a background *and* a text colour rather than a coloured dot, so
 * the status is legible without relying on hue alone — colour-blind staff and a
 * monochrome print both still work.
 */
const TONE: Record<ReservationStatus, string> = {
  PENDING: "bg-saffron/15 text-saffron border-saffron/30",
  CONFIRMED: "bg-olive-soft text-olive border-olive/30",
  SEATED: "bg-accent/15 text-accent border-accent/30",
  COMPLETED: "bg-surface-raised text-ink-muted border-border-strong",
  CANCELLED: "bg-surface-raised text-ink-subtle border-border-strong",
  NO_SHOW: "bg-wine/10 text-wine border-wine/30",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = (status in TONE ? status : "COMPLETED") as ReservationStatus;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium whitespace-nowrap",
        TONE[key],
        className,
      )}
    >
      {STATUS_LABELS[key]}
    </span>
  );
}
