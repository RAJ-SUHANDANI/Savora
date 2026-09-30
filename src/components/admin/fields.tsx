"use client";

/**
 * Dashboard form primitives.
 *
 * ## Why these exist separately from `components/auth/fields.tsx`
 *
 * The auth `Field` is a client component shaped for react-hook-form: it takes a
 * spread of `register()` props, animates its error message in, and carries the
 * password strength meter. The dashboard's forms are plain `<form action>`
 * server-action forms with no RHF in the loop, and they are dense — a dish has
 * nine fields and a settings screen has twenty. Reusing the auth component would
 * have meant threading a `registration` prop that is always absent.
 *
 * What *is* shared is the contract: `class="label"`, `class="field"`,
 * `class="field-error"`, so every input in the product looks like the same
 * input. That lives in `globals.css` and is what makes these feel native rather
 * than bolted on.
 *
 * ## Errors arrive as `errors: Record<string, string>`
 *
 * Every dashboard action validates with zod and returns field errors keyed by
 * name. `Field` here looks its message up by name, so a form author never has to
 * wire `aria-describedby` by hand — and, more importantly, cannot forget to, which
 * is how an error message ends up visible to sighted users and invisible to a
 * screen reader.
 */
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Check } from "lucide-react";

import { cn } from "@/lib/format";

type FieldProps = {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
};

/**
 * Label + control + message, with the accessibility wiring done once.
 *
 * `children` is a function so the ids can be handed *into* the control. Passing
 * them down as props instead would mean the caller either ignores them or
 * reimplements the lookup, and both failure modes are silent.
 *
 * There is deliberately no `invalid` prop: marking the control invalid is the
 * child's job, because only the child knows its own element. `Field` decides
 * whether a *message* is shown, and the caller decides whether the input is
 * red — which also means a control that is not an `<input>` can still be marked
 * without this component needing to know what it is.
 */
export function Field({ name, label, hint, error, className, children }: FieldProps) {
  const id = `f-${name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children({ id, describedBy })}
      {error ? (
        <p id={errorId} className="mt-1.5 flex items-center gap-1.5 text-xs text-wine">
          <AlertCircle size={12} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  id,
  describedBy,
  invalid,
  className,
  ...rest
}: {
  id: string;
  describedBy?: string;
  invalid?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn("field", invalid && "field-error", className)}
    />
  );
}

export function TextArea({
  id,
  describedBy,
  invalid,
  className,
  ...rest
}: {
  id: string;
  describedBy?: string;
  invalid?: boolean;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn("field min-h-20 resize-y", invalid && "field-error", className)}
    />
  );
}

export function Select({
  id,
  describedBy,
  invalid,
  className,
  children,
  ...rest
}: {
  id: string;
  describedBy?: string;
  invalid?: boolean;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn("field pr-9", invalid && "field-error", className)}
    >
      {children}
    </select>
  );
}

/**
 * A single checkbox, styled as a control rather than a system checkbox.
 *
 * A native `<input type="checkbox">` is the correct element and stays underneath —
 * it is what carries the name/value into the FormData, and it is what a keyboard
 * and a screen reader operate. The visible box is a `<span>` styled from
 * `peer-checked:`. Replacing the control with a styled `<div>` and an
 * `onClick` would lose all of that, and would also lose the ability to submit
 * the form with Enter.
 *
 * `peer` has to be a *sibling* of the styled element, which is why the input
 * comes first and the label wraps only the visuals.
 */
export function Checkbox({
  name,
  value,
  label,
  hint,
  defaultChecked,
  disabled,
  className,
}: {
  name: string;
  /**
   * What lands in the FormData. Omitted for a boolean, where the presence of the
   * key *is* the value — which is why `saveMenuItem` compares `formData.get(…)`
   * against `"on"` rather than parsing anything.
   */
  value?: string;
  label: ReactNode;
  hint?: ReactNode;
  defaultChecked?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5", disabled && "cursor-not-allowed opacity-60", className)}>
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-border-strong bg-surface text-transparent transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:text-cream peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-surface"
      >
        <Check size={11} strokeWidth={3} />
      </span>
      <span className="min-w-0 text-sm leading-snug">
        <span className={disabled ? "text-ink-subtle" : "text-ink"}>{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-subtle">{hint}</span> : null}
      </span>
    </label>
  );
}

/**
 * The result banner for a dashboard form.
 *
 * `role="status"` rather than `role="alert"`: a save confirmation is not an
 * emergency, and `alert` interrupts whatever a screen reader is currently
 * saying. `aria-live="polite"` on the wrapper means the message is announced when
 * it appears without cutting across the submission.
 */
export function FormBanner({
  state,
  className,
}: {
  state: { ok: boolean; message: string } | null;
  className?: string;
}) {
  if (!state || !state.message) return null;
  return (
    <p
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm",
        state.ok
          ? "border-olive/30 bg-olive-soft text-ink"
          : "border-wine/30 bg-wine/10 text-ink",
        className,
      )}
    >
      {state.ok ? (
        <Check size={14} className="shrink-0 text-olive" aria-hidden="true" />
      ) : (
        <AlertCircle size={14} className="shrink-0 text-wine" aria-hidden="true" />
      )}
      {state.message}
    </p>
  );
}

/**
 * The submit button of a dashboard form.
 *
 * Uses `useFormStatus` rather than a prop, so it can only be used *inside* the
 * `<form>` it submits. That is the point: a `busy` prop threaded in by hand
 * works right up until someone adds a second submit path, and then one of them
 * stays enabled and the owner double-submits.
 */
export function SubmitButton({
  children,
  className,
  variant = "primary",
}: {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  // `useFormStatus` reads the enclosing `<form>`'s state via context, so it is
  // only valid inside one — which is exactly the constraint that makes this
  // safe. A `busy` prop threaded in by hand works right up until someone adds a
  // second submit path, and then one of them stays enabled and the owner
  // double-submits a dish.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "btn",
        variant === "primary" ? "btn-primary" : "btn-secondary",
        className,
      )}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
