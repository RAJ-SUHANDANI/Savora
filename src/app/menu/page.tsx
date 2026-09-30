/**
 * The menu.
 *
 * Everything is sent to the browser in one payload and filtered client-side (see
 * `menu-explorer.tsx` for why). The server still owns the initial render, so the
 * page is fully readable and indexable before any JavaScript runs.
 *
 * Category sections are rendered as anchors above the explorer so a guest can
 * jump straight to desserts without scrolling past twelve starters, and each
 * anchor is a real link — deep-linkable and keyboard-navigable.
 */
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { PublicShell } from "@/components/layout/public-shell";
import { MenuExplorer } from "@/components/menu/menu-explorer";
import { Lede, SectionHeading } from "@/components/site/section-heading";
import { EmptyMenu } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CATEGORY_LABELS, CATEGORY_TAGLINES, MENU_CATEGORIES, type DietaryTag } from "@/lib/constants";
import { getMenuItems } from "@/lib/menu";
import { getSettings } from "@/lib/settings";
import { pluralise } from "@/lib/format";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Menu",
  description:
    "A short, seasonal Mediterranean menu. It is written after the growers and fishermen phone, so it changes when they tell us to.",
  alternates: { canonical: "/menu" },
};

export default async function MenuPage() {
  const [items, settings] = await Promise.all([
    // Sold-out dishes are included: the card renders in a muted state rather
    // than the dish silently disappearing from the menu.
    getMenuItems({ includeUnavailable: true }),
    getSettings(),
  ]);

  /**
   * Only offer a dietary filter that at least one dish satisfies. A filter that
   * can only ever return an empty page is worse than no filter.
   */
  const availableTags = [...new Set(items.flatMap((i) => i.tags))] as DietaryTag[];

  const signatureCount = items.filter((i) => i.isSignature).length;

  return (
    <PublicShell>
      {/* ---- Page header ---------------------------------------------- */}
      <header className="border-b border-border-subtle pb-14 pt-10 md:pb-20 md:pt-16">
        <div className="container-editorial">
          <p className="eyebrow">The kitchen</p>
          <h1 className="mt-5 max-w-4xl text-display-xl">
            Written after the market, not before it.
          </h1>
          <Lede className="mt-7 max-w-2xl">
            There is no fixed à la carte. Marcus at Hobbs Farm brings us whatever the
            field decided to do that week and Rosa lands the fish on Thursday
            mornings — the menu is written after both phone calls, which is why a
            dish can appear on Tuesday and be gone by Saturday.
          </Lede>

          <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-ink-muted">
            <p>
              <strong className="font-medium text-ink">{items.length}</strong>{" "}
              {items.length === 1 ? "dish" : "dishes"} on tonight
            </p>
            {signatureCount > 0 ? (
              <p>
                <strong className="font-medium text-ink">{signatureCount}</strong> of them
                are the ones we would not change
              </p>
            ) : null}
            <Link href="/reserve" className="link-underline tap-target text-accent">
              Reserve a table
            </Link>
          </div>
        </div>
      </header>

      {/* ---- Category jump -------------------------------------------- */}
      <nav aria-label="Menu sections" className="border-b border-border-subtle bg-surface-raised">
        <div className="container-editorial">
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {MENU_CATEGORIES.map((category) => {
              const count = items.filter((i) => i.category === category).length;
              if (count === 0) return null;
              return (
                <li key={category} className="shrink-0">
                  <a
                    href={`#${category.toLowerCase()}`}
                    className="group flex items-baseline gap-2 rounded-full px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                  >
                    {CATEGORY_LABELS[category]}
                    <span className="text-xs text-ink-subtle tabular-nums">{count}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* ---- Menu ------------------------------------------------------- */}
      <section className="py-14 md:py-20">
        <div className="container-editorial">
          {items.length === 0 ? (
            <EmptyMenu
              title="The menu is being rewritten"
              description="Our kitchen writes the menu each morning once the deliveries land. Please check back shortly, or call us and we will read it to you."
              action={{ href: "/contact", label: "Call the restaurant" }}
            />
          ) : (
            <>
              {/* Category sections first, so the page reads top-to-bottom like a
                  printed menu even before a guest touches a filter. */}
              <div className="space-y-20">
                {MENU_CATEGORIES.map((category) => {
                  const inCategory = items.filter((i) => i.category === category);
                  if (inCategory.length === 0) return null;
                  return (
                    <div key={category} id={category.toLowerCase()} className="scroll-mt-40">
                      <SectionHeading
                        eyebrow={pluralise(inCategory.length, "dish", "dishes")}
                        title={CATEGORY_LABELS[category]}
                        lede={CATEGORY_TAGLINES[category]}
                        rule={false}
                      />
                      <ul className="mt-10 divide-y divide-border-subtle border-y border-border-subtle">
                        {inCategory.map((item) => (
                          <li key={item.id}>
                            <Link
                              href={`/menu/${item.slug}`}
                              className="group flex items-baseline justify-between gap-6 py-5 transition-colors hover:bg-surface-raised"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                  <h3 className="font-display text-xl leading-snug transition-colors group-hover:text-accent">
                                    {item.name}
                                  </h3>
                                  {item.isSignature ? (
                                    <span className="rounded-full bg-terracotta-soft px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-[0.12em] text-accent">
                                      Signature
                                    </span>
                                  ) : null}
                                  {item.isSoldOut ? (
                                    <span className="text-[0.6875rem] uppercase tracking-[0.12em] text-ink-subtle">
                                      Sold out
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1.5 line-clamp-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
                                  {item.description}
                                </p>
                              </div>
                              <span className="shrink-0 font-display text-lg text-accent tabular-nums">
                                £{(item.priceCents / 100).toFixed(2)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* ---- Filterable grid -------------------------------------- */}
              <div className="mt-24 border-t border-border-subtle pt-16">
                <h2 className="text-display-md">Find something specific</h2>
                <p className="mt-4 max-w-xl leading-relaxed text-ink-muted">
                  Filter by course, or narrow by dietary need. Choosing more than one
                  dietary filter looks for dishes that satisfy all of them.
                </p>

                <div className="mt-10">
                  {/* `useSearchParams` needs a Suspense boundary during static
                      rendering, otherwise the whole page opts out of prerendering. */}
                  <Suspense fallback={<PageSkeleton />}>
                    <MenuExplorer
                      items={items.map((i) => ({
                        slug: i.slug,
                        name: i.name,
                        description: i.description,
                        priceCents: i.priceCents,
                        category: i.category,
                        imageUrl: i.imageUrl,
                        tags: i.tags,
                        isSignature: i.isSignature,
                        isSoldOut: i.isSoldOut,
                      }))}
                      currency={settings.currency}
                      availableTags={availableTags}
                    />
                  </Suspense>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </PublicShell>
  );
}
