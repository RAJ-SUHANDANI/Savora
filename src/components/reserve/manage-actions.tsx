"use client";

/**
 * Manage actions for a booking.
 *
 * A guest can cancel their own reservation, and that is deliberately all they
 * can do. Amending a booking (moving the date, changing the table) is staff-only
 * in the API, because a guest-initiated move is a new booking as far as the
 * kitchen is concerned — the email says one thing and the kitchen is told
 * another. So the honest options offered here are *cancel* and *book again*, and
 * the page copy says why.
 *
 * `token` is optional. It is the manage token when the guest followed the
 * emailed link, and `null` when they arrived from `/account` as the booking's
 * owner — the session already proves who they are, so no credential is sent.
 * The two are interchangeable server-side and this component does not need to
 * know which one it has.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, CalendarX, Loader2, X } from "lucide-react";

import { CANCELABLE_STATUSES, type ReservationStatus } from "@/lib/constants";
import { DURATION, EASE } from "@/lib/motion";

export function ManageActions({
  id,
  token,
  status,
  statusLabel,
}: {
  id: string;
  token: string | null;
  status: string;
  statusLabel: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const cancelable = CANCELABLE_STATUSES.includes(status as ReservationStatus) && !cancelled;

  if (cancelled) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.base, ease: EASE.out }}
        className="rounded-2xl border border-border-subtle bg-surface-raised px-6 py-8 text-center"
        role="status"
      >
        <CalendarX size={22} className="mx-auto text-ink-subtle" aria-hidden="true" />
        <p className="mt-4 font-display text-xl">Your table has been released</p>
        <p className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-ink-muted">
          We have emailed you to confirm. You are very welcome to book another table — we
          would rather see you another time.
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="btn btn-secondary btn-sm mt-6"
        >
          Refresh this page
        </button>
      </motion.div>
    );
  }

  if (!cancelable) {
    return (
      <p className="rounded-xl border border-border-subtle bg-surface-raised px-5 py-4 text-sm leading-relaxed text-ink-muted">
        This booking is {statusLabel.toLowerCase()}, so there is nothing left to change. If
        something is not right, telephone the restaurant and we will sort it out.
      </p>
    );
  }

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ reason: "Cancelled by the guest from the booking link" });
      // Omitted entirely when the guest came from `/account`; the session is
      // the credential there, and sending a blank `token=` would only invite
      // the server to compare against an empty string.
      if (token) params.set("token", token);
      const res = await fetch(`/api/reservations/${id}?${params}`, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (res.ok && body?.ok) {
        setCancelled(true);
        router.refresh();
        return;
      }
      setError(body?.error ?? "We could not cancel that booking.");
    } catch {
      setError("We could not reach the booking system. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {confirming ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.fast, ease: EASE.out }}
          className="rounded-2xl border border-wine/25 bg-wine/5 px-6 py-6"
          role="alertdialog"
          aria-label="Cancel this booking"
        >
          <p className="font-display text-lg">Cancel this booking?</p>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
            Your table goes back into the book straight away, and we will email you to
            confirm. This cannot be undone from this page.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="btn btn-primary btn-sm"
            >
              {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
              {busy ? "Cancelling…" : "Yes, cancel the table"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="btn btn-secondary btn-sm"
            >
              Keep my table
            </button>
          </div>
        </motion.div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="btn btn-secondary"
        >
          <X size={15} aria-hidden="true" />
          Cancel this booking
        </button>
      )}

      {error ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-wine" role="alert">
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
