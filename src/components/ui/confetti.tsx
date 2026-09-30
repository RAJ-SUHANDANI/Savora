"use client";

import { useEffect } from "react";

/**
 * Confetti burst.
 *
 * `canvas-confetti` touches `window` at import time, so a static import would
 * break the server render. A dynamic `import()` inside `useEffect` solves it
 * more directly than `next/dynamic`: the module is only ever reached in the
 * browser, after hydration, and there is no extra component boundary.
 *
 * The burst is tuned rather than default: a hard spray of a hundred pieces
 * reads as a party-popper, not a restaurant. This is a soft, warm-coloured
 * double-fountain from just off the bottom of the screen, so the pieces arc
 * *into* the frame from below the checkmark rather than covering it.
 */

type Options = {
  /** Disable for users who prefer reduced motion. */
  respectReducedMotion?: boolean;
  intensity?: number;
};

export function ConfettiBurst({ respectReducedMotion = true, intensity = 1 }: Options) {
  useEffect(() => {
    if (respectReducedMotion && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let cancelled = false;

    (async () => {
      const confetti = (await import("canvas-confetti")).default;
      if (cancelled) return;

      // The brand palette, so the celebration belongs to the restaurant rather
      // than looking like a default particle demo.
      const colors = ["#C4623F", "#D99B2E", "#5F6F52", "#FDF8F3", "#E8DAC8"];

      const shoot = (particleCount: number, spread: number, origin: { x: number; y: number }, angle: number) => {
        confetti({
          particleCount: Math.round(particleCount * intensity),
          spread,
          startVelocity: 34,
          gravity: 0.9,
          scalar: 0.9,
          ticks: 220,
          origin,
          angle,
          colors,
          disableForReducedMotion: respectReducedMotion,
        });
      };

      // Two offset fountains, the second slightly later and tighter for depth.
      shoot(46, 62, { x: 0.28, y: 0.78 }, 62);
      shoot(46, 62, { x: 0.72, y: 0.78 }, 118);

      setTimeout(() => {
        if (!cancelled) shoot(28, 48, { x: 0.5, y: 0.72 }, 90);
      }, 180);
    })();

    return () => {
      cancelled = true;
    };
  }, [respectReducedMotion, intensity]);

  return null;
}
