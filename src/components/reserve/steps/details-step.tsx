"use client";

/**
 * Step 4 — guest details.
 *
 * React Hook Form validating against `guestDetailsSchema`, the same Zod object
 * the POST route re-validates with. Sharing the schema is the whole point: the
 * inline error a guest sees and the rule the server enforces are the same
 * sentence, and adding a field cannot be left half-finished.
 *
 * The `website` field is a honeypot. It is off-screen, `aria-hidden`,
 * `tabIndex={-1}` and `autoComplete="off"`, so a human never meets it — and the
 * schema's `max(0)` turns anything a bot fills in into a silent rejection at
 * the route.
 */
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { motion } from "framer-motion";
import { AlertCircle, CakeSlice, Lock, Mail, Phone, User } from "lucide-react";

import { StepHeading } from "@/components/reserve/step-heading";
import type { GuestDetails } from "@/lib/validation";
import { cn } from "@/lib/format";

/** Occasions worth offering; anything else belongs in the free-text requests. */
const OCCASIONS = [
  "",
  "Birthday",
  "Anniversary",
  "Celebration",
  "Business dinner",
  "First date",
  "No occasion — just dinner",
] as const;

type Props = {
  register: UseFormRegister<GuestDetails>;
  errors: FieldErrors<GuestDetails>;
  /** Errors the server returned, merged under RHF's own. */
  serverFields: Record<string, string>;
  signedIn: boolean;
};

export function DetailsStep({ register, errors, serverFields, signedIn }: Props) {
  return (
    <div>
      <StepHeading
        stepLabel="Step four"
        title="Who should we expect?"
        hint="So the kitchen can have the right table ready, and so we can send the confirmation."
      />

      <div className="mt-9 space-y-5">
        <Field
          id="guestName"
          label="Name for the booking"
          icon={<User size={14} aria-hidden="true" />}
          error={errors.guestName?.message ?? serverFields.guestName}
        >
          <input
            id="guestName"
            className={cn("field", (errors.guestName || serverFields.guestName) && "field-error")}
            autoComplete="name"
            placeholder="Ida Lindqvist"
            aria-invalid={Boolean(errors.guestName || serverFields.guestName)}
            aria-describedby={errors.guestName ? "guestName-error" : undefined}
            {...register("guestName")}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="guestEmail"
            label="Email"
            icon={<Mail size={14} aria-hidden="true" />}
            error={errors.guestEmail?.message ?? serverFields.guestEmail}
          >
            <input
              id="guestEmail"
              type="email"
              inputMode="email"
              className={cn("field", (errors.guestEmail || serverFields.guestEmail) && "field-error")}
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={Boolean(errors.guestEmail || serverFields.guestEmail)}
              {...register("guestEmail")}
            />
          </Field>

          <Field
            id="guestPhone"
            label="Phone (optional)"
            icon={<Phone size={14} aria-hidden="true" />}
            error={errors.guestPhone?.message ?? serverFields.guestPhone}
          >
            <input
              id="guestPhone"
              type="tel"
              inputMode="tel"
              className={cn("field", (errors.guestPhone || serverFields.guestPhone) && "field-error")}
              autoComplete="tel"
              placeholder="+44 7700 900123"
              aria-invalid={Boolean(errors.guestPhone || serverFields.guestPhone)}
              {...register("guestPhone")}
            />
          </Field>
        </div>

        <Field
          id="occasion"
          label="Is there an occasion? (optional)"
          icon={<CakeSlice size={14} aria-hidden="true" />}
          error={errors.occasion?.message ?? serverFields.occasion}
        >
          <select id="occasion" className="field" {...register("occasion")}>
            {OCCASIONS.map((occasion) => (
              <option key={occasion} value={occasion}>
                {occasion || "Nothing in particular"}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="specialRequests"
          label="Anything we should know? (optional)"
          icon={null}
          error={errors.specialRequests?.message ?? serverFields.specialRequests}
          hint="Allergies, access needs, a pushchair, a seat by the fire — anything that helps us get the table right."
        >
          <textarea
            id="specialRequests"
            rows={4}
            className={cn(
              "field resize-y",
              (errors.specialRequests || serverFields.specialRequests) && "field-error",
            )}
            placeholder="One coeliac, one severe nut allergy, and we would love a quiet corner if you have one."
            aria-invalid={Boolean(errors.specialRequests || serverFields.specialRequests)}
            {...register("specialRequests")}
          />
        </Field>

        {/* Honeypot — off-screen, unfocusable, and fatal to bots. */}
        <div className="absolute left-[-9999px] h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" tabIndex={-1} autoComplete="off" {...register("website")} />
        </div>
      </div>

      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-8 flex items-start gap-2.5 rounded-xl border border-border-subtle bg-surface-raised px-4 py-3.5 text-sm leading-relaxed text-ink-muted"
      >
        <Lock size={14} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true" />
        <span>
          {signedIn
            ? "We will send the confirmation to this email, and you can cancel or change the booking from your account at any time."
            : "You do not need an account. We will email a confirmation and a link that lets you change or cancel the booking yourself."}
        </span>
      </motion.p>
    </div>
  );
}

function Field({
  id,
  label,
  icon,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label flex items-center gap-1.5">
        {icon ? <span className="text-ink-subtle">{icon}</span> : null}
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
        <p className="mt-1.5 text-xs leading-relaxed text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
