"use client";

/**
 * The booking flow.
 *
 * Five steps, one form, one submit. What lives here and what lives in a step is
 * the interesting decision:
 *
 *   * **Selection** (date, party, time, zone) lives in the booking store, because
 *     the progress bar, the review summary and the submit handler all read it.
 *   * **Guest details** live in React Hook Form, which is mounted here and never
 *     unmounted, so the values survive a step changing even though the inputs
 *     themselves are torn down. That is the whole reason `useForm` is in this
 *     file and not in `DetailsStep`.
 *   * **Availability** lives in `useSlots`, a single request keyed on the
 *     selection, shared by the time grid and the pre-confirmation re-check.
 *
 * The confirm button is `type="submit"` inside the `<form>` that wraps every
 * step, so RHF's own validation gates the final submit and a guest who skipped
 * ahead with the progress bar is caught by the same schema the server uses.
 * `handleSubmit`'s `onInvalid` then sends them to the step that needs fixing,
 * which is the only way that error is visible at all.
 */
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Check } from "lucide-react";

import { StepProgress } from "@/components/reserve/step-progress";
import { DateStep } from "@/components/reserve/steps/date-step";
import { PartyStep } from "@/components/reserve/steps/party-step";
import { TimeStep } from "@/components/reserve/steps/time-step";
import { DetailsStep } from "@/components/reserve/steps/details-step";
import { ReviewStep, type Conflict } from "@/components/reserve/steps/review-step";
import { Confirmation } from "@/components/reserve/confirmation";
import { useSlots } from "@/components/reserve/use-slots";
import {
  BOOKING_STEPS,
  LAST_STEP,
  STEP_INDEX,
  useBookingStore,
  type BookingStepIndex,
  type ConfirmedBooking,
} from "@/store/booking-store";
import { guestDetailsSchema, type GuestDetails } from "@/lib/validation";
import type { OpeningHours } from "@/lib/constants";
import { cn, formatTime, relativeDayLabel } from "@/lib/format";
import { DURATION, EASE, stepVariants } from "@/lib/motion";

export type BookingConfig = {
  today: string;
  minDate: string;
  maxDate: string;
  maxPartySize: number;
  diningDurationMin: number;
  minNoticeHours: number;
  holdMinutes: number;
  holidays: string[];
  openingHours: OpeningHours;
  isAcceptingReservations: boolean;
  restaurantName: string;
  address: string;
  phone: string;
  defaultGuest: { name: string; email: string; phone: string };
  signedIn: boolean;
};

export function BookingFlow({ config }: { config: BookingConfig }) {
  const {
    step,
    direction,
    date,
    partySize,
    time,
    zonePref,
    confirmed,
    goTo,
    setDate,
    setPartySize,
    setTime,
    setZonePref,
    confirm,
    reset,
  } = useBookingStore();

  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Bumping this forces a re-read of availability. Done on entering the review
   * step, because the slot grid is advisory and time has passed since it was
   * drawn; and whenever the chosen time changes, so a guest who takes one of the
   * suggested alternatives gets an honest answer about it rather than an
   * assumption.
   */
  const [revalidate, setRevalidate] = useState(0);
  const revalidateSlots = () => setRevalidate((n) => n + 1);

  const { data, status, error: slotsError } = useSlots({
    date,
    partySize,
    zonePref,
    revalidate,
  });

  const {
    control,
    register,
    handleSubmit,
    reset: resetForm,
    getValues,
    formState: { errors },
  } = useForm<GuestDetails>({
    resolver: zodResolver(guestDetailsSchema),
    defaultValues: {
      guestName: config.defaultGuest.name,
      guestEmail: config.defaultGuest.email,
      guestPhone: config.defaultGuest.phone,
      occasion: "",
      specialRequests: "",
      website: "",
    },
  });

  /**
   * The draft outlives the page — the store is module-level, so a guest who
   * wanders off to read the menu and comes back keeps their selection. If that
   * took them past midnight, the date they chose is no longer bookable, so it
   * is pulled back to today. Runs once on mount: the window does not move while
   * the page is open, and re-running it would fight the guest.
   */
  useEffect(() => {
    const stored = useBookingStore.getState().date;
    if (stored && (stored < config.minDate || stored > config.maxDate)) {
      setDate(config.minDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The chosen slot, as of the most recent availability read. */
  const chosenSlot = useMemo(() => {
    if (!time || !data) return null;
    return data.slots.find((s) => s.time === time) ?? null;
  }, [time, data]);

  /**
   * Whether the slot the guest picked is still free, *as of the read that covers
   * the current selection*.
   *
   * Both halves of that are the point. Only a slot that appeared in the current
   * read can be judged, and the read must be one taken *after* the last
   * selection change — arriving on the review step starts a re-read, so the
   * previous grid is describing a different question. `useSlots` answers this by
   * deriving `status` from key comparison, which is why there is no separate
   * "have we verified this yet?" boolean here to fall out of sync with it.
   *
   * A slot absent from the list reads as "unknown", not "taken": the grid and
   * the selection can legitimately disagree for a moment, and refusing to let a
   * guest book over that would be worse than the small risk of letting the
   * database have the final word — which it will.
   */
  const chosenStillFree = useMemo(() => {
    if (step !== STEP_INDEX.review || !data) return null;
    return chosenSlot ? chosenSlot.available : null;
  }, [step, data, chosenSlot]);

  /**
   * The details step is the one step whose "can I continue" question is not
   * answered by the store but by the form, so it is answered by running the
   * *same* schema `onValid` and the POST route run — against the live values.
   * Anything less (a `guestName.length > 0` test, say) would let the button
   * promise a booking the server then refuses, and anything more (a second,
   * hand-written rule) would be the half-finished field the shared schema
   * exists to prevent.
   *
   * `useWatch` rather than `getValues` deliberately: the button has to re-render
   * as the guest types, and `getValues` is a one-off read that nothing
   * subscribes to. It cannot be memoised on the *errors* RHF holds either —
   * with the default `onSubmit` mode those are only populated once a submit has
   * been attempted, which is the very thing the guest is being blocked from.
   *
   * The subscription covers the whole form, which is exactly the details step's
   * fields and nothing else, so it re-renders on typing here and nowhere else.
   * `website` is part of the schema, so this stays a real check for a bot that
   * fills the honeypot: it cannot walk forward either.
   */
  const detailsValues = useWatch({ control });
  const detailsValid = useMemo(
    () => guestDetailsSchema.safeParse(detailsValues).success,
    [detailsValues],
  );

  /** Whether the "continue" button on the current step should be enabled. */
  const canContinue = useMemo(() => {
    switch (step) {
      case STEP_INDEX.date:
        return Boolean(date);
      case STEP_INDEX.party:
        return typeof partySize === "number";
      case STEP_INDEX.time:
        return Boolean(time);
      case STEP_INDEX.details:
        return detailsValid;
      default:
        // The review step has no continue button; its gate is the confirm
        // button, which is blocked on the availability re-check instead.
        return false;
    }
  }, [step, date, partySize, time, detailsValid]);

  /**
   * Every navigation goes through here, because entering the review step has to
   * force a fresh availability read and only the caller knows that a step change
   * is happening.
   *
   * Doing it in an effect that watched `step` would be the obvious alternative
   * and it is worse twice over: it writes state after a render rather than in
   * the event that caused it, and the review screen would paint once with the
   * *previous* read's verdict — enough to leave the confirm button enabled on a
   * grid drawn a minute ago, which is the exact race the re-check exists to close.
   */
  const go = (target: number) => {
    // Clamped here rather than in the store's `back()` alone: the progress bar
    // and the review summary both hand us arbitrary indices.
    const to = Math.min(Math.max(target, 0), LAST_STEP) as BookingStepIndex;
    if (to === step) return;
    setError(null);
    setConflict(null);
    // Arriving at review means the slot grid is now behind us; see `revalidate`.
    if (to === STEP_INDEX.review) setRevalidate((n) => n + 1);
    goTo(to);
  };

  const goNext = () => {
    if (step < STEP_INDEX.review && canContinue) go(step + 1);
  };

  const goBack = () => go(step - 1);

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const onValid = async (values: GuestDetails) => {
    if (!date || typeof partySize !== "number" || !time) return;

    setSubmitting(true);
    setError(null);
    setConflict(null);
    setServerFields({});

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          time,
          partySize,
          zonePref,
          guestName: values.guestName,
          guestEmail: values.guestEmail,
          guestPhone: values.guestPhone || "",
          occasion: values.occasion || "",
          specialRequests: values.specialRequests || "",
          // Honeypot: a human never fills this in.
          website: values.website || "",
        }),
      });

      const body = (await res.json().catch(() => null)) as
        | { ok: true; data: { reservation: ConfirmedBooking } }
        | {
            ok: false;
            error: string;
            code?: string;
            fields?: Record<string, string>;
            suggestedTimes?: string[];
          }
        | null;

      if (res.ok && body && "ok" in body && body.ok) {
        confirm({
          id: body.data.reservation.id,
          confirmationCode: body.data.reservation.confirmationCode,
          manageToken: body.data.reservation.manageToken,
          date: body.data.reservation.date,
          time: body.data.reservation.time,
          partySize: body.data.reservation.partySize,
          guestName: body.data.reservation.guestName,
          guestEmail: body.data.reservation.guestEmail,
          table: body.data.reservation.table,
        });
        return;
      }

      const message =
        (body && "error" in body && body.error) || "Something went wrong. Please try again.";

      // Field-level validation from the server: the client schema should have
      // caught it, but the server is the authority and the guest is told so.
      if (body && "error" in body && body.fields && Object.keys(body.fields).length) {
        setServerFields(body.fields);
        setError(message);
        // Deliberately `goTo` rather than `go`: going back to the form must not
        // wipe the error we have just set, and there is nothing to revalidate.
        goTo(STEP_INDEX.details);
        return;
      }

      // Anything with alternative times offered is a choice, not an apology.
      // Refresh the grid at the same time so the times shown are live.
      const suggested = body && "error" in body ? (body.suggestedTimes ?? []) : [];
      if (res.status === 409 || res.status === 422) {
        setConflict({ message, suggestedTimes: suggested });
        setError(null);
        // The suggested times came from the server's own view of the day, but
        // the grid behind this screen is stale by definition now — re-read it so
        // the alternatives shown are the same ones the server just offered.
        if (suggested.length) revalidateSlots();
        return;
      }

      setError(message);
    } catch {
      setError("We could not reach the booking system. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * The guest reached the review step with an incomplete form — almost always
   * by using the progress bar to skip ahead. Send them to the step that needs
   * fixing and put the cursor in the first offending field, without which the
   * error is on a screen they are no longer looking at.
   */
  const onInvalid = () => {
    goTo(STEP_INDEX.details);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('#guestDetailsForm [aria-invalid="true"]')
        ?.focus();
    });
  };

  const submit = handleSubmit(onValid, onInvalid);

  const pickSuggested = (suggestedTime: string) => {
    setTime(suggestedTime);
    setConflict(null);
    setError(null);
    // Re-read rather than trusting the list we were just handed: the guest may
    // take a while to decide, and the re-check is the whole point of this screen.
    revalidateSlots();
  };

  const startOver = () => {
    reset();
    resetForm();
    setError(null);
    setConflict(null);
    setServerFields({});
    revalidateSlots();
  };

  // -------------------------------------------------------------------------

  if (!config.isAcceptingReservations) {
    return (
      <div className="card p-8 text-center md:p-12">
        <h2 className="font-display text-2xl">Online bookings are paused</h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
          We are not taking reservations through the website at the moment — usually because the
          kitchen&rsquo;s hours have changed. Please telephone us and we will find you a table.
        </p>
        <a href={`tel:${config.phone.replace(/\s/g, "")}`} className="btn btn-primary mt-8">
          Call {config.phone}
        </a>
      </div>
    );
  }

  return (
    <div className="card relative overflow-hidden">
      <div className="border-b border-border-subtle bg-surface-raised/60 px-6 py-5 md:px-9">
        {confirmed ? (
          <p className="eyebrow">Reservation {confirmed.confirmationCode}</p>
        ) : (
          <StepProgress current={step} onJump={go} />
        )}
      </div>

      <form
        id="guestDetailsForm"
        onSubmit={submit}
        noValidate
        className="relative px-6 py-9 md:px-9 md:py-11"
      >
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          {confirmed ? (
            <motion.div
              key="confirmed"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.slow, ease: EASE.out }}
            >
              <Confirmation
                booking={confirmed}
                restaurantName={config.restaurantName}
                address={config.address}
                phone={config.phone}
                signedIn={config.signedIn}
                onBookAnother={startOver}
              />
            </motion.div>
          ) : (
            <motion.div
              key={step}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="min-h-[24rem]"
            >
              {step === STEP_INDEX.date ? (
                <DateStep
                  today={config.today}
                  minDate={config.minDate}
                  maxDate={config.maxDate}
                  holidays={config.holidays}
                  openingHours={config.openingHours}
                  value={date}
                  onChange={setDate}
                  phone={config.phone}
                />
              ) : null}

              {step === STEP_INDEX.party ? (
                <PartyStep
                  value={partySize}
                  maxPartySize={config.maxPartySize}
                  onChange={setPartySize}
                  phone={config.phone}
                />
              ) : null}

              {step === STEP_INDEX.time ? (
                <TimeStep
                  status={status}
                  error={slotsError}
                  data={data}
                  dateLabel={date ? relativeDayLabel(date, config.today) : ""}
                  partySize={partySize}
                  time={time}
                  zonePref={zonePref}
                  minNoticeHours={config.minNoticeHours}
                  diningDurationMin={config.diningDurationMin}
                  phone={config.phone}
                  onSelect={setTime}
                  onZoneChange={setZonePref}
                  onRetry={revalidateSlots}
                  onChangeDate={() => go(STEP_INDEX.date)}
                />
              ) : null}

              {step === STEP_INDEX.details ? (
                <DetailsStep
                  register={register}
                  errors={errors}
                  serverFields={serverFields}
                  signedIn={config.signedIn}
                />
              ) : null}

              {step === STEP_INDEX.review && date && typeof partySize === "number" && time ? (
                <ReviewStep
                  date={date}
                  partySize={partySize}
                  time={time}
                  zonePref={zonePref}
                  tableNumber={chosenSlot?.suggestedTableNumber ?? null}
                  guest={{
                    guestName: getValues("guestName") || "",
                    guestEmail: getValues("guestEmail") || "",
                    guestPhone: getValues("guestPhone") || "",
                    occasion: getValues("occasion") || "",
                    specialRequests: getValues("specialRequests") || "",
                  }}
                  // `status` is derived against the current selection, so it is
                  // already "the re-check for these answers" — by the time this
                  // panel renders, `go` has forced a fresh read.
                  verifyStatus={status}
                  verifyError={slotsError}
                  chosenStillFree={chosenStillFree}
                  submitting={submitting}
                  error={error}
                  conflict={conflict}
                  holdMinutes={config.holdMinutes}
                  onJump={go}
                  onRetryVerify={revalidateSlots}
                  onPickSuggested={pickSuggested}
                />
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---- Navigation ------------------------------------------------ */}
        {!confirmed ? (
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle pt-7">
            <button
              type="button"
              onClick={goBack}
              className={cn("btn btn-ghost", step === STEP_INDEX.date && "invisible")}
              aria-hidden={step === STEP_INDEX.date}
              tabIndex={step === STEP_INDEX.date ? -1 : 0}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              Back
            </button>

            <div className="flex items-center gap-4">
              {error && step !== STEP_INDEX.details && !conflict ? (
                <p
                  role="alert"
                  className="flex max-w-xs items-start gap-2 text-right text-xs leading-relaxed text-wine"
                >
                  <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              ) : null}

              {step < STEP_INDEX.review ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canContinue}
                  className="btn btn-primary"
                >
                  {step === STEP_INDEX.time && time ? (
                    <>
                      <Check size={15} aria-hidden="true" />
                      {formatTime(time)}
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight size={15} aria-hidden="true" />
                    </>
                  )}
                </button>
              ) : (
                <p className="text-xs text-ink-subtle">
                  Step {step + 1} of {BOOKING_STEPS.length}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
