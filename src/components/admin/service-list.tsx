"use client";

/**
 * Today's book, with inline status controls.
 *
 * This is the screen a manager actually lives in during service, so the
 * actions are one click and the feedback is immediate. Two choices worth
 * spelling out:
 *
 * 1. **Optimistic status.** Moving a booking to "Seated" updates the pill the
 *    moment it is pressed and rolls back if the server disagrees. On a tablet
 *    on a busy floor, a control that waits for a round trip feels broken.
 *
 * 2. **Confirmation only where it is destructive.** Cancelling emails the
 *    guest and frees a table, so it asks first. Seating somebody does not.
 */
import { useOptimistic, useState, useTransition } from "react";
import { Check, CircleSlash, Loader2, LogIn, X } from "lucide-react";

import { StatusBadge } from "@/components/admin/status-badge";
import { patchReservation } from "@/lib/admin-client";
import { CANCELABLE_STATUSES, ZONE_SHORT, type ReservationStatus, type Zone } from "@/lib/constants";
import { cn, formatTime, pluralise } from "@/lib/format";

export type ServiceItem = {
  id: string;
  time: string;
  guestName: string;
  partySize: number;
  status: ReservationStatus;
  tableNumber: number | null;
  zone: string | null;
  occasion: string | null;
};

export function ServiceList({
  items,
  cancellableStatuses = CANCELABLE_STATUSES,
}: {
  items: ServiceItem[];
  cancellableStatuses?: readonly ReservationStatus[];
}) {
  // `useOptimistic` holds the status shown in the UI, which may be ahead of the
  // server while a change is in flight.
  const [optimistic, setOptimistic] = useOptimistic(
    items,
    (state, { id, status }: { id: string; status: ReservationStatus }) =>
      state.map((item) => (item.id === id ? { ...item, status } : item)),
  );

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const setStatus = (item: ServiceItem, status: ReservationStatus) => {
    setError(null);
    setPendingId(item.id);
    startTransition(async () => {
      setOptimistic({ id: item.id, status });
      const result = await patchReservation(item.id, { status });
      if (!result.ok) setError(result.message);
      setPendingId(null);
    });
  };

  return (
    <div>
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-wine/30 bg-wine/10 px-4 py-3 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      <ul className="card divide-y divide-border-subtle overflow-hidden">
        {optimistic.map((item) => {
          const busy = pendingId === item.id;
          const cancellable = cancellableStatuses.includes(item.status);
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
              <p className="w-16 shrink-0 font-display text-lg tabular-nums">
                {formatTime(item.time)}
              </p>

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-medium">
                  {item.guestName}
                  <span className="text-ink-subtle" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-ink-muted">{pluralise(item.partySize, "guest")}</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-xs text-ink-subtle">
                  <span>
                    {item.tableNumber !== null
                      ? `Table ${item.tableNumber}`
                      : "No table assigned"}
                  </span>
                  {item.zone ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{ZONE_SHORT[item.zone as Zone] ?? item.zone}</span>
                    </>
                  ) : null}
                  {item.occasion ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-accent">{item.occasion}</span>
                    </>
                  ) : null}
                </p>
              </div>

              <StatusBadge status={item.status} />

              <div className="flex shrink-0 items-center gap-1.5">
                {busy ? (
                  <Loader2 size={14} className="animate-spin text-ink-subtle" aria-label="Saving" />
                ) : null}

                {item.status === "CONFIRMED" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(item, "SEATED")}
                    className="btn btn-secondary btn-xs"
                  >
                    <LogIn size={12} aria-hidden="true" />
                    Seat
                  </button>
                ) : null}

                {item.status === "SEATED" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(item, "COMPLETED")}
                    className="btn btn-secondary btn-xs"
                  >
                    <Check size={12} aria-hidden="true" />
                    Finished
                  </button>
                ) : null}

                {cancellable ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setStatus(item, "NO_SHOW")}
                      className="btn btn-ghost btn-xs"
                    >
                      <CircleSlash size={12} aria-hidden="true" />
                      No-show
                    </button>
                    <CancelButton id={item.id} name={item.guestName} disabled={busy} />
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Cancel, behind a confirmation.
 *
 * Separated from the rest because it is the only control here that emails the
 * guest. The two-step is a plain local state toggle rather than a modal: on a
 * floor, a dialog with a backdrop is one more thing between a manager and the
 * action they need.
 */
function CancelButton({
  id,
  name,
  disabled,
}: {
  id: string;
  name: string;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!asking) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAsking(true)}
        className={cn("btn btn-ghost btn-xs", "hover:text-wine")}
      >
        <X size={12} aria-hidden="true" />
        Cancel
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setError(null);
          setBusy(true);
          startTransition(async () => {
            const result = await patchReservation(id, {
              status: "CANCELLED",
              cancelReason: "Cancelled by the restaurant",
            });
            if (result.ok) {
              setAsking(false);
            } else {
              setError(result.message);
              setBusy(false);
            }
          });
        }}
        className="btn btn-xs border border-wine/40 text-wine hover:bg-wine/10"
      >
        {busy ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : null}
        Cancel {name.split(" ")[0]}&rsquo;s booking
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setAsking(false);
          setError(null);
        }}
        className="btn btn-ghost btn-xs"
      >
        Keep
      </button>
      {error ? (
        <span role="alert" className="w-full text-xs text-wine">
          {error}
        </span>
      ) : null}
    </span>
  );
}
