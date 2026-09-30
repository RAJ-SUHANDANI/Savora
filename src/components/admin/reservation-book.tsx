"use client";

/**
 * The book, row by row, with the controls a manager uses during service.
 *
 * ## Every write goes through `PATCH /api/reservations/:id`
 *
 * Not a server action, and not by choice of convenience. Moving a booking to a
 * different table has to be checked against the same exclusion constraint that
 * guards every other write, has to re-pick a table when that constraint fires,
 * and has to email the guest. All of that already exists in that one route and
 * is covered by the concurrency tests; a second implementation here would be a
 * second thing to keep correct, and the one nobody would test.
 *
 * ## Optimistic, then reconciled
 *
 * The status pill and the table cell both change the instant they are pressed
 * and roll back if the server disagrees. On a floor, a control that waits for a
 * round trip reads as broken, and a manager who cannot tell whether their tap
 * registered will tap again — which is how a booking gets seated twice.
 *
 * `useOptimistic` rather than `useState`, because the optimistic value has to
 * be discarded automatically when the transition ends. With `useState` the
 * rollback is a line of code that has to be remembered in every error branch,
 * and forgetting it leaves the screen permanently lying about the server.
 */
import { useOptimistic, useState, useTransition } from "react";
import {
  Check,
  CircleSlash,
  Info,
  Loader2,
  LogIn,
  Mail,
  Phone,
  TriangleAlert,
  Utensils,
  X,
} from "lucide-react";

import { StatusBadge } from "@/components/admin/status-badge";
import { patchReservation } from "@/lib/admin-client";
import {
  CANCELABLE_STATUSES,
  ZONE_SHORT,
  type ReservationStatus,
  type Zone,
} from "@/lib/constants";
import { cn, formatTime, pluralise } from "@/lib/format";

export type BookEntry = {
  id: string;
  time: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  partySize: number;
  status: ReservationStatus;
  tableId: string | null;
  tableNumber: number | null;
  zone: Zone | null;
  occasion: string | null;
  specialRequests: string | null;
  confirmationCode: string;
};

export type BookTable = {
  id: string;
  number: number;
  capacity: number;
  zone: Zone;
  isActive: boolean;
};

export function ReservationBook({
  entries,
  tables,
}: {
  entries: BookEntry[];
  /** Every table, active or not — a manager may need to move a party onto a
      table that is currently out of service. */
  tables: BookTable[];
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    entries,
    (state, patch: { id: string } & Partial<Pick<BookEntry, "status" | "tableId" | "tableNumber">>) =>
      state.map((item) => (item.id === patch.id ? { ...item, ...patch } : item)),
  );

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /**
   * One write path for every kind of change.
   *
   * The busy row is tracked by id rather than with a single boolean so a
   * manager working two covers at once — seating one table while moving
   * another — does not freeze the whole book behind the first tap.
   */
  const apply = (
    entry: BookEntry,
    body: Parameters<typeof patchReservation>[1],
    optimisticPatch: Parameters<typeof setOptimistic>[0] = { id: entry.id },
  ) => {
    setError(null);
    setPendingId(entry.id);
    startTransition(async () => {
      setOptimistic(optimisticPatch);
      const result = await patchReservation(entry.id, body);
      if (!result.ok) setError(result.message);
      setPendingId(null);
    });
  };

  if (entries.length === 0) return null;

  return (
    <div>
      {error ? (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-wine/30 bg-wine/10 px-4 py-3 text-sm text-ink"
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0 text-wine" aria-hidden="true" />
          <span>
            <span className="font-medium">That change did not stick.</span> {error}
          </span>
        </p>
      ) : null}

      <ul className="card divide-y divide-border-subtle overflow-hidden">
        {optimistic.map((entry) => {
          const busy = pendingId === entry.id;
          const cancellable = CANCELABLE_STATUSES.includes(entry.status);

          return (
            <li key={entry.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <p className="w-16 shrink-0 font-display text-lg tabular-nums">
                  {formatTime(entry.time)}
                </p>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-medium">
                    {entry.guestName}
                    <span className="text-ink-subtle" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-ink-muted">
                      {pluralise(entry.partySize, "guest")}
                    </span>
                    {entry.occasion ? (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.6875rem] text-accent">
                        {entry.occasion}
                      </span>
                    ) : null}
                  </p>

                  <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-xs text-ink-subtle">
                    <span className="tabular-nums">{entry.confirmationCode}</span>
                    {entry.zone ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{ZONE_SHORT[entry.zone]}</span>
                      </>
                    ) : null}
                    {entry.guestPhone ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Phone size={11} aria-hidden="true" />
                          {entry.guestPhone}
                        </span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Mail size={11} aria-hidden="true" />
                          {entry.guestEmail}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <StatusBadge status={entry.status} />

                <div className="flex shrink-0 items-center gap-1.5">
                  {busy ? (
                    <Loader2
                      size={14}
                      className="animate-spin text-ink-subtle"
                      aria-label="Saving"
                    />
                  ) : null}

                  {entry.status === "PENDING" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => apply(entry, { status: "CONFIRMED" })}
                      className="btn btn-secondary btn-xs"
                    >
                      <Check size={12} aria-hidden="true" />
                      Confirm
                    </button>
                  ) : null}

                  {entry.status === "CONFIRMED" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => apply(entry, { status: "SEATED" })}
                      className="btn btn-secondary btn-xs"
                    >
                      <LogIn size={12} aria-hidden="true" />
                      Seat
                    </button>
                  ) : null}

                  {entry.status === "SEATED" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => apply(entry, { status: "COMPLETED" })}
                      className="btn btn-secondary btn-xs"
                    >
                      <Check size={12} aria-hidden="true" />
                      Finished
                    </button>
                  ) : null}

                  {cancellable ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => apply(entry, { status: "NO_SHOW" })}
                      className="btn btn-ghost btn-xs"
                    >
                      <CircleSlash size={12} aria-hidden="true" />
                      No-show
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Notes and the table picker, on their own line. A row has to
                  stay short enough to scan six at a time, so anything that is
                  only occasionally relevant is below the fold of the row rather
                  than crammed into it. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-20">
                <TablePicker
                  entry={entry}
                  tables={tables}
                  busy={busy}
                  onPick={(table) =>
                    apply(
                      entry,
                      { tableId: table.id },
                      { id: entry.id, tableId: table.id, tableNumber: table.number },
                    )
                  }
                />

                {cancellable ? (
                  <CancelButton
                    entry={entry}
                    disabled={busy}
                    onCancel={(reason) =>
                      apply(entry, { status: "CANCELLED", cancelReason: reason })
                    }
                  />
                ) : null}
              </div>

              {entry.specialRequests ? (
                <p className="mt-3 flex items-start gap-2 pl-20 text-xs leading-relaxed text-ink-muted">
                  <Info size={12} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  <span>
                    <span className="font-medium text-ink">Guest note:</span>{" "}
                    {entry.specialRequests}
                  </span>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Seat a party at a different table.
 *
 * A `<select>` rather than drag-and-drop on purpose. Dragging a row onto a
 * floor-plan diagram is a lovely demo and a poor production control: it has no
 * keyboard path, it needs a second spatial model of a room the manager cannot
 * see, and a mis-drop is a mis-seating. A select is unambiguous, reachable by
 * keyboard, and works on a phone — which is the device a floor tablet is
 * actually.
 *
 * The options are sorted by number and prefixed with the zone, because "which
 * of the eleven indoor tables" is the question, and the answer is easier to give
 * than to ask.
 */
function TablePicker({
  entry,
  tables,
  busy,
  onPick,
}: {
  entry: BookEntry;
  tables: BookTable[];
  busy: boolean;
  onPick: (table: BookTable) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-ink-subtle">
      <Utensils size={12} aria-hidden="true" />
      <span className="sr-only">Table for {entry.guestName}</span>
      <select
        value={entry.tableId ?? ""}
        disabled={busy}
        onChange={(event) => {
          const table = tables.find((t) => t.id === event.target.value);
          if (table) onPick(table);
        }}
        className={cn(
          "field py-1 pr-7 text-xs",
          entry.tableId === null && "border-saffron/50 text-saffron",
        )}
      >
        <option value="" disabled>
          No table
        </option>
        {tables.map((table) => (
          <option key={table.id} value={table.id}>
            Table {table.number} — {ZONE_SHORT[table.zone]} · seats {table.capacity}
            {table.isActive ? "" : " (out of service)"}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Cancel, behind a reason.
 *
 * The two-step is a local toggle rather than a modal. On a floor a dialog with a
 * backdrop is one more thing between a manager and the action they need, and a
 * reason is required because it goes into the email the guest receives — "we
 * could not seat you" is a real answer, and it is information the restaurant
 * wants back.
 */
function CancelButton({
  entry,
  disabled,
  onCancel,
}: {
  entry: BookEntry;
  disabled?: boolean;
  onCancel: (reason: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("Cancelled by the restaurant");

  if (!asking) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAsking(true)}
        className="btn btn-ghost btn-xs hover:text-wine"
      >
        <X size={12} aria-hidden="true" />
        Cancel booking
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor={`reason-${entry.id}`}>
        Reason for cancelling {entry.guestName}&rsquo;s booking
      </label>
      <input
        id={`reason-${entry.id}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={200}
        className="field w-56 py-1 text-xs"
      />
      <button
        type="button"
        disabled={disabled || reason.trim() === ""}
        onClick={() => {
          onCancel(reason.trim());
          setAsking(false);
        }}
        className="btn btn-xs border border-wine/40 text-wine hover:bg-wine/10"
      >
        Confirm cancel
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="btn btn-ghost btn-xs"
      >
        Keep
      </button>
    </span>
  );
}
