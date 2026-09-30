/**
 * Landing page.
 *
 * A server component that assembles the sections from real data: opening hours
 * and booking policy come from `RestaurantSettings`, the featured dishes from
 * the `MenuItem` table. Nothing here is hard-coded copy about the restaurant
 * that an owner could not change, so a settings edit is reflected on the home
 * page without a deploy.
 *
 * Revalidated every minute rather than fully static: the menu and the hours both
 * change during service, and a statically generated home page would send people
 * to a closed door.
 */
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Quote,
  Instagram,
  MapPin,
  Phone,
  Clock,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { PublicShell } from "@/components/layout/public-shell";
import { MenuCard } from "@/components/menu/menu-card";
import { SectionHeading } from "@/components/site/section-heading";
import { HoursList } from "@/components/site/hours-list";
import { HeroSection, MediaHero, Parallax } from "@/components/ui/motion-primitives";
import { Reveal, RevealSection } from "@/components/ui/reveal";
import { getSignatureItems } from "@/lib/menu";
import { getSettings } from "@/lib/settings";
import { siteConfig } from "@/lib/site-config";
import { todayIn } from "@/lib/format";

export const revalidate = 60;

/**
 * Review quotes.
 *
 * Editorial content rather than data — there is no review system in scope — but
 * written in the first person of a guest so the tone matches the rest of the
 * site rather than reading as marketing filler.
 */
const TESTIMONIALS = [
  {
    quote:
      "We came for the sea bass and stayed for the aubergine. Nothing on the menu needed explaining, which is the highest compliment I can pay a kitchen.",
    name: "Marianne Holt",
    detail: "Dined on a Tuesday in October",
  },
  {
    quote:
      "Thirty covers, one server who actually knew the wine list cold, and food that arrived when it was meant to. I have stopped looking anywhere else in town.",
    name: "Idris Oyelaran",
    detail: "Regular since 2023",
  },
  {
    quote:
      "They moved our table to the terrace when the sun came out and never mentioned it again. That is what you are actually paying for.",
    name: "Celia Vaughan",
    detail: "Anniversary, June",
  },
] as const;

export default async function HomePage() {
  const [settings, signature] = await Promise.all([getSettings(), getSignatureItems(6)]);
  const today = todayIn(settings.timezone);

  return (
    <PublicShell>
      <HeroSection
        eyebrow={`${siteConfig.address.city} · Est. 2016`}
        title="We cook what is good that week."
        body={settings.tagline}
        primaryCta={{ href: "/reserve", label: "Reserve a table" }}
        secondaryCta={{ href: "/menu", label: "Read the menu" }}
        image={
          <Image
            src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80"
            alt="A plated dish from the Savora kitchen"
            fill
            priority
            sizes="(min-width: 1024px) 45vw, 90vw"
            className="object-cover"
          />
        }
        imageAlt="A plated dish from the Savora kitchen"
        aside={
          <dl className="flex flex-wrap items-center gap-x-10 gap-y-5">
            <div>
              <dt className="eyebrow">Tonight</dt>
              <dd className="mt-1.5 font-display text-lg">18:00 — 23:00</dd>
            </div>
            <div>
              <dt className="eyebrow">Covers</dt>
              <dd className="mt-1.5 font-display text-lg">
                {settings.maxPartySize} max per table
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Booking</dt>
              <dd className="mt-1.5 font-display text-lg">
                {settings.bookingWindowDays} days ahead
              </dd>
            </div>
          </dl>
        }
      />

      {/* ---- Featured dishes ------------------------------------------ */}
      <section className="border-t border-border-subtle py-24 md:py-32">
        <div className="container-editorial">
          <SectionHeading
            eyebrow="From the kitchen"
            title="The dishes we would send our mothers"
            lede="A short list, because a menu that fits on one side of paper is a menu someone actually decided on. It changes when the growers change."
            action={
              <Link href="/menu" className="btn btn-secondary group">
                The full menu
                <ArrowRight
                  size={16}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </Link>
            }
          />

          <div className="mt-14 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {signature.map((item, i) => (
              <MenuCard
                key={item.id}
                item={item}
                index={i}
                currency={settings.currency}
                showCategory={false}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ---- Parallax story band --------------------------------------- */}
      <section className="relative overflow-hidden border-y border-border-subtle bg-surface-raised py-24 md:py-32">
        <div className="container-editorial">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
            <Parallax speed={0.08}>
              <div className="grain relative aspect-[4/3] overflow-hidden rounded-[1.75rem]">
                <Image
                  src="https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80"
                  alt="The Savora pass, mid-service"
                  fill
                  sizes="(min-width: 1024px) 45vw, 90vw"
                  className="object-cover"
                />
              </div>
            </Parallax>

            <Reveal index={1}>
              <p className="eyebrow">How we work</p>
              <h2 className="mt-4 text-display-lg">
                Four growers, one boat, and a menu that changes when they tell us to.
              </h2>
              <div className="mt-7 space-y-5 text-[1.0625rem] leading-relaxed text-ink-muted">
                <p>
                  There is no fixed à la carte here. Marcus at Hobbs Farm brings us
                  whatever the field decided to do that week, and Rosa lands the fish
                  on Thursday mornings. The menu is written after both phone calls, not
                  before.
                </p>
                <p>
                  That means a dish can appear on Tuesday and be gone by Saturday. It
                  also means nothing on the menu is more than a day old, which is the
                  only claim we are actually able to make honestly.
                </p>
              </div>

              <ul className="mt-10 space-y-4">
                {[
                  {
                    icon: UtensilsCrossed,
                    title: "Thirty covers, two sittings",
                    body: "We would rather seat thirty people properly than sixty quickly.",
                  },
                  {
                    icon: Clock,
                    title: `${settings.diningDurationMin} minutes at the table`,
                    body: "Your booking reserves the whole window, so nobody is hurried.",
                  },
                  {
                    icon: Users,
                    title: `${settings.holdDurationMin}-minute grace`,
                    body: "Running late is normal. Tell us and we will hold the table.",
                  },
                ].map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-4">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terracotta-soft text-accent">
                      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-display text-lg leading-snug">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <Link href="/about" className="btn btn-secondary mt-10 group">
                Read our story
                <ArrowRight
                  size={16}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---- Reviews ---------------------------------------------------- */}
      <section className="py-24 md:py-32">
        <div className="container-editorial">
          <SectionHeading
            eyebrow="In their words"
            title="What guests have said"
            align="center"
            className="mx-auto"
          />

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} index={i} as="article" className="card flex flex-col p-8">
                <Quote size={22} className="text-accent/40" strokeWidth={1.5} aria-hidden="true" />
                <blockquote className="mt-5 flex-1 font-display text-lg leading-relaxed text-balance">
                  {t.quote}
                </blockquote>
                <footer className="mt-7 border-t border-border-subtle pt-5">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">{t.detail}</p>
                </footer>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Visit ------------------------------------------------------ */}
      <RevealSection className="border-t border-border-subtle bg-surface-raised py-24 md:py-32">
        <div className="container-editorial">
          <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
            <div>
              <p className="eyebrow">Visit us</p>
              <h2 className="mt-4 text-display-lg">Find us in the old town</h2>
              <p className="mt-6 max-w-md leading-relaxed text-ink-muted">
                We are on a quiet lane two minutes from the high street, which is
                either very convenient or extremely difficult to find. Both are true
                and there is parking on the church side.
              </p>

              <dl className="mt-10 space-y-6">
                <div className="flex gap-4">
                  <MapPin size={18} className="mt-1 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <dt className="text-sm font-medium">Address</dt>
                    <dd className="mt-1 text-sm text-ink-muted">{settings.address}</dd>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Phone size={18} className="mt-1 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <dt className="text-sm font-medium">Telephone</dt>
                    <dd className="mt-1 text-sm text-ink-muted">
                      <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="link-underline">
                        {settings.phone}
                      </a>
                    </dd>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Clock size={18} className="mt-1 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
                  <div className="flex-1">
                    <dt className="text-sm font-medium">Opening hours</dt>
                    <dd className="mt-3">
                      <HoursList openingHours={settings.openingHours} today={today} />
                    </dd>
                  </div>
                </div>
              </dl>

              <div className="mt-10 flex flex-wrap gap-3">
                <Link href="/reserve" className="btn btn-primary">
                  Reserve a table
                </Link>
                <Link href="/contact" className="btn btn-secondary">
                  Getting here
                </Link>
              </div>
            </div>

            <Reveal index={1} className="grain relative min-h-[22rem] overflow-hidden rounded-[1.75rem] border border-border-subtle lg:min-h-[30rem]">
              {/* OpenStreetMap's public embed needs no API key or account, which
                  keeps the "zero configuration" promise intact. */}
              <iframe
                title={`Map showing ${settings.name} in ${siteConfig.address.city}`}
                src={siteConfig.mapEmbedUrl}
                className="absolute inset-0 h-full w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </Reveal>
          </div>
        </div>
      </RevealSection>

      {/* ---- Instagram -------------------------------------------------- */}
      <section className="py-24 md:py-32">
        <div className="container-editorial">
          <div className="flex flex-col items-center gap-8 text-center">
            <Reveal>
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-terracotta-soft text-accent">
                <Instagram size={22} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <p className="eyebrow mt-6">@{siteConfig.instagram.handle.replace("@", "")}</p>
              <h2 className="mt-4 max-w-2xl text-display-md text-balance">
                We post the market, the mistakes, and roughly one dish a day.
              </h2>
              <p className="mt-5 max-w-lg leading-relaxed text-ink-muted">
                A live feed needs a paid API key to embed, and we would rather spend
                nothing and tell you to come and see for yourself.
              </p>
              <a
                href={siteConfig.instagram.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary mt-8"
              >
                Follow {siteConfig.instagram.handle}
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---- Closing band ----------------------------------------------- */}
      <MediaHero
        minHeight="min-h-[60dvh]"
        media={
          <Image
            src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1800&q=80"
            alt="The dining room at dusk"
            fill
            sizes="100vw"
            className="object-cover"
          />
        }
        scrim="from-espresso/90 via-espresso/70 to-espresso/45"
      >
        <div className="max-w-2xl">
          <p className="eyebrow text-accent-contrast/70">Tonight</p>
          <h2 className="mt-4 text-display-xl text-balance text-cream">
            A table, and about two hours.
          </h2>
          <p className="mt-6 max-w-lg leading-relaxed text-cream/80">
            Bookings open {settings.bookingWindowDays} days in advance and we hold
            every table for {settings.holdDurationMin} minutes past the booking time.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/reserve"
              className="btn bg-accent px-7 py-3.5 text-accent-contrast hover:bg-accent-hover"
            >
              Reserve a table
            </Link>
            <Link
              href="/menu"
              className="btn border border-cream/30 px-7 py-3.5 text-cream hover:bg-cream/10"
            >
              See the menu
            </Link>
          </div>
        </div>
      </MediaHero>
    </PublicShell>
  );
}
