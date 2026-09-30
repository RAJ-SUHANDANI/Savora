"use client";

/**
 * Step 2 — the party size.
 *
 * A grid of numbers rather than a `<select>`: a select hides the whole range
 * behind one collapsed row, and picking "4" from a list of twelve is faster
 * than opening a menu and reading it. The two are not equivalent when the most
 * common answer is one of four or five options.
 *
 * The sizes are capped at the restaurant's own `maxPartySize`, which is owner
 * config rather than a constant. If a party is larger than the grid, the answer
 * is a phone number, and it is offered as one rather than as a disabled control
 * with no explanation.
 */
import { motion } from "framer-motion";
import { Phone, Users } from "lucide-react";

import { StepHeading } from "@/components/reserve/step-heading";
import { cn } from "@/lib/format";
import { gridItem, gridStagger } from "@/lib/motion";

type Props = {
  value: number | null;
  maxPartySize: number;
  onChange: (size: number) => void;
  phone: string;
};

export function PartyStep({ value, maxPartySize, onChange, phone }: Props) {
  const sizes = Array.from({ length: maxPartySize }, (_, i) => i + 1);

  return (
    <div>
      <StepHeading
        stepLabel="Step two"
        title="How many of you are coming?"
        hint="Including yourself. We seat parties of two to twelve at a table."
      />

      <motion.ul
        variants={gridStagger(0.03)}
        initial="hidden"
        animate="visible"
        className="mt-9 grid grid-cols-4 gap-2.5 sm:grid-cols-6 md:gap-3"
      >
        {sizes.map((size, i) => {
          const selected = size === value;
          return (
            <motion.li key={size} variants={gridItem} custom={i}>
              <button
                type="button"
                onClick={() => onChange(size)}
                aria-pressed={selected}
                className={cn(
                  "flex h-[4.5rem] w-full flex-col items-center justify-center gap-0.5 rounded-2xl border transition-all duration-300",
                  selected
                    ? "border-accent bg-accent text-accent-contrast shadow-[var(--shadow-lifted)]"
                    : "border-border-subtle bg-surface hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[var(--shadow-subtle)]",
                )}
              >
                <span className="font-display text-2xl leading-none">{size}</span>
                <span
                  className={cn(
                    "text-[0.625rem] uppercase tracking-wider",
                    selected ? "text-accent-contrast/70" : "text-ink-subtle",
                  )}
                >
                  {size === 1 ? "guest" : "guests"}
                </span>
              </button>
            </motion.li>
          );
        })}
      </motion.ul>

      <p className="mt-8 flex items-start gap-2.5 text-sm leading-relaxed text-ink-muted">
        <Users size={15} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true" />
        <span>
          Larger than {maxPartySize}? We would love to seat you — call{" "}
          <a
            href={`tel:${phone.replace(/\s/g, "")}`}
            className="link-underline inline-flex items-center gap-1 text-accent"
          >
            <Phone size={12} aria-hidden="true" />
            {phone}
          </a>{" "}
          and we will set the private room aside for you.
        </span>
      </p>
    </div>
  );
}
