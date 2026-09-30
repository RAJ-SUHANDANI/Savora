/**
 * About.
 *
 * Long-form editorial. The page is measured and typographically tuned for
 * reading rather than for a grid of cards: a narrow prose column, a wide
 * gutter, and pull quotes that break out of the measure rather than sitting
 * inside it.
 */
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Leaf, Flame, HandHeart } from "lucide-react";

import { PublicShell } from "@/components/layout/public-shell";
import { SectionHeading, Lede } from "@/components/site/section-heading";
import { Parallax } from "@/components/ui/motion-primitives";
import { Reveal, RevealSection } from "@/components/ui/reveal";
import { getSettings } from "@/lib/settings";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Our story",
  description:
    "How Savora came to cook a menu that is written after the market rather than before it, and why there are only thirty covers.",
  alternates: { canonical: "/about" },
};

/** The people behind the pass. Editorial content, not data. */
const PEOPLE = [
  {
    name: "Rosa Marín",
    role: "Head chef",
    note: "Fifteen years in Barcelona and Marseille, and still refuses to write a menu before she has seen what landed.",
  },
  {
    name: "Marcus Oyelaran",
    role: "Grower liaison",
    note: "Knows every field within forty miles and will tell you, unprompted, which one is lying about a crop.",
  },
  {
    name: "Ida Lindqvist",
    role: "Wine",
    note: "Buys small growers nobody has heard of, then charges less than she should for them on purpose.",
  },
  {
    name: "Tomás Beck",
    role: "Front of house",
    note: "Has worked a Saturday service for six years and remembers roughly nine hundred regular names.",
  },
] as const;

const PRINCIPLES = [
  {
    icon: Leaf,
    title: "Buy from four people, not four hundred",
    body: "Hobbs Farm for leaves and roots, Two Fields for the hens, Aldeburgh for the fish, and a bakery on Crouch Street that opens at five. Four relationships means we can phone ahead and change the menu on the day.",
  },
  {
    icon: Flame,
    title: "Thirty covers, one kitchen",
    body: "We could seat a hundred. We seat thirty, twice, and we do it properly. A room that is half empty is a room nobody looks after.",
  },
  {
    icon: HandHeart,
    title: "Pay the grower first",
    body: "We pay suppliers within seven days regardless of whether the restaurant had a good week. It is a small thing that changes how people treat us.",
  },
] as const;

export default async function AboutPage() {
  const settings = await getSettings();

  return (
    <PublicShell>
      {/* ---- Header ---------------------------------------------------- */}
      <header className="pb-14 pt-10 md:pb-20 md:pt-16">
        <div className="container-editorial">
          <p className="eyebrow">Since 2016</p>
          <h1 className="mt-5 max-w-4xl text-display-2xl">
            A small kitchen that would rather be right than be full.
          </h1>
          <Lede className="mt-8 max-w-2xl">
            Savora began in a single room on Alder Lane with a wood stove, four
            tables and a stubborn idea: that a menu should be written after the
            market rather than before it. Nine years later the stove is gone and
            the idea has not moved.
          </Lede>
        </div>
      </header>

      {/* ---- Hero image ----------------------------------------------- */}
      <Parallax speed={0.06} className="container-editorial">
        <div className="grain relative aspect-[16/9] overflow-hidden rounded-[2rem] sm:aspect-[21/9]">
          <Image
            src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=2000&q=80"
            alt="The Savora dining room during service"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      </Parallax>

      {/* ---- The story ------------------------------------------------ */}
      <section className="py-24 md:py-32">
        <div className="container-editorial">
          <div className="grid gap-16 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
            <Reveal>
              <p className="eyebrow">The beginning</p>
              <h2 className="mt-4 text-display-lg">A stove, four tables, one rule</h2>
            </Reveal>

            <Reveal index={1} className="space-y-6 text-[1.0625rem] leading-relaxed text-ink-muted">
              <p>
                Rosa Marín had run the kitchen at a hotel outside Marseille for six
                years, where the menu was written in January for the following
                October. She got tired of cooking in February from a list that had
                been decided the previous year, so she left, bought a wood stove, and
                opened four tables.
              </p>
              <p>
                The rule was simple and stayed simple: nobody writes a dish until
                somebody has touched the produce. It was a working method rather
                than a philosophy, and it took about six months to pay for the
                difference.
              </p>
              <p>
                The hotel kept the reservations. Savora kept four tables and a
                waiting list. By the second winter the waiting list was the point.
              </p>
            </Reveal>
          </div>

          {/* Pull quote, breaking out of the prose measure. */}
          <Reveal className="my-20 border-y border-border-subtle py-14 text-center md:my-28">
            <blockquote className="mx-auto max-w-3xl font-display text-display-md italic leading-[1.2] text-balance">
              &ldquo;If I have not touched it, I have not tasted it, and I am not
              going to pretend otherwise on a menu.&rdquo;
            </blockquote>
            <p className="mt-7 text-sm text-ink-subtle">Rosa Marín, head chef</p>
          </Reveal>

          {/* ---- Principles ------------------------------------------- */}
          <div>
            <SectionHeading
              eyebrow="How we work"
              title="Three things we actually do"
              rule={false}
            />
            <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-12">
              {PRINCIPLES.map(({ icon: Icon, title, body }, i) => (
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
        </div>
      </section>

      {/* ---- The people ----------------------------------------------- */}
      <RevealSection className="border-y border-border-subtle bg-surface-raised py-24 md:py-32">
        <div className="container-editorial">
          <SectionHeading
            eyebrow="The four of us"
            title="Who you will actually meet"
            rule={false}
          />
          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {PEOPLE.map((person, i) => (
              <Reveal key={person.name} index={i} as="article">
                <div className="h-px w-10 bg-accent/50" />
                <h3 className="mt-5 font-display text-xl">{person.name}</h3>
                <p className="eyebrow mt-1.5">{person.role}</p>
                <p className="mt-4 text-sm leading-relaxed text-ink-muted">{person.note}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </RevealSection>

      {/* ---- Sourcing -------------------------------------------------- */}
      <section className="py-24 md:py-32">
        <div className="container-editorial">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
            <Parallax speed={0.08}>
              <div className="grain relative aspect-[4/5] overflow-hidden rounded-[1.75rem]">
                <Image
                  src="https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1200&q=80"
                  alt="Produce from the growers Savora buys from"
                  fill
                  sizes="(min-width: 1024px) 45vw, 90vw"
                  className="object-cover"
                />
              </div>
            </Parallax>

            <Reveal index={1}>
              <p className="eyebrow">Sourcing</p>
              <h2 className="mt-4 text-display-lg">Four suppliers, named</h2>
              <p className="mt-7 leading-relaxed text-ink-muted">
                We do not use words like &ldquo;local&rdquo; or
                &ldquo;seasonal&rdquo; as a marketing device, because they are
                unfalsifiable. These are the four we buy from, and you can visit
                all of them.
              </p>
              <dl className="mt-10 divide-y divide-border-subtle border-y border-border-subtle">
                {[
                  ["Hobbs Farm", "Leaves, roots and whatever is doing best — 6 miles"],
                  ["Two Fields", "Free-range chicken and eggs — 11 miles"],
                  ["Aldeburgh Fish Co.", "Day-boat catch, landed Thursdays — 38 miles"],
                  ["Crown Street Bakery", "Bread, from five in the morning — 300 metres"],
                ].map(([name, detail]) => (
                  <div key={name} className="flex flex-wrap items-baseline justify-between gap-2 py-4">
                    <dt className="font-display text-lg">{name}</dt>
                    <dd className="text-sm text-ink-muted">{detail}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-8 text-sm leading-relaxed text-ink-muted">
                Everything is delivered by the people who grow it. It is not very
                efficient and it is the entire point.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---- Closing --------------------------------------------------- */}
      <section className="border-t border-border-subtle bg-surface-raised py-24 text-center md:py-32">
        <div className="container-editorial">
          <Reveal>
            <h2 className="mx-auto max-w-3xl text-display-lg text-balance">
              We would still rather seat thirty people well than sixty quickly.
            </h2>
            <p className="mx-auto mt-6 max-w-lg leading-relaxed text-ink-muted">
              Tables are released {settings.bookingWindowDays} days ahead and we hold
              every booking for {settings.holdDurationMin} minutes past the time.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link href="/reserve" className="btn btn-primary">
                Reserve a table
              </Link>
              <Link href="/menu" className="btn btn-secondary">
                See tonight&rsquo;s menu
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}
