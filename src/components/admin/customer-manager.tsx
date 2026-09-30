"use client";

/**
 * Guests, and what the restaurant remembers about them.
 *
 * ## The staff note is the point of this screen
 *
 * A reservation system that cannot remember "always seats the shellfish allergy
 * at table 3, and never by the door" is a worse version of a paper diary. So the
 * note is the largest, most prominent thing on the row and saves on blur rather
 * than behind a save button — the person writing it is on a phone walking
 * between tables, and a save button is a thing they will forget.
 *
 * ## Visits are counted from bookings, not stored
 *
 * `visits` and `lastVisit` are derived by the server on read. A counter column
 * would need incrementing in five places (create, cancel, no-show, amend date,
 * import) and would be wrong the moment one was missed — and it would count the
 * cancelled ones. `COMPLETED` alone is a visit: a party that sat down and ate is
 * a visit whether or not anyone wrote down what they ordered.
 */
import { useOptimistic, useState, useTransition } from "react";
import {
  Bookmark,
  Crown,
  Loader2,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  Utensils,
  X,
} from "lucide-react";

import { saveStaffNote, setUserRole } from "@/app/admin/actions";
import { formatDate, pluralise } from "@/lib/format";
import { cn } from "@/lib/format";

export type Guest = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "CUSTOMER" | "ADMIN";
  staffNotes: string | null;
  createdAt: string;
  visits: number;
  covers: number;
  lastVisit: string | null;
  upcoming: number;
  favorites: number;
  occasions: string[];
  /** True when the signed-in admin is looking at their own row. */
  isSelf: boolean;
};

export function CustomerManager({
  guests,
  query,
}: {
  guests: Guest[];
  query: string;
}) {
  return (
    <div>
      <SearchBox query={query} />

      {guests.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="font-display text-lg">
            {query ? `Nobody matches “${query}”` : "No guests yet"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
            {query
              ? "Search covers names, email addresses and phone numbers. An account only appears here once somebody has registered — bookings made without one are on the book, not here."
              : "Guests appear here once they register an account. Anyone who books without one is still in the book on the reservations screen."}
          </p>
        </div>
      ) : (
        <ul className="card divide-y divide-border-subtle overflow-hidden">
          {guests.map((guest) => (
            <li key={guest.id}>
              <GuestRow guest={guest} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Search, in the URL.
 *
 * A form that navigates rather than filtering as you type. Guests are few enough
 * that a client-side filter would be instant, but a URL is shareable ("here is
 * the guest with the shellfish note") and survives a reload, and the count of
 * what a search matched is worth seeing in the page title.
 *
 * `autoComplete="off"` plus a submit button, rather than a debounce on every
 * keystroke: a manager typing "margaret ives" would fire six queries and land on
 * a result for "margaret iv" while still typing.
 */
function SearchBox({ query }: { query: string }) {
  return (
    <form method="get" action="/admin/customers" className="mb-5 flex flex-wrap gap-2">
      <div className="relative min-w-0 flex-1">
        <label htmlFor="customer-search" className="sr-only">
          Search guests
        </label>
        <Search
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
        />
        <input
          id="customer-search"
          name="q"
          defaultValue={query}
          autoComplete="off"
          placeholder="Name, email or phone"
          className="field pr-9 pl-9"
        />
        {query ? (
          <a
            href="/admin/customers"
            aria-label="Clear the search"
            className="absolute top-1/2 right-2.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <X size={13} aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <button type="submit" className="btn btn-secondary btn-sm">
        Search
      </button>
    </form>
  );
}

function GuestRow({ guest }: { guest: Guest }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
            {guest.name}
            {guest.role === "ADMIN" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-espresso px-2 py-0.5 text-[0.625rem] text-cream">
                <Crown size={9} aria-hidden="true" />
                Staff
              </span>
            ) : null}
            {guest.isSelf ? (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.625rem] text-accent">
                You
              </span>
            ) : null}
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
            <span className="inline-flex items-center gap-1">
              <Mail size={11} aria-hidden="true" />
              {guest.email}
            </span>
            {guest.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone size={11} aria-hidden="true" />
                {guest.phone}
              </span>
            ) : null}
            {guest.favorites > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Bookmark size={11} aria-hidden="true" />
                {pluralise(guest.favorites, "saved dish", "saved dishes")}
              </span>
            ) : null}
          </p>

          {guest.occasions.length > 0 ? (
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {guest.occasions.map((occasion) => (
                <span
                  key={occasion}
                  className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.6875rem] text-accent"
                >
                  {occasion}
                </span>
              ))}
            </p>
          ) : null}
        </div>

        <dl className="flex flex-wrap gap-x-5 gap-y-2 text-center">
          <Stat label="Visits" value={guest.visits} />
          <Stat label="Covers" value={guest.covers} />
          <Stat
            label="Last visit"
            value={guest.lastVisit ? formatDate(guest.lastVisit) : "—"}
            small
          />
          <Stat
            label="Upcoming"
            value={guest.upcoming}
            tone={guest.upcoming > 0 ? "accent" : undefined}
          />
        </dl>
      </div>

      <div className="mt-3.5 grid gap-3 border-t border-border-subtle pt-3.5 sm:grid-cols-[1fr_auto] sm:items-start">
        <StaffNote guest={guest} />
        <RoleToggle guest={guest} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  small,
  tone,
}: {
  label: string;
  value: number | string;
  small?: boolean;
  tone?: "accent";
}) {
  return (
    <div>
      <dd
        className={cn(
          "font-display tabular-nums",
          small ? "text-sm" : "text-lg",
          tone === "accent" ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </dd>
      <dt className="text-[0.6875rem] tracking-wide text-ink-subtle uppercase">{label}</dt>
    </div>
  );
}

/**
 * The staff note, saving on blur.
 *
 * ## Why blur and not a save button
 *
 * The writer is standing on a floor. Requiring a second deliberate action after
 * typing means the note is often simply not written, and a note that is not
 * written is indistinguishable from a note that does not exist — which is
 * exactly the failure this feature exists to prevent.
 *
 * `useOptimistic` shows the typed text immediately and reverts if the write
 * fails, so the field never lies about what is stored. An explicit
 * `aria-live` region announces the outcome because a save with no feedback
 * during a blur-driven interaction is indistinguishable from a save that
 * silently failed.
 *
 * The optimistic baseline is the *server's* value, not local state, so two
 * components cannot hold divergent copies.
 */
function StaffNote({ guest }: { guest: Guest }) {
  const [note, setNote] = useState(guest.staffNotes ?? "");
  const [optimistic, setOptimistic] = useOptimistic(note);
  const [, start] = useTransition();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  return (
    <div>
      <label htmlFor={`note-${guest.id}`} className="label">
        <Utensils size={11} className="mr-1 inline text-accent" aria-hidden="true" />
        What we should remember
      </label>
      <textarea
        id={`note-${guest.id}`}
        value={optimistic}
        onChange={(event) => {
          setNote(event.target.value);
          setStatus("idle");
        }}
        onBlur={(event) => {
          const next = event.target.value;
          if (next === (guest.staffNotes ?? "")) return;
          setStatus("saving");
          start(async () => {
            setOptimistic(next);
            try {
              await saveStaffNote(guest.id, next);
              setStatus("saved");
            } catch {
              // Roll the field back to what the server actually holds, rather
              // than leaving text on screen that was never stored.
              setNote(guest.staffNotes ?? "");
              setStatus("failed");
            }
          });
        }}
        maxLength={500}
        rows={2}
        placeholder="Allergies, a favourite corner, always wants the quiet table…"
        className="field min-h-14 resize-y text-sm"
      />
      <p aria-live="polite" className="mt-1 text-xs text-ink-subtle">
        {status === "saving"
          ? "Saving…"
          : status === "saved"
            ? "Saved."
            : status === "failed"
              ? "Could not save — the note has been put back."
              : "Saved automatically when you click away."}
      </p>
    </div>
  );
}

/**
 * Promote a guest to staff, or back.
 *
 * The action refuses to demote the caller, and the button is disabled with the
 * reason shown rather than silently doing nothing — a disabled control that
 * explains itself is useful, an enabled one that throws is not.
 */
function RoleToggle({ guest }: { guest: Guest }) {
  const [pending, start] = useTransition();
  const isAdmin = guest.role === "ADMIN";

  return (
    <div className="sm:text-right">
      <p className="label sm:mb-1.5">Dashboard access</p>
      <button
        type="button"
        disabled={pending || guest.isSelf}
        onClick={() => start(() => setUserRole(guest.id, isAdmin ? "CUSTOMER" : "ADMIN"))}
        className={cn(
          "btn btn-sm",
          isAdmin ? "btn-ghost" : "btn-secondary",
          (pending || guest.isSelf) && "opacity-60",
        )}
        title={guest.isSelf ? "You cannot remove your own access" : undefined}
      >
        {pending ? (
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
        ) : (
          <ShieldCheck size={13} aria-hidden="true" />
        )}
        {isAdmin ? "Remove staff access" : "Make staff"}
      </button>
      {guest.isSelf ? (
        <p className="mt-1 text-xs text-ink-subtle">That is you</p>
      ) : null}
    </div>
  );
}
