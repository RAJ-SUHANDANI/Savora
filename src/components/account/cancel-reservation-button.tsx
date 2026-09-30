"use client";

/**
 * Cancel a booking from the account dashboard.
 *
 * The API authorises this on the session (`Reservation.userId`), so no manage
 * token is involved — the guest is proving who they are, not presenting a
 * bearer credential. That is the difference between this and
 * `reserve/manage-actions.tsx`, which has to fall back to the token because a
 * guest with no account can only ever hold the emailed link.
 *
 * Two-step confirmation, inline, because a destructive action on a list of ten
 * should not put a modal between the guest and the list. On success the row
 * re-renders server-side via `router.refresh()` and slides into its cancelled
 * state, so the guest sees the same thing a reload would show.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, X } from "lucide-react";

import { DURATION, EASE } from "@/lib/motion";

type Phase = "idle" | "asking" | "busy" | "done";

export function CancelReservationButton({
  id,
  label = "Cancel booking",
}: {
  id: string;
  label?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setPhase("busy");
    setError(null);
    try {
      const params = new URLSearchParams({ reason: "Cancelled by the guest from their account" });
      const res = await fetch(`/api/reservations/${id}?${params}`, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (res.ok && body?.ok) {
        setPhase("done");
        router.refresh();
        return;
      }
      // 409 means the booking had already settled — a staff member cancelled it
      // between this list rendering and this press. Refresh so the row catches
      // up rather than leaving a button that will never work.
      if (res.status === 409) {
        setPhase("done");
        router.refresh();
        return;
      }
      setError(body?.error ?? "We could not cancel that booking.");
      setPhase("idle");
    } catch {
      setError("We could not reach the booking system. Please try again.");
      setPhase("idle");
    }
  }

  if (phase === "done") {
    return (
      <p className="text-sm text-ink-muted" role="status">
        Cancelled
      </p>
    );
  }

  return (
    <div>
      <AnimatePresence initial={false} mode="wait">
        {phase === "asking" || phase === "busy" ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: DURATION.fast, ease: EASE.out }}
            className="rounded-xl border border-wine/25 bg-wine/5 px-4 py-3"
            role="alertdialog"
            aria-label="Cancel this booking"
          >
            <p className="text-sm font-medium">Cancel this booking?</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              Your table goes back into the book straight away. We will email you to confirm.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={phase === "busy"}
                className="btn btn-primary btn-xs"
              >
                {phase === "busy" ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                ) : null}
                {phase === "busy" ? "Cancelling…" : "Yes, cancel"}
              </button>
              <button
                type="button"
                onClick={() => setPhase("idle")}
                disabled={phase === "busy"}
                className="btn btn-secondary btn-xs"
              >
                Keep it
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="trigger"
            type="button"
            onClick={() => setPhase("asking")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE.out }}
            className="btn btn-ghost btn-xs text-ink-muted hover:text-wine"
          >
            <X size={13} aria-hidden="true" />
            {label}
          </motion.button>
        )}
      </AnimatePresence>

      {error ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-xs text-wine" role="alert">
          <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
