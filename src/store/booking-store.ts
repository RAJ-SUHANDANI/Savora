"use client";

/**
 * Booking draft store.
 *
 * The five steps of `/reserve` are separate components that mount and unmount as
 * the guest moves through them, so the *selection* cannot live in any one of
 * them. It lives here instead, for three reasons:
 *
 * 1. **One source of truth for the selection.** Date, party size and time are
 *    read by the progress bar, the review summary and the submit handler at
 *    once. Deriving any of them twice is how a flow ends up confirming a time
 *    the guest did not pick.
 *
 * 2. **An invariant that is enforced in one place.** Changing the date or the
 *    party size invalidates the chosen time, because a table that fits two at
 *    19:00 may not fit six. `setDate`/`setPartySize` do that themselves and send
 *    the guest back to the slot grid, so no step can leave a stale time behind.
 *
 * Guest *details* are deliberately **not** here. They live in React Hook Form,
 * which already owns field values, validation and error display; duplicating
 * them into a store would mean two sources of truth for the same strings and a
 * class of bug where the review screen shows a name the form no longer has.
 *
 * Deliberately not persisted to `localStorage`. A stored draft would outlive the
 * booking window — a date chosen this evening is unbookable tomorrow — and the
 * flow would reopen on a stale date that the server then rejects. The cost of
 * re-picking a date is far lower than the cost of a booking that cannot be made.
 */
import { create } from "zustand";
import type { Zone } from "@/lib/constants";

/** The five steps, in order. `id` doubles as the analytics-style step key. */
export const BOOKING_STEPS = [
  { id: "date", label: "Date", hint: "Pick a day" },
  { id: "party", label: "Party", hint: "How many of you" },
  { id: "time", label: "Time", hint: "Choose a sitting" },
  { id: "details", label: "Details", hint: "Who to expect" },
  { id: "review", label: "Confirm", hint: "Check it over" },
] as const;

export type BookingStepIndex = 0 | 1 | 2 | 3 | 4;
export const LAST_STEP: BookingStepIndex = 4;

export const STEP_INDEX = {
  date: 0,
  party: 1,
  time: 2,
  details: 3,
  review: 4,
} as const;

/** A confirmed booking, kept for the confirmation screen. */
export type ConfirmedBooking = {
  id: string;
  confirmationCode: string;
  manageToken: string;
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  guestEmail: string;
  table: { number: number; capacity: number; zone: string } | null;
};

type BookingState = {
  step: BookingStepIndex;
  /**
   * Which way the guest is travelling, so `stepVariants` can slide the incoming
   * panel in from the correct side. Stored rather than derived because the
   * direction has to be known *before* the new panel renders.
   */
  direction: 1 | -1;

  date: string | null;
  partySize: number | null;
  time: string | null;
  zonePref: Zone | null;

  confirmed: ConfirmedBooking | null;

  goTo: (step: BookingStepIndex) => void;
  next: () => void;
  back: () => void;

  setDate: (date: string) => void;
  setPartySize: (size: number) => void;
  setTime: (time: string) => void;
  /** Clears the time only when the zone actually changes. */
  setZonePref: (zone: Zone | null) => void;

  confirm: (booking: ConfirmedBooking) => void;
  reset: () => void;
};

const INITIAL = {
  step: 0 as BookingStepIndex,
  direction: 1 as const,
  date: null,
  partySize: null,
  time: null,
  zonePref: null,
  confirmed: null,
};

function clampStep(step: number): BookingStepIndex {
  if (step < 0) return 0;
  if (step > LAST_STEP) return LAST_STEP;
  return step as BookingStepIndex;
}

export const useBookingStore = create<BookingState>((set, get) => ({
  ...INITIAL,

  /**
   * Jumping directly to a step is only allowed backwards or to the step
   * immediately ahead. Allowing an arbitrary jump would let a guest reach the
   * review screen with nothing selected, and the "can I continue" question
   * would have to be answered twice — here and in the step itself.
   */
  goTo: (step) => {
    const current = get().step;
    if (step === current) return;
    set({ step, direction: step > current ? 1 : -1 });
  },

  next: () => get().goTo(clampStep(get().step + 1)),
  back: () => get().goTo(clampStep(get().step - 1)),

  setDate: (date) =>
    set((s) => ({
      date,
      // Availability is a function of the day *and* the party size, so a time
      // that was offered for the old date is not evidence about the new one.
      time: null,
      step: s.partySize ? STEP_INDEX.time : STEP_INDEX.party,
      direction: 1 as const,
    })),

  setPartySize: (partySize) =>
    set((s) => ({
      partySize,
      time: null,
      step: s.date ? STEP_INDEX.time : STEP_INDEX.date,
      direction: 1 as const,
    })),

  setTime: (time) => set({ time }),

  setZonePref: (zonePref) =>
    set((s) => ({ zonePref, time: s.zonePref === zonePref ? s.time : null })),

  confirm: (confirmed) => set({ confirmed }),
  reset: () => set({ ...INITIAL }),
}));

/** Read-only snapshot for non-React code and for the submit handler. */
export const bookingState = () => useBookingStore.getState();
