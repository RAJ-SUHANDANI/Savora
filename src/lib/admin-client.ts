/**
 * Client-side helper for the admin's reservation write path.
 *
 * The dashboard deliberately calls `PATCH /api/reservations/:id` rather than
 * inventing a parallel server action. Moving a booking between tables can
 * collide with another booking, and that case is already handled — table
 * re-picker, exclusion-constraint retry, notification email — by one tested
 * route. A second implementation in a server action would be a second thing to
 * keep correct, and the one nobody would test.
 *
 * Every endpoint answers with the same `{ ok, data }` / `{ error, code }`
 * envelope (see `lib/api.ts`), so one function covers them all and the caller
 * never has to guess whether a failure came back as a 4xx, a 5xx, or a dropped
 * connection.
 */

export type PatchResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export type ReservationPatch = {
  status?: "PENDING" | "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  tableId?: string | null;
  partySize?: number;
  time?: string;
  date?: string;
  cancelReason?: string;
  specialRequests?: string | null;
  guestName?: string;
  guestPhone?: string | null;
};

export async function patchReservation(
  id: string,
  body: ReservationPatch,
): Promise<PatchResult> {
  try {
    const response = await fetch(`/api/reservations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await response.json().catch(() => null);

    if (!response.ok || !json?.ok) {
      return {
        ok: false,
        // A 409 here is almost always "that table was just taken", which is a
        // normal outcome of two staff working at once rather than a bug, so it
        // is surfaced as a message the manager can act on.
        message: json?.error ?? "Something went wrong. Please try again.",
      };
    }

    return { ok: true, message: json.data?.changes?.join(", ") || "Updated." };
  } catch {
    return { ok: false, message: "Could not reach the server. Check your connection and try again." };
  }
}
