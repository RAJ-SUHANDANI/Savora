import type { ReactNode } from "react";

/**
 * Shared heading for a booking step.
 *
 * Not a client component: it renders no hooks, so every step can import it
 * without pulling `"use client"` across the boundary. `hint` is a `ReactNode`
 * because the time step's lede mixes plain text with a formatted date.
 */
export function StepHeading({
  stepLabel,
  title,
  hint,
}: {
  stepLabel: string;
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div>
      <p className="eyebrow">{stepLabel}</p>
      <h2 className="mt-3.5 font-display text-display-md">{title}</h2>
      {hint ? <p className="mt-3 text-sm leading-relaxed text-ink-muted">{hint}</p> : null}
    </div>
  );
}
