"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/format";
import { whileInViewVariants, EASE, DURATION } from "@/lib/motion";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Stagger index when used inside a grid. */
  index?: number;
  /** Distance travelled. Larger elements get more. */
  distance?: number;
  as?: "div" | "section" | "li" | "article";
};

/**
 * Scroll-triggered reveal wrapper.
 *
 * Defaults to a 28px rise, which suits a card or a section. `once: true`
 * matters for more than performance: a card that re-animates every time it
 * re-enters the viewport becomes distracting on a page with a sticky header.
 *
 * The margin means the animation starts slightly *before* the element is fully
 * in view, so motion is already underway by the time a visitor's eye arrives.
 */
export function Reveal({
  children,
  className,
  index = 0,
  distance = 28,
  as = "div",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  // Every `motion.*` element is the same component type under the hood, but
  // TypeScript intersects the four `ref` signatures when indexing by a union,
  // which makes the assignment illegal. Widening to `motion.div` is honest:
  // the prop surface (`initial`/`animate`/`transition`/`className`) is identical
  // across all four, and the `as` prop already guarantees the right DOM tag.
  const Component = motion[as] as typeof motion.div;

  return (
    <Component
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: distance }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: distance }}
      transition={{
        duration: DURATION.reveal,
        ease: EASE.out,
        // Capped so a long grid does not take seconds to finish appearing.
        delay: Math.min(index * 0.06, 0.5),
      }}
    >
      {children}
    </Component>
  );
}

/**
 * Section wrapper that fades a whole block in, including its heading. Used for
 * page-level sections where the content is one visual unit.
 */
export function RevealSection({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.section
      ref={ref}
      id={id}
      className={className}
      variants={whileInViewVariants}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
    >
      {children}
    </motion.section>
  );
}

/**
 * Animated underline that draws itself in when scrolled into view. Used on
 * section headings, where a static rule looks like an afterthought.
 */
export function DrawUnderline({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <span ref={ref} className={cn("block h-px w-full origin-left bg-accent/30", className)}>
      <motion.span
        className="block h-px w-full origin-left bg-accent"
        initial={{ scaleX: 0 }}
        animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 1.1, ease: EASE.out }}
      />
    </span>
  );
}
