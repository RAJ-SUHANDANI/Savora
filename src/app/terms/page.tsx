/**
 * Booking terms.
 *
 * The conditions a guest actually needs to know before they commit to a table,
 * written in the order they will hit them: booking, changing, the table itself,
 * the food, then the rare and formal bits at the end. The numbers that the owner
 * controls — the booking window, the notice period, the hold, the sitting length,
 * the party limit — are read from settings so the page can never contradict the
 * booking engine sitting behind it.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Clock, GlassWater, Salad, Scale, TriangleAlert, UserRound } from "lucide-react";

import { PublicShell } from "@/components/layout/public-shell";
import { Lede, SectionHeading } from "@/components/site/section-heading";
import { Reveal, RevealSection } from "@/components/ui/reveal";
import { getSettings } from "@/lib/settings";
import type { Settings } from "@/lib/settings";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Booking terms",
  description:
    "The conditions of booking a table at Savora: the booking window, holds, changes and cancellations, dietary requirements, and how complaints are handled.",
  alternates: { canonical: "/terms" },
};

/** Cancellation policy, quoted as a constant so both the page and any later
 *  copy change in one place rather than drifting apart. */
const FREE_CANCELLATION_HOURS = 24;

/** The six things a guest asks about, in the order they ask them.
 *
 *  A function rather than a constant because the numbers in the copy are the
 *  ones the owner can change in /admin/settings, and a terms page that
 *  contradicts the booking engine is worse than no terms page at all. */
const bookingRules = (settings: Settings) =>
  [
    {
      icon: CalendarClock,
      title: "How far ahead you can book",
      body: `Tables open ${settings.bookingWindowDays} days in advance and close on the day they are needed. Same-day bookings need ${settings.minNoticeHours} hours' notice, because buying for a table that has already turned into another is how you end up cooking for six people who are not there.`,
    },
    {
      icon: Clock,
      title: "How long we hold it",
      body: `We hold your table for ${settings.holdDurationMin} minutes past the time you chose. If you are running behind, telephone — we will still have laid it, and it is far better to know.`,
    },
    {
      icon: UserRound,
      title: "Who can book",
      body: `Anyone. You do not need an account, and we will not ask for a card. Parties above ${settings.maxPartySize}, the private room, or a whole dinner bought out are arranged by hand — telephone and we will sort it out properly.`,
    },
    {
      icon: Scale,
      title: "Deposits and payment",
      body: "There is no deposit and no card on file. You pay at the table, and the bill is split however you ask. If you do not turn up without telling us, the no-show is recorded against the email address used to book, because that is how a small room stays full.",
    },
    {
      icon: Salad,
      title: "Allergies and diets",
      body: "Tell us at booking and again on the reminder, and the kitchen will cook around it. Vegan, vegetarian and gluten-free are ordinary here, not a special request. Nut allergies are a genuine conversation rather than a box we tick, and we will be honest with you about what we can and cannot promise.",
    },
    {
      icon: GlassWater,
      title: "The menu and the wine",
      body: "The menu is written after the market each day, so dishes appear and disappear. Prices on this site match the till on the day you book, but a day's catch can move them. Allergens are marked on the current menu; if in doubt, ask before ordering rather than after.",
    },
  ] as const;

/** The formal tail. Short, because nobody reads further than this. */
const LEGAL = [
  [
    "This website",
    "We keep the site accurate and available, but tables move in real time: a sitting can be taken between the moment you pick it and the moment you press confirm, and if that happens we will offer you the nearest time rather than a page that has stopped working. Photographs of dishes are representative of the style of cooking, not a promise about a particular plate on a particular evening.",
  ],
  [
    "Your account",
    "One account per person. Keep your password to yourself; you are responsible for what is booked under your email address. We may close an account that is used to abuse the booking form or to harass staff, and we will tell you when we do.",
  ],
  [
    "Liability",
    "Nothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot lawfully be limited. Subject to that, our total liability arising from a booking is limited to the amount you paid for it — which, since you pay at the table, is the bill.",
  ],
  [
    "Complaints",
    "Tell us within 14 days, while it is still fresh, by telephone or email. We would rather hear about a cold plate than read about it a year later. Where we got something wrong we will put it right on the night or refund it, and where we did not we will say so.",
  ],
  [
    "Governing law",
    "These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction over any dispute. If you live in Scotland or Northern Ireland, nothing here takes away your statutory rights under UK consumer law.",
  ],
] as const;

export default async function TermsPage() {
  const settings = await getSettings();

  return (
    <PublicShell>
      {/* ---- Header ---------------------------------------------------- */}
      <header className="border-b border-border-subtle pb-14 pt-10 md:pb-20 md:pt-16">
        <div className="container-editorial">
          <p className="eyebrow">The fine print</p>
          <h1 className="mt-5 max-w-4xl text-display-xl">
            The terms, written the way we would say them at the door.
          </h1>
          <Lede className="mt-8 max-w-2xl">
            Nothing here is designed to be difficult. It exists so that both of us
            know what happens if a table changes, a dish is unavailable, or
            something is not right. Read the first two sections; skim the rest.
          </Lede>
          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-subtle">
            These terms apply to bookings made through this website and to bookings
            taken by telephone. They sit alongside our{" "}
            <Link href="/privacy" className="link-underline text-accent">
              privacy notice
            </Link>
            , which covers what we do with your details.
          </p>
        </div>
      </header>

      {/* ---- Booking and changing --------------------------------------- */}
      <section className="py-20 md:py-28">
        <div className="container-editorial">
          <SectionHeading
            eyebrow="Booking"
            title="What you are agreeing to"
            lede="These are the six questions the front desk answers most often, answered in advance so you do not have to ask at seven o&rsquo;clock on a Friday."
            rule={false}
          />
          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
            {bookingRules(settings).map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} index={i}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-terracotta-soft text-accent">
                  <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3 className="mt-6 font-display text-xl leading-snug">{title}</h3>
                <p className="mt-3.5 text-sm leading-relaxed text-ink-muted">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Changes and cancellations ----------------------------------- */}
      <RevealSection className="border-y border-border-subtle bg-surface-raised py-20 md:py-28">
        <div className="container-editorial">
          <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <Reveal>
              <p className="eyebrow">Changing your mind</p>
              <h2 className="mt-4 text-display-lg">Plans change, and that is fine</h2>
              <p className="mt-7 leading-relaxed text-ink-muted">
                The link in your confirmation email gets you back to your booking at
                any hour, and you can move it or cancel it yourself. It stays valid
                for the whole booking — no code to remember, no telephone queue.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/reserve" className="btn btn-primary btn-sm">
                  Book a table
                </Link>
                <Link href="/privacy" className="btn btn-secondary btn-sm">
                  How we use your details
                </Link>
              </div>
            </Reveal>

            <Reveal index={1} className="space-y-6 text-[1.0625rem] leading-relaxed text-ink-muted">
              <p>
                <strong className="font-medium text-ink">Free of charge</strong> up to{" "}
                {FREE_CANCELLATION_HOURS} hours before your sitting, through the link in
                the email or by telephoning {settings.phone}. We release the table
                straight back into service, which is usually the most valuable thing
                you can give another guest on a Friday.
              </p>
              <p>
                <strong className="font-medium text-ink">Inside {FREE_CANCELLATION_HOURS} hours</strong>{" "}
                we will still cancel without charge if you tell us — a table given up
                with notice is worth more to us than a no-show. What we cannot do is
                pretend the room was not held for you: a late cancellation or a no-show
                is recorded, and repeat bookings on a Friday are made by telephone.
              </p>
              <p>
                <strong className="font-medium text-ink">Moving a time</strong> is treated
                as a change, not a cancellation, and is free within the same window
                subject to a table actually being free. The kitchen plans sittings in
                order, so a swap two hours before service may not be possible and we
                would rather say so early than disappoint you on the night.
              </p>
              <p>
                <strong className="font-medium text-ink">Bought-out dinners and the private room</strong>{" "}
                are arranged separately and carry their own terms, because we are
                buying to a different plan and feeding a different number of people.
                Ask and we will put them in writing.
              </p>
            </Reveal>
          </div>

          {/* Pull quote, breaking out of the prose measure as on /about. */}
          <Reveal className="my-16 border-y border-border-subtle py-12 text-center">
            <blockquote className="mx-auto max-w-3xl font-display text-display-md italic leading-[1.2] text-balance">
              &ldquo;We would far rather have a table back at six o&rsquo;clock than a
              name on a list.&rdquo;
            </blockquote>
            <p className="mt-6 text-sm text-ink-subtle">Tomás Beck, front of house</p>
          </Reveal>
        </div>
      </RevealSection>

      {/* ---- At the table ------------------------------------------------ */}
      <section className="py-20 md:py-28">
        <div className="container-editorial">
          <SectionHeading
            eyebrow="On the night"
            title="Three small things that surprise people"
            rule={false}
          />
          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-12">
            {[
              {
                title: "We cannot promise a particular table",
                body: "You are booking a sitting, not a seat. We assign tables on the day around who else is coming, so a window request is a request. If it matters enough, telephone on the day and we will do what we can.",
              },
              {
                title: "The garden is at the mercy of the weather",
                body: "Outdoor tables are served whatever the sky is doing. If we have to move you inside, we will tell you before you have sat down, and you will not be charged a different price for it.",
              },
              {
                title: "The sitting has an end time, not all night",
                body: `Your table is yours for the ${settings.diningDurationMin} minutes of the sitting, and the next one arrives on time. That is why we ask you to arrive at the hour rather than whenever. If you want to stay longer, order another bottle and stay — the room is yours after dessert.`,
              },
            ].map(({ title, body }, i) => (
              <Reveal key={title} index={i}>
                <div className="h-px w-10 bg-accent/50" />
                <h3 className="mt-5 font-display text-xl leading-snug">{title}</h3>
                <p className="mt-3.5 text-sm leading-relaxed text-ink-muted">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- The legal tail ----------------------------------------------- */}
      <RevealSection className="border-y border-border-subtle bg-surface-raised py-20 md:py-28">
        <div className="container-editorial">
          <div className="grid gap-14 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
            <Reveal>
              <p className="eyebrow">The rest of it</p>
              <h2 className="mt-4 text-display-lg">The five short paragraphs</h2>
              <p className="mt-7 leading-relaxed text-ink-muted">
                These are the parts a lawyer asks for. They are here in full because
                hiding them behind a link would be a strange thing to do in a room
                that trades on telling you the price of the fish.
              </p>
            </Reveal>

            <Reveal index={1} className="divide-y divide-border-subtle border-y border-border-subtle">
              {LEGAL.map(([title, body]) => (
                <div key={title} className="py-6">
                  <h3 className="font-display text-lg">{title}</h3>
                  <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-muted">{body}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </RevealSection>

      {/* ---- Closing ------------------------------------------------------ */}
      <section className="py-24 text-center md:py-32">
        <div className="container-editorial">
          <Reveal>
            <TriangleAlert size={22} className="mx-auto text-accent/60" strokeWidth={1.5} aria-hidden="true" />
            <h2 className="mx-auto mt-6 max-w-3xl text-display-lg text-balance">
              Anything at all unclear before you book, ask us first.
            </h2>
            <p className="mx-auto mt-6 max-w-lg leading-relaxed text-ink-muted">
              We take bookings up to {settings.bookingWindowDays} days ahead, hold
              every table for {settings.holdDurationMin} minutes past the hour, and
              would rather answer a question before you commit than after.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link href="/reserve" className="btn btn-primary">
                Reserve a table
              </Link>
              <Link href="/contact" className="btn btn-secondary">
                Getting here
              </Link>
            </div>
            <p className="mx-auto mt-10 max-w-md text-xs leading-relaxed text-ink-subtle">
              Last reviewed{" "}
              {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              . We will put a note on this page if anything above changes.
            </p>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}
