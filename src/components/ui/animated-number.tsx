"use client";

/**
 * Animated number.
 *
 * Counts from the previous value to the next one, so a dashboard that reloads
 * does not restart from zero — the figure visibly *changes* instead of
 * re-counting, which is the difference between a chart and a slot machine.
 *
 * Uses `requestAnimationFrame` with an ease-out curve rather than a spring, so
 * the final value is exact and never overshoots: an overshooting revenue figure
 * that settles on the wrong number is worse than no animation.
 *
 * `format` is a `NumberFormat` *name*, not a formatter function. This is a
 * client component, so any function in its props would have to be produced in
 * the server component that renders it and would fail the entire render with
 * "Functions cannot be passed directly to Client Components". A string union
 * survives the RSC boundary, and `formatNumber` — which lives in a shared module
 * so both sides run the identical code — does the work.
 */
import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

import { formatNumber, type NumberFormat } from "@/lib/format";

type Props = {
  value: number;
  /** How to render the final (and interpolated) value. */
  format?: NumberFormat;
  durationMs?: number;
  /** Delay before counting, so a row of figures cascades. */
  delayMs?: number;
  className?: string;
  /** Accessible text; defaults to the formatted final value. */
  ariaLabel?: string;
};

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function AnimatedNumber({
  value,
  format = "integer",
  durationMs = 1400,
  delayMs = 0,
  className,
  ariaLabel,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);
  const previous = useRef(0);
  const hasRun = useRef(false);

  useEffect(() => {
    if (!inView) return;

    // Read once, up front: re-checking inside the loop would let the animation
    // change its mind halfway through if the OS setting were toggled.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const from = hasRun.current ? previous.current : 0;
    const delta = value - from;
    const start = performance.now() + delayMs;
    let frame = 0;

    /**
     * Every `setDisplay` lives inside the `requestAnimationFrame` callback,
     * never in the effect body. A state write during the effect itself is a
     * synchronous extra render: the figure would mount at 0 and correct itself a
     * frame later, which reads as a flicker and is exactly the cascading render
     * this pattern exists to avoid.
     */
    const settle = () => {
      previous.current = value;
      hasRun.current = true;
      setDisplay(value);
    };

    const tick = (now: number) => {
      if (reduced) {
        settle();
        return;
      }

      const elapsed = now - start;
      if (elapsed < 0) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / durationMs);
      setDisplay(from + delta * easeOutExpo(t));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        // Land on the exact value; floating point can leave a fraction behind.
        settle();
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, durationMs, delayMs]);

  return (
    <span ref={ref} className={className} aria-label={ariaLabel ?? formatNumber(value, format)}>
      {/* The visible digits are hidden from assistive tech; the label carries
          the real figure, so a screen reader is not read a stream of numbers. */}
      <span aria-hidden="true">{formatNumber(display, format)}</span>
    </span>
  );
}
