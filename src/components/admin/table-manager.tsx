"use client";

/**
 * The floor.
 *
 * ## A table is capacity, location and a name
 *
 * Those are the only three things that decide whether a party can be seated, and
 * all three come straight from the booking engine: `availability.ts` filters by
 * `zone` and rejects a table when `capacity < partySize`. So this screen is not
 * decoration over a booking system — what is written here is what the next guest
 * will be offered.
 *
 * ## Grouped by area, and that grouping is functional
 *
 * A manager asks "how many covers can I still seat inside?", which is a question
 * about an area. The list answers it as a header, and a table's zone is set by
 * which group it appears under, so the grouping cannot disagree with the data.
 *
 * ## Deleting is the one dangerous control, so it is separated
 *
 * `deleteTable` refuses while the table has upcoming bookings, but the refusal
 * only lands *after* the owner has committed to it. Putting the destructive
 * control behind a second click — and never in the same visual group as the
 * neutral ones — means the click that matters is always deliberate.
 */
import { useActionState, useState, useTransition } from "react";
import { Armchair, Loader2, Pencil, Plus, Power, Trash2, X } from "lucide-react";

import {
  Checkbox,
  Field,
  FormBanner,
  Select,
  SubmitButton,
  TextInput,
} from "@/components/admin/fields";
import { deleteTable, saveTable, toggleTableActive } from "@/app/admin/actions";
import type { BannerState } from "@/lib/action-state";
import { ZONES, ZONE_LABELS, ZONE_SHORT, type Zone } from "@/lib/constants";
import { cn, pluralise } from "@/lib/format";

export type FloorTable = {
  id: string;
  number: number;
  capacity: number;
  zone: Zone;
  isActive: boolean;
  /** Bookings already against this table that still block it. */
  upcoming: number;
};

export function TableManager({ tables }: { tables: FloorTable[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          <span className="text-ink">{tables.length}</span> tables ·{" "}
          <span className="text-ink">{tables.reduce((n, t) => n + (t.isActive ? t.capacity : 0), 0)}</span>{" "}
          covers in service
          {tables.some((t) => !t.isActive) ? (
            <>
              {" · "}
              <span className="text-ink-subtle">
                {tables.filter((t) => !t.isActive).length} out of service
              </span>
            </>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => setEditing((v) => (v === "new" ? null : "new"))}
          aria-expanded={editing === "new"}
          className="btn btn-primary btn-sm"
        >
          {editing === "new" ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
          {editing === "new" ? "Cancel" : "Add a table"}
        </button>
      </div>

      {editing === "new" ? (
        <div className="mb-8">
          <TableForm onDone={() => setEditing(null)} />
        </div>
      ) : null}

      <div className="space-y-7">
        {ZONES.map((zone) => {
          const rows = tables
            .filter((t) => t.zone === zone)
            .sort((a, b) => a.number - b.number);

          if (rows.length === 0) return null;

          return (
            <section key={zone}>
              <h3 className="mb-3 flex items-baseline gap-2.5 font-display text-lg">
                {ZONE_LABELS[zone]}
                <span className="text-sm font-sans text-ink-subtle">
                  {rows.length} · {rows.reduce((n, t) => n + t.capacity, 0)} covers
                </span>
              </h3>

              <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((table) => (
                  <li key={table.id}>
                    <TableRow
                      table={table}
                      isOpen={editing === table.id}
                      onEdit={() => setEditing((v) => (v === table.id ? null : table.id))}
                    />
                    {editing === table.id ? (
                      <div className="mt-2.5">
                        <TableForm table={table} onDone={() => setEditing(null)} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TableRow({
  table,
  isOpen,
  onEdit,
}: {
  table: FloorTable;
  isOpen: boolean;
  onEdit: () => void;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div
      className={cn(
        "card px-4 py-3",
        !table.isActive && "bg-surface-sunken/50",
        isOpen && "ring-1 ring-accent/40",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            table.isActive ? "bg-accent/10 text-accent" : "bg-surface-raised text-ink-subtle",
          )}
        >
          <Armchair size={16} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            Table {table.number}
            {!table.isActive ? (
              <span className="ml-2 rounded-full bg-surface-raised px-1.5 py-0.5 text-[0.625rem] text-ink-subtle">
                Out of service
              </span>
            ) : null}
          </p>
          <p className="text-xs text-ink-subtle">
            {pluralise(table.capacity, "cover", "covers")}
            {table.upcoming > 0 ? ` · ${pluralise(table.upcoming, "booking")} ahead` : ""}
          </p>
        </div>

        {pending ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-ink-subtle" aria-label="Saving" />
        ) : null}
      </div>

      {message ? (
        <p
          role="status"
          className="mt-2.5 rounded-lg bg-surface-raised px-2.5 py-1.5 text-xs text-ink-muted"
        >
          {message}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border-subtle pt-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => toggleTableActive(table.id))}
          className="btn btn-ghost btn-xs"
        >
          <Power size={12} aria-hidden="true" />
          {table.isActive ? "Take out of service" : "Put back in service"}
        </button>

        <button
          type="button"
          onClick={onEdit}
          aria-expanded={isOpen}
          className="btn btn-ghost btn-xs"
        >
          <Pencil size={12} aria-hidden="true" />
          Edit
        </button>

        {/* Destructive, and visually separated: a second click, on a control that
            is never adjacent to a neutral one. */}
        {confirming ? (
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  const result = await deleteTable(table.id);
                  setMessage(result.message);
                  setConfirming(false);
                })
              }
              className="btn btn-xs border border-wine/40 text-wine hover:bg-wine/10"
            >
              Remove it
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn btn-ghost btn-xs"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn btn-ghost btn-xs ml-auto text-ink-subtle hover:text-wine"
          >
            <Trash2 size={12} aria-hidden="true" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Add or edit one table.
 *
 * The number is the identity a manager uses — "move them to four" — so the
 * unique-constraint failure on it is caught in the action and returned as an
 * inline error rather than a 500. `isActive` defaults on for a new table and is
 * only pre-checked for an existing one, because "add a table" during service
 * almost always means "we have brought it back into use".
 */
function TableForm({
  table,
  onDone,
}: {
  table?: FloorTable;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<BannerState, FormData>(saveTable, {
    ok: true,
    message: "",
  });

  return (
    <form action={formAction} className="card space-y-4 px-4 py-4">
      {table ? <input type="hidden" name="id" value={table.id} /> : null}

      <FormBanner state={state} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          name="number"
          label="Number"
          error={state.errors?.number}
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              name="number"
              type="number"
              min="1"
              defaultValue={table?.number}
              describedBy={describedBy}
              invalid={Boolean(state.errors?.number)}
              required
            />
          )}
        </Field>

        <Field
          name="capacity"
          label="Covers"
          hint="The most this table seats"
          error={state.errors?.capacity}
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              name="capacity"
              type="number"
              min="1"
              defaultValue={table?.capacity ?? 2}
              describedBy={describedBy}
              invalid={Boolean(state.errors?.capacity)}
              required
            />
          )}
        </Field>

        <Field name="zone" label="Area">
          {({ id }) => (
            <Select id={id} name="zone" defaultValue={table?.zone ?? "INDOOR"}>
              {ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {ZONE_SHORT[zone]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Checkbox
        name="isActive"
        label="In service"
        hint="An out-of-service table is never offered to a guest, but its existing bookings stay put."
        defaultChecked={table?.isActive ?? true}
      />

      <div className="flex items-center gap-3">
        <SubmitButton>{table ? "Save table" : "Add table"}</SubmitButton>
        <button type="button" onClick={onDone} className="btn btn-ghost btn-sm">
          Close
        </button>
      </div>
    </form>
  );
}
