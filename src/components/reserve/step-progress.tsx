"use client";

/**
 * Booking progress indicator.
 *
 * Doubles as navigation: every completed step is a button that takes the guest
 * back, because "I picked the wrong date" is a real and common impulse and
 * making it four taps of "back" makes the flow feel like a form to be endured
 * rather than a booking to be made.
 *
 * The active marker is a single element moved with `layoutId` instead of five
 * animated indicators. One shared element sliding between positions reads as
 * one thing moving; five independently fading markers read as five things
 * blinking.
 */
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { BOOKING_STEPS, type BookingStepIndex } from "@/store/booking-store";
import { cn } from "@/lib/format";
import { DURATION, EASE } from "@/lib/motion";

export function StepProgress({
  current,
  onJump,
}: {
  current: BookingStepIndex;
  onJump: (step: BookingStepIndex) => void;
}) {
  return (
    <nav aria-label="Booking progress">
      <ol className="flex items-center">
        {BOOKING_STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          // Only backwards navigation, or one step ahead: see `goTo` in the store.
          const reachable = i <= current + 1;

          return (
            <li key={step.id} className="flex items-center">
              <button
                type="button"
                onClick={() => reachable && onJump(i as BookingStepIndex)}
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex items-center gap-2 rounded-full py-1 pl-1 pr-1 transition-opacity",
                  i === 0 ? "pl-1" : "pl-0",
                  reachable ? "cursor-pointer" : "cursor-default",
                  active ? "pr-3" : "pr-1",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors duration-300",
                    done && "bg-olive-soft text-olive",
                    active && "text-accent-contrast",
                    !done && !active && "bg-surface-raised text-ink-subtle",
                  )}
                >
                  {/* The travelling marker. `absolute inset-0` so it sits behind
                      the number and never affects the button's width. */}
                  {active ? (
                    <motion.span
                      layoutId="booking-step-marker"
                      className="absolute inset-0 rounded-full bg-accent"
                      transition={{ duration: DURATION.base, ease: EASE.spring }}
                    />
                  ) : null}
                  <span className="relative z-10">
                    {done ? <Check size={14} strokeWidth={2.5} /> : i + 1}
                  </span>
                </span>

                <span className="hidden sm:block">
                  <span
                    className={cn(
                      "block text-xs font-medium leading-tight transition-colors",
                      active ? "text-ink" : "text-ink-subtle",
                    )}
                  >
                    {step.label}
                  </span>
                </span>

                <span className="sr-only sm:hidden">
                  Step {i + 1} of {BOOKING_STEPS.length}: {step.hint}
                </span>
              </button>

              {i < BOOKING_STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mx-1 h-px w-4 transition-colors duration-500 sm:mx-2 sm:w-8",
                    i < current ? "bg-olive/40" : "bg-border-strong",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
