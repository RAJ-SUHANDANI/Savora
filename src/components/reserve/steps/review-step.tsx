"use client";

/**
 * Step 5 — review and confirm.
 *
 * The confirmation screen is where a mistake becomes expensive, so the summary
 * is an actual review: every row has a "Change" button that returns to the step
 * that owns it, rather than making the guest press "back" three times.
 *
 * Before the button is enabled the chosen slot is **re-checked** against live
 * availability. The slot grid from step three is advisory — it was fetched, then
 * the guest read their details, and in that window somebody else can take the
 * table. The database would reject the booking anyway, but by then the guest has
 * already typed their email; catching it here turns a failure into a suggestion
 * of the next three times that are actually free.
 */
import { motion } from "framer-motion";
import { AlertCircle, CalendarDays, Clock, Mail, MapPin, MessageSquare, Pencil, RefreshCw, Users } from "lucide-react";

import { StepHeading } from "@/components/reserve/step-heading";
import { SlotSkeleton } from "@/components/ui/skeleton";
import type { SlotsStatus } from "@/components/reserve/use-slots";
import type { BookingStepIndex } from "@/store/booking-store";
import { ZONE_LABELS, ZONE_SHORT, type Zone } from "@/lib/constants";
import { cn, formatDate, formatTime } from "@/lib/format";
import { DURATION, EASE } from "@/lib/motion";

export type Conflict = {
  message: string;
  suggestedTimes: string[];
} | null;

type Props = {
  date: string;
  partySize: number;
  time: string;
  zonePref: Zone | null;
  tableNumber: number | null;
  guest: {
    guestName: string;
    guestEmail: string;
    guestPhone: string;
    occasion: string;
    specialRequests: string;
  };
  /** Live re-check state for the chosen slot. */
  verifyStatus: SlotsStatus;
  verifyError: string | null;
  chosenStillFree: boolean | null;
  submitting: boolean;
  error: string | null;
  conflict: Conflict;
  holdMinutes: number;
  onJump: (step: BookingStepIndex) => void;
  onRetryVerify: () => void;
  onPickSuggested: (time: string) => void;
};

export function ReviewStep({
  date,
  partySize,
  time,
  zonePref,
  tableNumber,
  guest,
  verifyStatus,
  verifyError,
  chosenStillFree,
  submitting,
  error,
  conflict,
  holdMinutes,
  onJump,
  onRetryVerify,
  onPickSuggested,
}: Props) {
  // A conflict is a distinct state from an error: the booking is not broken,
  // the *time* is unavailable, and there is usually a way forward. It is also
  // the only state that must hard-block a second submit — retrying the same
  // time is how a guest ends up rate-limited.
  const blocked =
    verifyStatus === "loading" || chosenStillFree === false || conflict !== null;

  return (
    <div>
      <StepHeading
        stepLabel="Last step"
        title="Does this look right?"
        hint="Nothing is booked until you press the button."
      />

      {/* ---- Summary ---------------------------------------------------- */}
      <dl className="mt-9 divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle">
        <Row icon={<CalendarDays size={15} />} label="Date" onEdit={() => onJump(0)}>
          {formatDate(date)}
        </Row>
        <Row icon={<Users size={15} />} label="Party" onEdit={() => onJump(1)}>
          {partySize} {partySize === 1 ? "guest" : "guests"}
        </Row>
        <Row icon={<Clock size={15} />} label="Time" onEdit={() => onJump(2)}>
          {formatTime(time)}
          {tableNumber ? (
            <span className="text-ink-subtle"> · table {tableNumber}</span>
          ) : null}
        </Row>
        <Row icon={<MapPin size={15} />} label="Seating" onEdit={() => onJump(2)}>
          {zonePref ? ZONE_LABELS[zonePref] : "Wherever suits on the night"}
        </Row>
        <Row icon={<Mail size={15} />} label="Confirmation to" onEdit={() => onJump(3)}>
          {guest.guestEmail}
          {guest.guestPhone ? (
            <span className="mt-0.5 block text-ink-subtle">{guest.guestPhone}</span>
          ) : null}
        </Row>
        {guest.occasion ? (
          <Row icon={<CalendarDays size={15} />} label="Occasion" onEdit={() => onJump(3)}>
            {guest.occasion}
          </Row>
        ) : null}
        {guest.specialRequests ? (
          <Row icon={<MessageSquare size={15} />} label="Requests" onEdit={() => onJump(3)}>
            {guest.specialRequests}
          </Row>
        ) : null}
      </dl>

      {/* ---- What stopped us -------------------------------------------- */}
      <div className="mt-6 space-y-4">
        {/* Waiting on the re-check. */}
        {verifyStatus === "loading" ? (
          <div>
            <p className="mb-3 flex items-center gap-1.5 text-xs text-ink-subtle">
              <RefreshCw size={12} className="animate-spin" aria-hidden="true" />
              Checking {formatTime(time)} is still free…
            </p>
            <SlotSkeleton count={6} />
          </div>
        ) : null}

        {/* The slot went between step three and now. */}
        {verifyStatus !== "loading" && !conflict && chosenStillFree === false ? (
          <Notice tone="warn" icon={<AlertCircle size={15} aria-hidden="true" />}>
            <strong className="font-medium">{formatTime(time)} has just been taken.</strong>{" "}
            Nothing is wrong with your details — pick another sitting and you are booked in.
            <button
              type="button"
              onClick={() => onJump(2)}
              className="btn btn-secondary btn-sm mt-3"
            >
              See all available times
            </button>
          </Notice>
        ) : null}

        {/* The write was refused. Alternatives first, always. */}
        {conflict ? (
          <Notice tone="warn" icon={<AlertCircle size={15} aria-hidden="true" />}>
            {conflict.message}
            {conflict.suggestedTimes.length ? (
              <>
                <span className="mt-2 block text-ink-muted">
                  These are free right now — pick one and we will finish the booking:
                </span>
                <div className="mt-3 flex flex-wrap gap-2">
                  {conflict.suggestedTimes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onPickSuggested(t)}
                      className="rounded-full border border-accent bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-contrast transition-transform hover:scale-[1.03]"
                    >
                      {formatTime(t)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onJump(2)}
                className="btn btn-secondary btn-sm mt-3"
              >
                Choose another time
              </button>
            )}
          </Notice>
        ) : null}

        {/* The lookup itself failed. Not fatal — the database has the final say. */}
        {verifyStatus === "error" && !conflict ? (
          <Notice tone="warn" icon={<AlertCircle size={15} aria-hidden="true" />}>
            {verifyError} You can still try to book — we will tell you at the last moment if it
            has gone.
            <button type="button" onClick={onRetryVerify} className="btn btn-ghost btn-sm mt-2 -ml-2">
              <RefreshCw size={12} aria-hidden="true" />
              Check again
            </button>
          </Notice>
        ) : null}

        {/* Anything else. */}
        {error && !conflict ? (
          <Notice tone="error" icon={<AlertCircle size={15} aria-hidden="true" />}>
            {error}
          </Notice>
        ) : null}
      </div>

      {/* ---- Confirm ----------------------------------------------------- */}
      <motion.button
        type="submit"
        disabled={submitting || blocked}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: DURATION.instant }}
        className="btn btn-primary mt-8 w-full sm:w-auto"
      >
        {submitting ? "Confirming…" : blocked ? "Waiting for availability…" : "Confirm reservation"}
      </motion.button>

      <p className="mt-5 max-w-md text-xs leading-relaxed text-ink-subtle">
        {zonePref && zonePref !== "INDOOR" ? (
          <>We will hold a {ZONE_SHORT[zonePref].toLowerCase()} table if one is free. </>
        ) : null}
        By booking you agree to our{" "}
        <a href="/terms" className="link-underline text-accent">
          terms
        </a>
        . We hold the table for {holdMinutes} minutes past your booking time.
      </p>
    </div>
  );
}

function Row({
  icon,
  label,
  onEdit,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 bg-surface px-5 py-4">
      <span className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs uppercase tracking-[0.12em] text-ink-subtle">{label}</dt>
        <dd className="mt-1 text-sm leading-relaxed break-words">{children}</dd>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="btn btn-ghost btn-sm -mr-2 shrink-0"
        aria-label={`Change the ${label.toLowerCase()}`}
      >
        <Pencil size={12} aria-hidden="true" />
        Change
      </button>
    </div>
  );
}

function Notice({
  tone,
  icon,
  children,
}: {
  tone: "warn" | "error";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE.out }}
      className={cn(
        "rounded-xl border px-4 py-3.5 text-sm leading-relaxed",
        tone === "warn"
          ? "border-saffron/35 bg-saffron/8 text-ink"
          : "border-wine/25 bg-wine/5 text-wine",
      )}
      role="alert"
    >
      <p className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">{children}</span>
      </p>
    </motion.div>
  );
}
