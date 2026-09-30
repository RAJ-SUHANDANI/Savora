"use client";

/**
 * Form primitives shared by the sign-in and register forms.
 *
 * Extracted because the two forms would otherwise each carry their own copy, and
 * the copies would drift: the show/hide toggle in particular is a control whose
 * whole job is to behave identically between the two screens a guest sees in
 * sequence.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

import { scorePassword } from "@/lib/password";
import { cn } from "@/lib/format";
import { DURATION, EASE } from "@/lib/motion";

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {error ? (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          id={`${id}-error`}
          className="mt-1.5 flex items-center gap-1.5 text-xs text-wine"
        >
          <AlertCircle size={12} aria-hidden="true" />
          {error}
        </motion.p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Password field with a show/hide toggle.
 *
 * The toggle is a real `<button type="button">` carrying `aria-pressed`, so it
 * is reachable by keyboard and announced as a toggle whose state can be read.
 * Pressing it cannot submit the form.
 *
 * The `<input>` lives here rather than in the caller because the caller passes
 * `{...register("password")}` and `type` has to be able to win over that spread
 * — hence the explicit props instead of a blind `...rest`.
 */
export function PasswordInput({
  id,
  invalid,
  registration,
  autoComplete,
  placeholder,
}: {
  id: string;
  invalid?: boolean;
  /** The spread returned by react-hook-form's `register()`. */
  registration: {
    name: string;
    onChange: React.ChangeEventHandler<HTMLInputElement>;
    onBlur: React.ChangeEventHandler<HTMLInputElement>;
    ref: (instance: HTMLInputElement | null) => void;
  };
  autoComplete?: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...registration}
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={cn("field pr-12", invalid && "field-error")}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={id}
        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-raised hover:text-ink"
      >
        {/* Both icons are stacked and cross-faded, so the button never resizes
            and there is no icon pop between states. */}
        <span className="relative block h-4 w-4" aria-hidden="true">
          <EyeOff
            size={16}
            className={cn(
              "absolute inset-0 transition-opacity duration-200",
              visible ? "opacity-0" : "opacity-100",
            )}
          />
          <Eye
            size={16}
            className={cn(
              "absolute inset-0 transition-opacity duration-200",
              visible ? "opacity-100" : "opacity-0",
            )}
          />
        </span>
      </button>
    </div>
  );
}

/**
 * Password strength meter for registration.
 *
 * A coarse four-band bar rather than a score out of 100: a guest told "72/100,
 * add a special character" and who registers anyway has been given a rule
 * without a reason. "This would take a lot of guessing" is both true and
 * actionable, and it is the only property that matters.
 *
 * The verdict is mirrored into a polite live region so it is announced once it
 * settles, instead of a bar being read out on every keystroke.
 */
export function PasswordStrength({ password }: { password: string }) {
  const band = scorePassword(password);

  return (
    <div className="mt-2.5">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="h-1 flex-1 rounded-full"
            initial={false}
            animate={{
              backgroundColor: i < band.score ? band.colour : "var(--color-surface-sunken)",
            }}
            transition={{ duration: DURATION.fast, ease: EASE.out }}
          />
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {password ? (
          <motion.p
            key={band.label}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast }}
            className="mt-1.5 text-xs text-ink-subtle"
            aria-hidden="true"
          >
            {band.label}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {password ? band.label : ""}
      </span>
    </div>
  );
}
