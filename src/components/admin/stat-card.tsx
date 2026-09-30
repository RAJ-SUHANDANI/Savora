import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn, type NumberFormat } from "@/lib/format";

/**
 * A single figure on the overview.
 *
 * `AnimatedNumber` counts up when the card scrolls into view, and `delayMs`
 * cascades the row so the figures land left to right instead of all at once.
 *
 * `format` is a {@link NumberFormat} name rather than a callback. This is a
 * server component rendering a client one, so a function prop here is a function
 * React cannot serialise across the boundary — it does not degrade, it throws,
 * and takes the whole page down to an empty shell while still returning 200.
 *
 * The `hint` line is where the honesty lives: an occupancy percentage or a
 * "spend per cover" figure is a model, not a measurement, and saying so next
 * to the number is the difference between a dashboard staff trust and one they
 * learn to ignore.
 */
export function StatCard({
  label,
  value,
  format,
  hint,
  icon,
  delayMs = 0,
  tone = "default",
}: {
  label: string;
  value: number;
  format?: NumberFormat;
  hint?: string;
  icon?: React.ReactNode;
  delayMs?: number;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={cn(
        "card p-5",
        tone === "accent" && "border-accent/30 bg-accent/[0.04]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-ink-subtle uppercase">{label}</p>
        {icon ? <span className="shrink-0 text-ink-subtle">{icon}</span> : null}
      </div>

      <p className="mt-3 font-display text-3xl leading-none tabular-nums">
        <AnimatedNumber value={value} format={format} delayMs={delayMs} />
      </p>

      {hint ? <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">{hint}</p> : null}
    </div>
  );
}
