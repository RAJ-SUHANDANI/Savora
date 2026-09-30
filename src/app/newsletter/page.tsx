/**
 * The newsletter, as a page in its own right.
 *
 * ## Why this exists
 *
 * The footer's signup form is a plain `<form method="post">` so it works before
 * hydration. The cost of that choice is that a no-JS submit is a real navigation,
 * and it used to land on `/?joined=1` — a flag that *nothing read*. The guest was
 * thrown to the top of the site with no confirmation and no way to tell whether
 * their address had been kept. This page is where that navigation now lands, and
 * it reads the flag server-side, so the confirmation is painted in the HTML
 * rather than added by a client effect after the fact.
 *
 * With JavaScript the footer never navigates at all; it swaps to a confirmation
 * in place. This page is for the reader who wants to know what they are signing
 * up to before they type an address, which is a fair question to ask of a
 * restaurant that asks for your email in the footer of every page.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Check, Leaf, Mail, MailMinus, Sprout } from "lucide-react";

import { PublicShell } from "@/components/layout/public-shell";
import { NewsletterForm } from "@/components/layout/newsletter-form";
import { UnsubscribeForm } from "@/components/layout/unsubscribe-form";
import { Lede, SectionHeading } from "@/components/site/section-heading";
import { Reveal } from "@/components/ui/reveal";
import { getSettings } from "@/lib/settings";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Newsletter",
  description:
    "What is in the Savora newsletter, how often it arrives, and how to stop it. Seasonal menus, market arrivals and the occasional supper club.",
  alternates: { canonical: "/newsletter" },
};

/** The three things that actually go out, in the order a reader would care. */
const WHAT_WE_SEND = [
  {
    icon: CalendarDays,
    title: "The menu, before it is printed",
    body: "What we are cooking next month, written a few weeks ahead so you can book the evening you want rather than the evening you get.",
  },
  {
    icon: Sprout,
    title: "Market arrivals",
    body: "The fish that landed, the tomatoes that were worth buying, the last of the artichokes. Short, and only when there is something to say.",
  },
  {
    icon: Leaf,
    title: "Supper clubs and one-off nights",
    body: "Occasional, small, and announced to this list first. If you want a seat at one of these, this is the only way to hear about it.",
  },
] as const;

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; left?: string; already?: string }>;
}) {
  const [{ joined, left, already }, settings] = await Promise.all([
    searchParams,
    getSettings(),
  ]);
  const justJoined = joined === "1";
  const justLeft = left === "1";
  const wasAlready = already === "1";

  return (
    <PublicShell>
      {/* ---- Header ---------------------------------------------------- */}
      <header className="border-b border-border-subtle pb-14 pt-10 md:pb-20 md:pt-16">
        <div className="container-editorial">
          <p className="eyebrow">The letter</p>
          <h1 className="mt-5 max-w-4xl text-display-xl">
            A note from the kitchen, twice a month at most.
          </h1>
          <Lede className="mt-8 max-w-2xl">
            No offers, no countdown timers, no &ldquo;we miss you&rdquo;. One email when
            the menu changes and one when something worth a journey is happening,
            and nothing else. It is the same address we use for your booking
            confirmations, and it is the first thing we delete when you ask.
          </Lede>
        </div>
      </header>

      {/* ---- Confirmation ---------------------------------------------- */}
      {justJoined || justLeft || wasAlready ? (
        <div className="container-editorial pt-14 md:pt-20">
          <div
            role="status"
            className="flex max-w-2xl items-start gap-4 rounded-2xl border border-accent/25 bg-accent/8 p-6 md:p-7"
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-cream">
              {justLeft ? (
                <MailMinus size={18} aria-hidden="true" />
              ) : (
                <Check size={18} aria-hidden="true" />
              )}
            </span>
            <div>
              {justJoined ? (
                <>
                  <p className="font-display text-xl">You&rsquo;re on the list.</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    The next letter goes out when the menu changes. If it does
                    not arrive, check the spam folder once &mdash; and if it is
                    still not there, the address may already have been on the
                    list, in which case you are already subscribed and there is
                    nothing to do.
                  </p>
                </>
              ) : justLeft ? (
                <>
                  <p className="font-display text-xl">We have stopped.</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    Your address is off the newsletter list. Your booking
                    confirmations and reminders are transactional and are
                    unaffected, because those are part of the table you booked
                    rather than part of the letter.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-xl">
                    That address was not on the list.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    Nothing to undo &mdash; it was already unsubscribed, or it was
                    never added. Either way you will not hear from this list.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ---- What goes out --------------------------------------------- */}
      <section className="py-20 md:py-28">
        <div className="container-editorial">
          <Reveal>
            <SectionHeading
              eyebrow="What is in it"
              title="Three things, and only when they are true"
            />
          </Reveal>

          <ul className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {WHAT_WE_SEND.map((item, i) => (
              // `as="li"` because the stagger wrapper has to be the list item
              // itself. Wrapping an <li> in a <section> inside a <ul> is invalid
              // HTML, and invalid nesting is one of the ways a page ends up with
              // a hydration mismatch.
              <Reveal as="li" key={item.title} index={i}>
                <div className="border-t border-border-subtle pt-7">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-terracotta-soft text-accent">
                    <item.icon size={19} aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 font-display text-xl">{item.title}</h3>
                  <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-muted">
                    {item.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Sign up ---------------------------------------------------- */}
      <section className="py-4 md:py-8">
        <div className="container-editorial">
          <Reveal>
            <div className="rounded-3xl border border-border-subtle bg-surface-raised p-8 md:p-12">
              <div className="grid gap-10 md:grid-cols-[1.3fr_1fr] md:gap-16">
                <div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-cream">
                    <Mail size={19} aria-hidden="true" />
                  </span>
                  <h2 className="text-display-md">Put your address in</h2>
                  <p className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-ink-muted">
                    One field, no password, no account. If you already have a
                    booking with us, use the same address and you will only ever
                    get one copy of anything.
                  </p>
                  <p className="mt-6 text-sm leading-relaxed text-ink-subtle">
                    We keep the address until you unsubscribe, and we use it for
                    this letter and for the transactional email about your table
                    &mdash; nothing else. The{" "}
                    <Link href="/privacy" className="link-underline text-accent">
                      privacy notice
                    </Link>{" "}
                    says so in full.
                  </p>
                </div>

                <div className="md:pt-2">
                  <NewsletterForm
                    inputId="newsletter-page-email"
                    className="mt-0"
                    successText="Done — you’re on the list. Nothing else to do."
                  />
                  <p className="mt-4 text-xs text-ink-subtle">
                    Signing up twice is not a problem; it will simply tell you that
                    you are already on the list.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- Leave ------------------------------------------------------ */}
      <section className="py-20 md:py-28">
        <div className="container-editorial">
          <Reveal>
            <div className="grid gap-10 border-t border-border-subtle pt-14 md:grid-cols-[1fr_1fr] md:gap-16">
              <div>
                <h2 className="text-display-md">Changed your mind?</h2>
                <p className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-ink-muted">
                  Every letter has a one-click unsubscribe at the bottom, and
                  this works too. We keep the record of the opt-out so we do not
                  accidentally re-add you, and the address stops being used the
                  moment you press the button.
                </p>
              </div>
              <div className="md:pt-2">
                <UnsubscribeForm />
                <p className="mt-4 text-xs text-ink-subtle">
                  This does not cancel a booking. To change or cancel a table, use
                  the link in your confirmation email or{" "}
                  <Link href="/contact" className="link-underline text-accent">
                    call the restaurant
                  </Link>
                  .
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- Footer note ------------------------------------------------ */}
      <section className="pb-24 md:pb-32">
        <div className="container-editorial">
          <p className="max-w-2xl text-sm leading-relaxed text-ink-subtle">
            {settings.name} is a demonstration restaurant. The menu, the tables and
            the bookings on this site are sample data &mdash; see the{" "}
            <Link href="/about" className="link-underline text-accent">
              about page
            </Link>{" "}
            for what that means in practice.
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
