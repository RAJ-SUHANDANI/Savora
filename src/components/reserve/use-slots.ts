"use client";

/**
 * Slot availability for the booking flow.
 *
 * One request keyed on everything that can change the answer (date, party size,
 * zone, and a `revalidate` counter the caller bumps to force a re-read), rather
 * than a fetch inside every step that needs slots.
 *
 * Two decisions worth explaining, because both are alternatives to the obvious
 * implementation and the obvious one is subtly wrong:
 *
 * **The result is stored against the request that produced it, and the status
 * is derived from comparing keys.** The obvious version keeps `status` in state
 * and sets it to `"loading"` at the top of the effect. That is a cascading
 * render — the effect writes state, the render that follows re-runs the effect's
 * consequences — and it also leaves a window where a fresh component still shows
 * the *previous* answer as if it were current. Storing `{ key, data | error }` and
 * asking "is the answer I hold the answer to the question I am asking?" on every
 * render closes both: the status is a function of props, so the moment a
 * revalidation is requested the grid is loading in the same paint.
 *
 * **Stale responses are dropped.** Flipping party size from 2 to 12 fires a
 * second request while the first is in flight. Without the guard, the slower
 * response for the *old* party size can land last and overwrite the new one, and
 * the guest sees sittings for two at a table that seats six. Keying the result
 * handles it: a response whose key is not the current one is simply never
 * rendered.
 *
 * **Failures are not silent.** A failed lookup is shown as a retryable message
 * rather than an empty grid, because "no times available" and "we could not
 * reach the server" look identical in a grid of greyed-out buttons and lead a
 * guest to very different conclusions.
 */
import { useEffect, useState } from "react";

import type { Zone } from "@/lib/constants";

export type Slot = {
  time: string;
  available: boolean;
  soldOut: boolean;
  /** Tables free for this slot — used for the "last table" nudge. */
  tablesFree: number;
  isLastTable: boolean;
  suggestedTableNumber: number | null;
  reason?: "closed" | "fully-booked" | "past" | "no-suitable-table";
};

export type Availability = {
  slots: Slot[];
  /** Tables that could physically take this party, regardless of occupancy. */
  suitableTables: number;
  /** Every start time the day *could* offer, before occupancy is considered. */
  openTimes: string[];
};

export type SlotsStatus = "idle" | "loading" | "ready" | "error";

type Result =
  | { key: string; ok: true; data: Availability }
  | { key: string; ok: false; error: string };

type Args = {
  date: string | null;
  partySize: number | null;
  zonePref: Zone | null;
  /**
   * Bump to force a re-read. The review step uses this to re-verify the chosen
   * slot immediately before confirming, because the guest may have sat on the
   * review screen for a while and the slot grid is advisory.
   */
  revalidate: number;
};

export function useSlots({ date, partySize, zonePref, revalidate }: Args) {
  const [result, setResult] = useState<Result | null>(null);

  const enabled = Boolean(date) && typeof partySize === "number";
  const key = [date ?? "", partySize ?? "", zonePref ?? "any", revalidate].join("|");

  useEffect(() => {
    if (!date || !partySize) return;

    let cancelled = false;
    const params = new URLSearchParams({ date, partySize: String(partySize) });
    if (zonePref) params.set("zone", zonePref);

    (async () => {
      try {
        const res = await fetch(`/api/reservations/available-slots?${params}`, {
          // The endpoint sends `private, no-store`; this also keeps the
          // browser's back/forward cache from replaying a stale slot list.
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });

        const body = (await res.json().catch(() => null)) as
          | { ok: true; data: Availability }
          | { ok: false; error?: string }
          | null;

        if (cancelled) return;

        if (!res.ok || !body || !("ok" in body) || !body.ok) {
          setResult({
            key,
            ok: false,
            error:
              (body && "error" in body && body.error) ||
              "We could not check availability just now.",
          });
          return;
        }

        setResult({ key, ok: true, data: body.data });
      } catch {
        if (!cancelled) {
          setResult({ key, ok: false, error: "We could not reach the booking system." });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `key` is derived from every input below, so it is the real dependency;
    // the rest are listed so the fetch body cannot drift from the key.
  }, [key, date, partySize, zonePref]);

  // ---- Derived, not stored ------------------------------------------------
  const current = result && result.key === key ? result : null;

  const status: SlotsStatus = !enabled
    ? "idle"
    : !current
      ? "loading"
      : current.ok
        ? "ready"
        : "error";

  return {
    data: current?.ok ? current.data : null,
    status,
    error: current && !current.ok ? current.error : null,
  };
}
