/**
 * A single dish.
 *
 * `/menu/[slug]` — the folder is named for what it looks up rather than for the
 * id, because the URL a guest sees is the same either way but the code is
 * clearer when the parameter name says what it means.
 *
 * Every dish is a real, shareable, indexable URL with its own metadata and
 * JSON-LD, which is what makes a restaurant menu findable in search. Sold-out
 * dishes render rather than 404: a guest who came for the fried squid should
 * learn that it exists and has gone, not conclude the restaurant does not serve
 * it.
 */
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Flame, Leaf, WheatOff, CalendarCheck } from "lucide-react";

import { PublicShell } from "@/components/layout/public-shell";
import { MenuCard } from "@/components/menu/menu-card";
import { SectionHeading } from "@/components/site/section-heading";
import { FavoriteButton } from "@/components/menu/favorite-button";
import { Reveal } from "@/components/ui/reveal";
import { CATEGORY_LABELS, DIET_SCHEMA_URLS, TAG_LABELS } from "@/lib/constants";
import { formatPrice, pluralise } from "@/lib/format";
import { getMenuItemBySlug, getRelatedItems } from "@/lib/menu";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { siteConfig } from "@/lib/site-config";

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const items = await prisma.menuItem.findMany({ select: { slug: true } });
  return items.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const item = await getMenuItemBySlug(slug);
  if (!item) return { title: "Dish not found" };

  return {
    title: item.name,
    description: item.description,
    alternates: { canonical: `/menu/${item.slug}` },
    openGraph: {
      title: `${item.name} — ${siteConfig.name}`,
      description: item.description,
      url: `${siteConfig.url}/menu/${item.slug}`,
      images: [{ url: item.imageUrl, width: 1200, height: 1500, alt: item.name }],
      type: "article",
    },
  };
}

export default async function DishPage({ params }: Params) {
  const { slug } = await params;
  const [item, settings, user] = await Promise.all([
    getMenuItemBySlug(slug),
    getSettings(),
    // Reading the session makes this page dynamic, which is correct: the save
    // button must know whether the visitor is signed in, or it would render a
    // control that can only fail.
    currentUser(),
  ]);

  if (!item) notFound();

  const [related, favorited] = await Promise.all([
    getRelatedItems(item.id, item.category, 3),
    user
      ? prisma.favorite.findUnique({
          where: { userId_menuItemId: { userId: user.id, menuItemId: item.id } },
          select: { userId: true },
        })
      : null,
  ]);

  /** Menu/MenuItem JSON-LD, so the dish can appear in search with its price. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MenuItem",
    name: item.name,
    description: item.description,
    image: item.imageUrl,
    offers: {
      "@type": "Offer",
      price: (item.priceCents / 100).toFixed(2),
      priceCurrency: settings.currency,
      availability:
        item.isAvailable && !item.isSoldOut
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
    },
    nutrition: item.calories
      ? { "@type": "NutritionInformation", calories: `${item.calories} calories` }
      : undefined,
    suitableForDiet: item.tags
      .map((tag) => DIET_SCHEMA_URLS[tag])
      .filter((url): url is string => Boolean(url)),
  };

  return (
    <PublicShell>
      <article className="pb-24">
        <div className="container-editorial pt-8">
          <Link
            href="/menu"
            className="group inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft
              size={15}
              className="transition-transform duration-300 group-hover:-translate-x-1"
              aria-hidden="true"
            />
            Back to the menu
          </Link>

          <div className="mt-10 grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
            {/* ---- Image ------------------------------------------------ */}
            <Reveal className="lg:sticky lg:top-32 lg:self-start">
              <div className="grain relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-surface-raised shadow-[var(--shadow-card)]">
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  priority
                  sizes="(min-width: 1024px) 52vw, 92vw"
                  className={item.isSoldOut ? "object-cover grayscale-[0.6] opacity-70" : "object-cover"}
                />
                {item.isSoldOut ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-espresso/85 px-6 py-3 text-sm font-medium uppercase tracking-[0.16em] text-cream backdrop-blur-sm">
                      Sold out tonight
                    </span>
                  </div>
                ) : null}
              </div>
            </Reveal>

            {/* ---- Detail ----------------------------------------------- */}
            <div>
              <Reveal>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/menu#${item.category.toLowerCase()}`}
                    className="eyebrow link-underline"
                  >
                    {CATEGORY_LABELS[item.category]}
                  </Link>
                  {item.isSignature ? (
                    <span className="rounded-full bg-terracotta-soft px-3 py-1 text-[0.625rem] font-medium uppercase tracking-[0.12em] text-accent">
                      Signature
                    </span>
                  ) : null}
                </div>

                <h1 className="mt-5 text-display-xl">{item.name}</h1>

                <p className="mt-6 font-display text-2xl text-accent tabular-nums">
                  {formatPrice(item.priceCents, settings.currency)}
                </p>

                <p className="mt-8 text-lg leading-relaxed text-ink-muted">
                  {item.description}
                </p>
              </Reveal>

              {item.chefNote ? (
                <Reveal index={1} className="mt-10 border-l-2 border-accent/40 pl-6">
                  <p className="eyebrow">From the chef</p>
                  <p className="mt-3 font-display text-lg leading-relaxed italic">
                    {item.chefNote}
                  </p>
                </Reveal>
              ) : null}

              {/* ---- Facts ------------------------------------------- */}
              {item.tags.length > 0 || item.calories ? (
                <Reveal index={2} className="mt-10">
                  <h2 className="eyebrow">Good to know</h2>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <li
                        key={tag}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-xs text-ink-muted"
                      >
                        <Leaf size={12} className="text-olive" strokeWidth={2} aria-hidden="true" />
                        {TAG_LABELS[tag]}
                      </li>
                    ))}
                    {item.calories ? (
                      <li className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-xs text-ink-muted">
                        <Flame size={12} className="text-accent" strokeWidth={2} aria-hidden="true" />
                        {pluralise(item.calories, "calorie")}
                      </li>
                    ) : null}
                  </ul>
                </Reveal>
              ) : null}

              {/* ---- Ingredients ------------------------------------ */}
              {(item.ingredients.length > 0 || item.allergens.length > 0) && (
                <Reveal index={3} className="mt-10 grid gap-8 sm:grid-cols-2">
                  {item.ingredients.length > 0 ? (
                    <div>
                      <h2 className="eyebrow">What is in it</h2>
                      <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                        {item.ingredients.join(", ")}
                      </p>
                    </div>
                  ) : null}

                  {item.allergens.length > 0 ? (
                    <div>
                      <h2 className="eyebrow">Allergens</h2>
                      <ul className="mt-4 space-y-2">
                        {item.allergens.map((allergen) => (
                          <li
                            key={allergen}
                            className="flex items-center gap-2 text-sm text-ink-muted"
                          >
                            <WheatOff size={13} className="shrink-0 text-saffron" aria-hidden="true" />
                            {allergen}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Reveal>
              )}

              {/* ---- Allergery disclaimer ---------------------------- */}
              <Reveal index={4} className="mt-10 rounded-2xl border border-border-subtle bg-surface-raised p-5">
                <p className="text-sm leading-relaxed text-ink-muted">
                  <strong className="font-medium text-ink">Allergies.</strong> Our menu
                  changes weekly and we cook on a shared surface, so if you have a serious
                  allergy please call the kitchen on{" "}
                  <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="link-underline">
                    {settings.phone}
                  </a>{" "}
                  before booking. We would rather talk it through than guess.
                </p>
              </Reveal>

              {/* ---- Actions ------------------------------------------ */}
              <Reveal index={5} className="mt-10 flex flex-wrap items-center gap-3">
                <Link
                  href={`/reserve?partySize=${Math.min(2, settings.maxPartySize)}`}
                  className="btn btn-primary"
                >
                  <CalendarCheck size={16} aria-hidden="true" />
                  Reserve a table
                </Link>
                <FavoriteButton slug={item.slug} initialFavorited={Boolean(favorited)} />
              </Reveal>
            </div>
          </div>
        </div>

        {/* ---- Related ------------------------------------------------- */}
        {related.length > 0 ? (
          <div className="container-editorial mt-28">
            <SectionHeading
              eyebrow="Also on the menu"
              title={item.category === "MAINS" ? "To follow, or instead" : "You might also like"}
              action={
                <Link href="/menu" className="btn btn-secondary group">
                  The full menu
                </Link>
              }
            />
            <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r, i) => (
                <MenuCard key={r.id} item={r} index={i} currency={settings.currency} />
              ))}
            </div>
          </div>
        ) : null}
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </PublicShell>
  );
}
