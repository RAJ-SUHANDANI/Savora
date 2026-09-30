"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/format";
import { EASE } from "@/lib/motion";

/**
 * SVG checkmark that draws itself.
 *
 * The stroke is animated with `pathLength` rather than a clip-path or a mask,
 * because pathLength lets the browser interpolate along the actual path
 * geometry — the line grows from its start point with a real pen-stroke feel,
 * and it works identically regardless of the path's length or shape.
 *
 * `viewBox` is deliberately generous around the path so the round line cap is
 * never clipped at either end of the animation.
 */
export function AnimatedCheckmark({
  size = 64,
  className,
  delay = 0,
  strokeWidth = 3,
}: {
  size?: number;
  className?: string;
  delay?: number;
  strokeWidth?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      className={cn("overflow-visible", className)}
      role="img"
      aria-label="Confirmed"
    >
      {/* A soft halo that blooms as the tick completes. */}
      <motion.circle
        cx="26"
        cy="26"
        r="24"
        stroke="currentColor"
        strokeWidth="1"
        className="text-accent/30"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={inView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.5, ease: EASE.out, delay }}
      />
      <motion.circle
        cx="26"
        cy="26"
        r="24"
        className="text-accent/20"
        fill="currentColor"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={inView ? { opacity: 0.18, scale: 1 } : {}}
        transition={{ duration: 0.6, ease: EASE.out, delay: delay + 0.1 }}
      />
      <motion.path
        d="M15 27 L22.5 34 L38 18"
        stroke="currentColor"
        className="text-accent"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={inView ? { pathLength: 1, opacity: 1 } : {}}
        transition={{ duration: 0.55, ease: EASE.out, delay: delay + 0.15 }}
      />
    </svg>
  );
}

/**
 * A ring that draws itself around a checkmark — used on the confirmation
 * screen, where the extra beat of ceremony is the point.
 */
export function AnimatedCheckRing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={cn("h-32 w-32", className)} fill="none" aria-hidden="true">
      <motion.circle
        cx="60"
        cy="60"
        r="54"
        stroke="currentColor"
        className="text-accent/25"
        strokeWidth="1.5"
        initial={{ pathLength: 0, rotate: -90 }}
        animate={{ pathLength: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: EASE.out }}
        style={{ originX: "60px", originY: "60px" }}
      />
      <motion.circle
        cx="60"
        cy="60"
        r="46"
        stroke="currentColor"
        className="text-accent/15"
        strokeWidth="1"
        strokeDasharray="2 6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      />
    </svg>
  );
}
