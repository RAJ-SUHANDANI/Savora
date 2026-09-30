/**
 * Framer Motion presets.
 *
 * Centralised so the whole site shares one motion vocabulary. The rule applied
 * throughout: **large surfaces move more than small ones**. A whole page
 * section travelling 24px reads as intentional; a button travelling 24px reads
 * as a bug. Durations get shorter as elements get smaller, and easing is
 * asymmetric — a decelerating curve (`easeOut`) on entrances, because things
 * arriving should settle rather than stop dead.
 */
import type { Transition, Variants } from "framer-motion";

export const EASE = {
  /** Decelerate. Entrances, reveals, anything appearing. */
  out: [0.16, 1, 0.3, 1] as const,
  /** Accelerate. Exits — leave quickly, they are on the way out. */
  in: [0.4, 0, 1, 1] as const,
  /** Symmetric. Things that move within the viewport, like a slider. */
  inOut: [0.65, 0, 0.35, 1] as const,
  /** A small overshoot, for selections that should feel physical. */
  spring: [0.34, 1.4, 0.64, 1] as const,
};

export const DURATION = {
  instant: 0.15,
  fast: 0.28,
  base: 0.45,
  slow: 0.7,
  /** Page-level reveals. Deliberately unhurried. */
  reveal: 0.9,
} as const;

/** Standard transitions. */
export const transition: Transition = {
  duration: DURATION.base,
  ease: EASE.out,
};
export const fastTransition: Transition = { duration: DURATION.fast, ease: EASE.out };
export const slowTransition: Transition = { duration: DURATION.reveal, ease: EASE.out };

/**
 * Hero / page-header text reveal.
 *
 * Staggered so the eyebrow, headline and subhead arrive in reading order. The
 * `custom` prop lets a parent pass an index for a per-item delay, which is more
 * robust than hard-coding `delayChildren` when children are conditional.
 */
export const staggerContainer = (stagger = 0.08, delayChildren = 0): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: stagger, delayChildren },
  },
});

export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.reveal, ease: EASE.out },
  },
};

export const fadeInItem: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.slow, ease: EASE.out } },
};

/** Scroll-triggered reveal. Used for cards and sections. */
export const whileInViewVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.reveal, ease: EASE.out },
  },
};

/**
 * Longest a staggered item's delay may grow to.
 *
 * Without a cap, a 24-item menu staggers for well over a second and the last
 * row looks broken rather than choreographed. Past this point every remaining
 * item arrives at once.
 */
const STAGGER_CAP = 0.5;

/**
 * Staggered grid of cards.
 *
 * `custom` is the card index; the delay is capped so a long grid does not take
 * seconds to finish appearing. Capping matters: a stagger that scales linearly
 * with item count looks broken on long lists.
 */
export const gridStagger = (stagger = 0.06): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger } },
});

export const gridItem: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION.slow,
      ease: EASE.out,
      delay: Math.min(index * 0.06, STAGGER_CAP),
    },
  }),
};

/**
 * Multi-step booking flow transition.
 *
 * Direction is decided from a custom prop so the incoming step slides in from
 * the correct side: forward (next) enters from the right, back enters from the
 * left. Without this, going back through the flow feels like it is running
 * backwards.
 */
export const stepVariants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 48 : -48,
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION.base, ease: EASE.out },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -48 : 48,
    transition: { duration: DURATION.fast, ease: EASE.in },
  }),
};

/** The step that expands to confirm a selection, e.g. a time slot. */
export const selectionPulse: Variants = {
  idle: { scale: 1 },
  selected: {
    scale: [1, 1.06, 1],
    transition: { duration: 0.42, ease: EASE.spring },
  },
};

/** Navbar shrink. Kept in JS rather than CSS so it can coordinate with scroll. */
export const navShrink = {
  hidden: { height: 96, backgroundColor: "rgba(253, 248, 243, 0)" },
  visible: {
    height: 68,
    backgroundColor: "rgba(253, 248, 243, 0.88)",
    transition: { duration: DURATION.base, ease: EASE.out },
  },
};

/** Sheet/modal enter-exit. */
export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast } },
  exit: { opacity: 0, transition: { duration: DURATION.instant } },
};

export const sheetVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE.out } },
  exit: { opacity: 0, y: 16, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE.in } },
};

/** Dashboard chart entrance: bars grow from the baseline. */
export const barGrow: Variants = {
  hidden: { scaleY: 0 },
  visible: (index: number = 0) => ({
    scaleY: 1,
    transition: { duration: 0.8, ease: EASE.out, delay: Math.min(index * 0.04, 0.6) },
  }),
};

/** Card hover lift, as a motion value pair. */
export const cardHover = {
  rest: { y: 0, transition: { duration: DURATION.base, ease: EASE.out } },
  hover: { y: -6, transition: { duration: DURATION.fast, ease: EASE.out } },
};

/** Button press. */
export const buttonTap = { scale: 0.97 };
