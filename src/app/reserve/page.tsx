/**
 * Reserve a table.
 *
 * A server shell around a client flow, which is the right split here for a
 * reason beyond habit: the settings that shape the flow — the booking window,
 * the maximum party size, the opening hours that decide which days are even
 * possible — are owner-editable, and the client needs all of them to render
 * step one without a round trip. So the page reads settings on the server and
 * hands the flow a plain, serialisable config. The only thing the client fetches
 * itself is live availability, which changes minute by minute and must never be
 * cached.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, Phone } from "lucide-react";

import { PublicShell } from "@/components/layout/public-shell";
import { BookingFlow, type BookingConfig } from "@/components/reserve/booking-flow";
import { SectionHeading } from "@/components/site/section-heading";
import { Reveal } from "@/components/ui/reveal";
import { getSettings } from "@/lib/settings";
import { currentUser } from "@/lib/auth";
import { siteConfig } from "@/lib/site-config";
import { addDaysIso, formatDate, todayIn } from "@/lib/format";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Reserve a table",
  description:
    "Book a table at Savora in Colchester. Choose a date, tell us how many you are, pick a sitting, and we will hold it for you — no account needed.",
  alternates: { canonical: "/reserve" },
};

export default async function ReservePage() {
  const settings = await getSettings();
  const user = await currentUser();

  const today = todayIn(settings.timezone);

  /**
   * The window is inclusive on both ends, so the last bookable day is
   * `bookingWindowDays - 1` days from today. The server's own clock decides what
   * "today" is, in the *restaurant's* timezone — a guest in New York booking
   * for tonight in Colchester must not be offered a date that has already passed
   * there.
   */
  const maxDate = addDaysIso(today, Math.max(0, settings.bookingWindowDays - 1));

  const config: BookingConfig = {
    today,
    minDate: today,
    maxDate,
    maxPartySize: settings.maxPartySize,
    diningDurationMin: settings.diningDurationMin,
    minNoticeHours: settings.minNoticeHours,
    holdMinutes: settings.holdDurationMin,
    holidays: settings.holidays,
    openingHours: settings.openingHours,
    isAcceptingReservations: settings.isAcceptingReservations,
    restaurantName: settings.name,
    address: settings.address,
    phone: settings.phone,
    defaultGuest: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      // The account record has no phone of its own; the guest's last booking is
      // the closest thing, and re-typing a number is the single most common
      // reason a form gets abandoned.
      phone: "",
    },
    signedIn: Boolean(user),
  };

  return (
    <PublicShell>
      {/* ---- Header ---------------------------------------------------- */}
      <header className="border-b border-border-subtle pb-12 pt-10 md:pb-16 md:pt-14">
        <div className="container-editorial">
          <p className="eyebrow">Reservations</p>
          <h1 className="mt-5 max-w-3xl text-display-xl">Book your table.</h1>
          <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-ink-muted">
            Five short steps, about a minute. We will email a confirmation and a link that
            lets you change or cancel without telephoning us.
          </p>
        </div>
      </header>

      {/* ---- The flow --------------------------------------------------- */}
      <section className="py-14 md:py-20">
        <div className="container-editorial">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
            <BookingFlow config={config} />

            {/* ---- Aside ------------------------------------------------ */}
            <aside className="space-y-10 lg:pt-4">
              <Reveal>
                <h2 className="font-display text-xl">Prefer to talk to someone?</h2>
                <p className="mt-3.5 text-sm leading-relaxed text-ink-muted">
                  For anything the form cannot do — a party larger than{" "}
                  {settings.maxPartySize}, the private room, a full dinner bought out — call
                  us and we will arrange it by hand.
                </p>
                <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="btn btn-secondary mt-6 w-full">
                  <Phone size={15} aria-hidden="true" />
                  {settings.phone}
                </a>
              </Reveal>

              <Reveal index={1}>
                <h2 className="font-display text-xl">Good to know</h2>
                <ul className="mt-5 space-y-4 text-sm leading-relaxed text-ink-muted">
                  <li className="flex gap-3">
                    <Clock size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    <span>
                      We hold a table for {settings.holdDurationMin} minutes past the hour you
                      booked. Phone us if you are running behind.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <Clock size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    <span>
                      Same-day bookings need {settings.minNoticeHours} hours&rsquo; notice, and
                      we take bookings up to {formatDate(maxDate)}.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <Mail size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    <span>
                      A reminder follows the day before, so there is time to tell us about an
                      allergy or a change of plan.
                    </span>
                  </li>
                </ul>
              </Reveal>

              <Reveal index={2}>
                <div className="surface-raised rounded-2xl p-6">
                  <p className="eyebrow">Where we are</p>
                  <address className="mt-3 text-sm not-italic leading-relaxed text-ink-muted">
                    {settings.address}
                  </address>
                  <a
                    href={siteConfig.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-underline tap-target mt-2 text-sm text-accent"
                  >
                    Directions
                  </a>
                  <Link
                    href="/menu"
                    className="link-underline tap-target mt-5 text-sm text-ink-muted"
                  >
                    Read the menu while you decide
                  </Link>
                </div>
              </Reveal>
            </aside>
          </div>
        </div>
      </section>

      {/* ---- What happens next ----------------------------------------- */}
      <section className="border-t border-border-subtle bg-surface-raised py-20 md:py-28">
        <div className="container-editorial">
          <SectionHeading
            eyebrow="After you book"
            title="What happens next"
          />
          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-12">
            {[
              {
                step: "01",
                title: "A confirmation, straight away",
                body: "It lands in your inbox within seconds, with the code to quote at the door and a link to manage the booking. If it has not arrived in ten minutes, check the spam folder and then telephone us — we would rather hear from you.",
              },
              {
                step: "02",
                title: "A note before you come",
                body: "The afternoon before, we email a reminder. It is the moment to tell us about an allergy, a wheelchair, a pushchair, or a change of time — all far easier to arrange three days ahead than an hour before.",
              },
              {
                step: "03",
                title: "The kitchen gets ready",
                body: "Your table is assigned when you book, not on the day, so it is yours. We hold it for you from the hour you chose until a little after, and if you are running late we will still have laid it.",
              },
            ].map(({ step, title, body }, i) => (
              <Reveal key={step} index={i}>
                <p className="font-display text-3xl text-accent/35">{step}</p>
                <h3 className="mt-5 font-display text-xl">{title}</h3>
                <p className="mt-3.5 text-sm leading-relaxed text-ink-muted">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
