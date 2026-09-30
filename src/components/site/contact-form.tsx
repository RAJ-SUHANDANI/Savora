"use client";

/**
 * Contact form.
 *
 * React Hook Form + Zod, validating against the *same* `contactSchema` the
 * server uses (lib/validation.ts). Sharing the schema is the point: the inline
 * error a guest sees and the error the server enforces can never disagree, and
 * adding a field cannot be left half-finished.
 *
 * RHF drives the submit rather than the form's `action` attribute. Both at once
 * would fire the action twice — once from RHF's validated path and once from
 * the browser's own submission — and the guest would get two emails.
 *
 * The `website` field is a honeypot: `aria-hidden`, `tabIndex={-1}` and
 * `autoComplete="off"`, so a human never meets it, and its schema rule rejects
 * anything non-empty.
 */
import { useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Send } from "lucide-react";

import { contactSchema, type ContactInput } from "@/lib/validation";
import { sendContactMessage, type ContactState } from "@/app/contact/actions";
import { DURATION, EASE } from "@/lib/motion";
import { cn } from "@/lib/format";

const INITIAL: ContactState = { status: "idle" };

export function ContactForm() {
  const [state, formAction, pending] = useActionState<ContactState, FormData>(
    sendContactMessage,
    INITIAL,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", subject: "", message: "", website: "" },
  });

  // Clear the message field once the enquiry is acknowledged, keeping the name
  // and email so a follow-up question does not mean typing everything again.
  useEffect(() => {
    if (state.status === "sent") {
      reset((prev) => ({ ...prev, subject: "", message: "" }));
    }
  }, [state, reset]);

  /** Runs only when the client-side schema has already passed. */
  const onValid = handleSubmit((values) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string") formData.append(key, value);
    }
    return formAction(formData);
  });

  // The server can still reject — a rate limit, a spam filter, a honeypot the
  // schema missed — so its per-field errors are merged in underneath RHF's.
  const serverFields = state.status === "error" ? (state.fields ?? {}) : {};
  const busy = pending || isSubmitting;

  return (
    <div className="card relative overflow-hidden p-8 md:p-10">
      <AnimatePresence mode="wait" initial={false}>
        {state.status === "sent" ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE.out }}
            className="py-8 text-center"
            role="status"
          >
            <motion.span
              initial={{ scale: 0.7 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, ease: EASE.spring, delay: 0.1 }}
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-olive-soft text-olive"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.span>
            <h3 className="mt-6 font-display text-2xl">Thank you — that is with us</h3>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">
              We have sent you a copy by email and will reply, usually the same day.
              If it is urgent, please telephone instead.
            </p>
            <button type="button" onClick={() => window.location.reload()} className="btn btn-secondary btn-sm mt-7">
              Send another message
            </button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={onValid}
            noValidate
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: DURATION.fast, ease: EASE.out }}
          >
            <h2 className="font-display text-2xl">Write to us</h2>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
              For anything that is not a booking. We read everything, and it usually
              takes a day to come back to you.
            </p>

            <div className="mt-8 space-y-5">
              <Field id="name" label="Your name" error={errors.name?.message ?? serverFields.name}>
                <input
                  id="name"
                  className={cn("field", (errors.name || serverFields.name) && "field-error")}
                  autoComplete="name"
                  placeholder="Ida Lindqvist"
                  aria-invalid={Boolean(errors.name || serverFields.name)}
                  {...register("name")}
                />
              </Field>

              <Field id="email" label="Email" error={errors.email?.message ?? serverFields.email}>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  className={cn("field", (errors.email || serverFields.email) && "field-error")}
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-invalid={Boolean(errors.email || serverFields.email)}
                  {...register("email")}
                />
              </Field>

              <Field id="subject" label="Subject" error={errors.subject?.message ?? serverFields.subject}>
                <input
                  id="subject"
                  className={cn("field", (errors.subject || serverFields.subject) && "field-error")}
                  placeholder="A private room in November"
                  aria-invalid={Boolean(errors.subject || serverFields.subject)}
                  {...register("subject")}
                />
              </Field>

              <Field id="message" label="Message" error={errors.message?.message ?? serverFields.message}>
                <textarea
                  id="message"
                  rows={5}
                  className={cn("field resize-y", (errors.message || serverFields.message) && "field-error")}
                  placeholder="Tell us what you have in mind…"
                  aria-invalid={Boolean(errors.message || serverFields.message)}
                  {...register("message")}
                />
              </Field>

              {/* Honeypot — off-screen, unfocusable, and fatal to bots. */}
              <div className="absolute left-[-9999px] h-px w-px overflow-hidden" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input id="website" tabIndex={-1} autoComplete="off" {...register("website")} />
              </div>
            </div>

            {state.status === "error" && !Object.keys(serverFields).length ? (
              <p
                className="mt-6 flex items-start gap-2 rounded-xl border border-wine/25 bg-wine/5 px-4 py-3 text-sm text-wine"
                role="alert"
              >
                <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                {state.message}
              </p>
            ) : null}

            <button type="submit" disabled={busy} className="btn btn-primary mt-8 w-full sm:w-auto">
              {busy ? "Sending…" : "Send message"}
              {busy ? null : <Send size={15} aria-hidden="true" />}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
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
      ) : null}
    </div>
  );
}
