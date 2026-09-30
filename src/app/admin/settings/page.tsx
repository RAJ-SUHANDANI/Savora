import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { SettingsForm, type SettingsDraft } from "@/components/admin/settings-form";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings — Savora" };
export const dynamic = "force-dynamic";

/**
 * Settings.
 *
 * ## The saved values are read once and handed to a client form
 *
 * The editor mutates nested state, so it has to be a client component, which
 * means the values have to be serialisable to cross into it. `openingHours` is
 * `jsonb`, read through `settings-repo.ts` because Prisma 7 cannot type an
 * `Unsupported()` column — so it arrives as a plain object and is re-typed here
 * against `DayKey` rather than cast blindly. The cast is the one risky line in
 * the chain, and it is deliberate: the column is jsonb with no constraint, so
 * the alternative is a `Partial<Record<string, ...>>` and a lookup that can
 * return `undefined` on every read.
 *
 * ## No server action for anything but the one save
 *
 * `saveSettings` is the single write. There is no autosave, because a screen
 * that writes on every blur makes it impossible to leave a half-typed value
 * behind by accident — and it would mean a request per field on a form with
 * twenty of them.
 */
export default async function AdminSettingsPage() {
  const settings = await getSettings();

  const draft: SettingsDraft = {
    name: settings.name,
    tagline: settings.tagline,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    maxPartySize: settings.maxPartySize,
    bookingWindowDays: settings.bookingWindowDays,
    diningDurationMin: settings.diningDurationMin,
    holdDurationMin: settings.holdDurationMin,
    minNoticeHours: settings.minNoticeHours,
    timezone: settings.timezone,
    isAcceptingReservations: settings.isAcceptingReservations,
    openingHours: (settings.openingHours ?? {}) as SettingsDraft["openingHours"],
    holidays: settings.holidays ?? [],
  };

  const openDays = Object.entries(draft.openingHours).filter(([, windows]) => windows.length > 0);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="How Savora works"
        description={
          `Open ${openDays.length === 7 ? "every day" : `${openDays.length} days a week`}` +
          `${draft.holidays.length > 0 ? `, with ${draft.holidays.length} closure date${draft.holidays.length === 1 ? "" : "s"} listed` : ""}` +
          `. Tables can be booked up to ${draft.bookingWindowDays} days ahead, and online bookings are currently ${draft.isAcceptingReservations ? "open" : "closed"}.`
        }
      />

      <SettingsForm draft={draft} />
    </>
  );
}
