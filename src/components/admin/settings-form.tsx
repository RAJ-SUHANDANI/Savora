"use client";

/**
 * Restaurant settings.
 *
 * ## The two JSON fields are edited as structures, submitted as strings
 *
 * `openingHours` and `holidays` have no honest flat HTML encoding. A week of
 * windows is a nested array of pairs; `hours.thu.0.open` works until the owner
 * adds a second service on Thursday, at which point the server has to guess
 * which input belongs to which pair. So the editor holds a real nested object,
 * renders it as proper controls, and serialises it into a single hidden field on
 * submit. The action parses one JSON string and the shape is exact by
 * construction.
 *
 * This is the one place a `<form>` is deliberately not the source of truth: the
 * JSON is generated from state at submit time rather than being read out of the
 * form, because the form's own fields are only a *view* of that state.
 *
 * ## The hours editor is add/remove rows, not a seven-column grid
 *
 * A grid of open/close pairs looks tidy until Tuesday has three services, at
 * which point the grid needs a third column pair and every day shifts. Rows that
 * can be added and removed handle any number of services and read the way a
 * manager thinks about them.
 *
 * ## A closed day is an empty list, not a special value
 *
 * `"mon": []` means closed. There is no `"closed": true` to keep in sync with
 * the windows, and no way to end up with a day that is both closed and open. The
 * availability engine reads the same shape, so an empty array is the single
 * representation of "we are shut" from the settings row to the booking calendar.
 */
import { useActionState, useState } from "react";
import { CalendarOff, Plus, Trash2, X } from "lucide-react";

import {
  Checkbox,
  Field,
  FormBanner,
  Select,
  SubmitButton,
  TextInput,
} from "@/components/admin/fields";
import { saveSettings } from "@/app/admin/actions";
import type { BannerState } from "@/lib/action-state";
import { DAY_KEYS, DAY_LABELS, DAY_SHORT, type DayKey } from "@/lib/constants";
import { cn, formatDate } from "@/lib/format";

/** One service window, mutable so it can live in client state and be JSON'd. */
type Window = [string, string];

/**
 * Four is the schema's own limit (`openingHours` allows `.max(4)`), restated
 * here so the "Add a service" button disappears at the same point the server
 * would start refusing. A control that offers a fifth service and returns a
 * validation error is a worse experience than one that never offers it.
 */
const MAX_SERVICES_PER_DAY = 4;

/** The pair a newly added service starts with — dinner, the common case. */
const DEFAULT_SERVICE: Window = ["18:00", "22:00"];

/** What a closed day becomes when it is opened: lunch and dinner. */
const OPENING_DEFAULT: Window[] = [
  ["12:00", "15:00"],
  ["18:00", "22:00"],
];

export type Hours = Partial<Record<DayKey, Window[]>>;
export type SettingsDraft = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  maxPartySize: number;
  bookingWindowDays: number;
  diningDurationMin: number;
  holdDurationMin: number;
  minNoticeHours: number;
  timezone: string;
  isAcceptingReservations: boolean;
  openingHours: Hours;
  holidays: string[];
};

/** Shown on the timezone field. Not a hard allowlist — see the note below. */
const COMMON_ZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function SettingsForm({ draft }: { draft: SettingsDraft }) {
  const [state, formAction] = useActionState<BannerState, FormData>(saveSettings, {
    ok: true,
    message: "",
  });

  const [hours, setHours] = useState<Hours>(draft.openingHours);
  const [holidays, setHolidays] = useState<string[]>(draft.holidays);

  return (
    <form action={formAction} className="space-y-8">
      <FormBanner state={state} />

      {/* The two structured fields. Serialised here, at the only point where the
          nested shape is known, rather than by the action guessing which input
          belongs to which service. */}
      <input type="hidden" name="openingHours" value={JSON.stringify(hours)} readOnly />
      <input type="hidden" name="holidays" value={JSON.stringify(holidays)} readOnly />
      <Section title="The restaurant" description="Appears in the header, the footer, the contact page and every confirmation email.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Name" error={state.errors?.name}>
            {({ id, describedBy }) => (
              <TextInput id={id} name="name" defaultValue={draft.name} describedBy={describedBy} invalid={Boolean(state.errors?.name)} required />
            )}
          </Field>

          <Field
            name="tagline"
            label="Tagline"
            hint="The line under the wordmark on the front page"
            error={state.errors?.tagline}
          >
            {({ id, describedBy }) => (
              <TextInput id={id} name="tagline" defaultValue={draft.tagline} describedBy={describedBy} invalid={Boolean(state.errors?.tagline)} />
            )}
          </Field>
        </div>

        <Field name="address" label="Address" error={state.errors?.address}>
          {({ id, describedBy }) => (
            <TextInput id={id} name="address" defaultValue={draft.address} describedBy={describedBy} invalid={Boolean(state.errors?.address)} required />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="phone" label="Phone" error={state.errors?.phone}>
            {({ id, describedBy }) => (
              <TextInput id={id} name="phone" type="tel" defaultValue={draft.phone} describedBy={describedBy} invalid={Boolean(state.errors?.phone)} />
            )}
          </Field>

          <Field
            name="email"
            label="Email"
            hint="Where the contact form is delivered"
            error={state.errors?.email}
          >
            {({ id, describedBy }) => (
              <TextInput id={id} name="email" type="email" defaultValue={draft.email} describedBy={describedBy} invalid={Boolean(state.errors?.email)} />
            )}
          </Field>
        </div>
      </Section>

      <Section
        title="Booking rules"
        description="These are what the availability engine reads on every request. Changing one changes what a guest is offered immediately."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            name="maxPartySize"
            label="Largest party"
            hint="Over this, the site sends the guest to the phone"
            value={draft.maxPartySize}
            error={state.errors?.maxPartySize}
          />
          <NumberField
            name="bookingWindowDays"
            label="Booking window (days)"
            hint="How far ahead a table can be booked"
            value={draft.bookingWindowDays}
            error={state.errors?.bookingWindowDays}
          />
          <NumberField
            name="minNoticeHours"
            label="Minimum notice (hours)"
            hint="Same-day bookings closer than this are refused"
            value={draft.minNoticeHours}
            error={state.errors?.minNoticeHours}
          />
          <NumberField
            name="diningDurationMin"
            label="Dining time (minutes)"
            hint="How long a table is held"
            value={draft.diningDurationMin}
            error={state.errors?.diningDurationMin}
          />
          <NumberField
            name="holdDurationMin"
            label="Late arrivals (minutes)"
            hint="A party is held for this long past their time"
            value={draft.holdDurationMin}
            error={state.errors?.holdDurationMin}
          />

          <Field
            name="timezone"
            label="Timezone"
            hint="An IANA name. Every slot is computed in it, so getting it wrong moves the whole book."
            error={state.errors?.timezone}
          >
            {({ id, describedBy }) => (
              <Select id={id} name="timezone" defaultValue={draft.timezone} describedBy={describedBy} invalid={Boolean(state.errors?.timezone)}>
                {/* A datalist of common zones for convenience, but the real value
                    is a free text input: this install is a self-hosted database
                    that anyone can point at, and a hard allowlist would lock out
                    a restaurant in a zone nobody thought to list. `Intl`
                    validates the string at the availability layer. */}
                {COMMON_ZONES.includes(draft.timezone) ? null : (
                  <option value={draft.timezone}>{draft.timezone} (current)</option>
                )}
                {COMMON_ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Checkbox
          name="isAcceptingReservations"
          label="Accepting online reservations"
          hint="Turn this off to close the book without changing any of the rules above. The public site shows a message instead of the booking form, and existing bookings are untouched."
          defaultChecked={draft.isAcceptingReservations}
        />
      </Section>

      <Section
        title="Opening hours"
        description="A day with no services is closed. These are the exact windows the availability engine offers — a booking cannot be made outside them."
      >
        <HoursEditor hours={hours} onChange={setHours} />
      </Section>

      <Section
        title="Closure dates"
        description="Days the restaurant is shut for a holiday. A closure beats the opening hours: a date listed here has no slots at all, even if the hours say otherwise."
      >
        <HolidaysEditor holidays={holidays} onChange={setHolidays} />
      </Section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-surface/95 px-5 py-3.5 shadow-lg backdrop-blur">
        <SubmitButton className="btn-primary">Save settings</SubmitButton>
        <p className="text-xs text-ink-subtle">
          Saved settings take effect on the public site immediately, including the booking flow.
        </p>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card px-5 py-5">
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mt-1 mb-4 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function NumberField({
  name,
  label,
  hint,
  value,
  error,
}: {
  name: string;
  label: string;
  hint?: string;
  value: number;
  error?: string;
}) {
  return (
    <Field name={name} label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <TextInput
          id={id}
          name={name}
          type="number"
          min="0"
          defaultValue={value}
          describedBy={describedBy}
          invalid={Boolean(error)}
          required
        />
      )}
    </Field>
  );
}

/**
 * The week, as a list of add/remove service rows per day.
 *
 * Every mutation is immutable, because these rows are keyed by index and a
 * mutated array would make React reuse the wrong `<input>` — the symptom being
 * that you clear one day's opening time and a different day empties instead.
 */
function HoursEditor({ hours, onChange }: { hours: Hours; onChange: (next: Hours) => void }) {
  const windowsFor = (day: DayKey): Window[] => (hours[day] ?? []) as Window[];

  const setWindows = (day: DayKey, windows: Window[]) => {
    onChange({ ...hours, [day]: windows });
  };

  const setTime = (day: DayKey, index: number, end: 0 | 1, value: string) => {
    setWindows(
      day,
      windowsFor(day).map((pair, i) =>
        i === index ? (end === 0 ? [value, pair[1]] : [pair[0], value]) : pair,
      ),
    );
  };

  return (
    <div className="space-y-2.5">
      {DAY_KEYS.map((key) => {
        const windows = windowsFor(key);
        const closed = windows.length === 0;
        const label = DAY_LABELS[key];

        return (
          <div
            key={key}
            className={cn(
              "rounded-xl border px-3.5 py-3 transition-colors",
              closed
                ? "border-border-subtle bg-surface-sunken/40"
                : "border-border-subtle bg-surface",
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-24 shrink-0 text-sm font-medium">{label}</span>

              {closed ? (
                <p className="text-sm text-ink-subtle">Closed</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {windows.map(([open, close], index) => (
                    <span key={index} className="flex items-center gap-1.5">
                      <label className="sr-only" htmlFor={`${key}-${index}-open`}>
                        {label} service {index + 1} opens
                      </label>
                      <input
                        id={`${key}-${index}-open`}
                        type="time"
                        value={open}
                        onChange={(event) => setTime(key, index, 0, event.target.value)}
                        className="field w-28 py-1.5 text-sm"
                      />
                      <span aria-hidden="true" className="text-ink-subtle">
                        &ndash;
                      </span>
                      <label className="sr-only" htmlFor={`${key}-${index}-close`}>
                        {label} service {index + 1} closes
                      </label>
                      <input
                        id={`${key}-${index}-close`}
                        type="time"
                        value={close}
                        onChange={(event) => setTime(key, index, 1, event.target.value)}
                        className="field w-28 py-1.5 text-sm"
                      />
                      {windows.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setWindows(
                              key,
                              windows.filter((_, i) => i !== index),
                            )
                          }
                          aria-label={`Remove one of the ${label} services`}
                          className="flex size-7 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-raised hover:text-wine"
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      ) : null}
                    </span>
                  ))}

                  {windows.length < MAX_SERVICES_PER_DAY ? (
                    <button
                      type="button"
                      onClick={() => setWindows(key, [...windows, DEFAULT_SERVICE])}
                      className="btn btn-ghost btn-xs"
                    >
                      <Plus size={11} aria-hidden="true" />
                      Add a service
                    </button>
                  ) : null}
                </div>
              )}

              {/* One control that flips between "closed" and "open with a
                  sensible default", rather than a separate add/remove pair. The
                  common cases are the two extremes, and the button's label always
                  says what it will do. */}
              <button
                type="button"
                onClick={() => setWindows(key, closed ? OPENING_DEFAULT : [])}
                className={cn("btn btn-xs ml-auto", closed ? "btn-secondary" : "btn-ghost")}
              >
                {closed ? `Open on ${DAY_SHORT[key]}` : "Mark closed"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Closure dates, as removable chips plus one date input.
 *
 * The chips are the record and the input is the add affordance, rather than a
 * list of empty date inputs — a long list of blanks is tedious to scan and easy
 * to double-submit, whereas a chip list reads as a set at a glance and a date is
 * removed by pressing one control.
 *
 * A day already in the list is not added twice, and past days are accepted
 * without complaint: an owner recording a closure that has already passed is
 * recording what happened, not asking for a booking to be refused.
 */
function HolidaysEditor({
  holidays,
  onChange,
}: {
  holidays: string[];
  onChange: (next: string[]) => void;
}) {
  const [value, setValue] = useState("");

  const add = () => {
    if (!value || holidays.includes(value)) {
      setValue("");
      return;
    }
    onChange([...holidays, value].sort());
    setValue("");
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <Field name="holiday-new" label="Add a closure date" className="w-52">
          {({ id }) => (
            <input
              id={id}
              type="date"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="field"
            />
          )}
        </Field>
        <button type="button" onClick={add} disabled={!value} className="btn btn-secondary btn-sm">
          <CalendarOff size={14} aria-hidden="true" />
          Add
        </button>
      </div>

      {holidays.length === 0 ? (
        <p className="mt-3 text-sm text-ink-subtle">
          No closures listed — the restaurant is open every day the hours allow.
        </p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {holidays.map((day) => (
            <li key={day}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface py-1 pr-1 pl-3 text-xs">
                {formatDate(day)}
                <button
                  type="button"
                  onClick={() => onChange(holidays.filter((d) => d !== day))}
                  aria-label={`Remove the closure on ${formatDate(day)}`}
                  className="flex size-6 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-raised hover:text-wine"
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
