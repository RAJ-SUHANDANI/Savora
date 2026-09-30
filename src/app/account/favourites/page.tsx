/**
 * Saved dishes.
 *
 * The favourites list is the one place on the site that is a shopping list
 * rather than an editorial page, so it reuses `MenuCard` rather than inventing
 * a second card: a dish the guest saved on the landing page looks exactly like
 * the one they saved here, which is the whole point of `MenuCard` existing as
 * a single component.
 *
 * The sort is deliberate. `MenuItem.createdAt` descending would put the newest
 * additions first, which is right for a restaurant that changes its menu most
 * weeks and wrong for a guest who saved four things last month and wants to
 * find them again. Saved dishes are sorted by *when the guest saved them*,
 * because that is the ordering the guest themselves created.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { MenuCard, type MenuCardData } from "@/components/menu/menu-card";
import { EmptyFavourites } from "@/components/ui/empty-state";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { pluralise } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved dishes",
  description: "The dishes you have set aside for your next visit.",
  robots: { index: false, follow: false },
};

export default async function FavouritesPage() {
  const user = await currentUser();
  if (!user) redirect("/signin?callbackUrl=/account/favourites");

  const settings = await getSettings();

  // `createdAt` on the join row, ordered through the relation. Prisma sorts by
  // a relation's field without needing a join in the SQL, and the composite
  // primary key on (userId, menuItemId) already narrows the scan to one user.
  const saved = await prisma.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      menuItem: {
        select: {
          slug: true,
          name: true,
          description: true,
          priceCents: true,
          category: true,
          imageUrl: true,
          tags: true,
          isSignature: true,
          isSoldOut: true,
        },
      },
    },
  });

  if (saved.length === 0) {
    return (
      <EmptyFavourites
        title="Nothing saved yet"
        description="Tap the heart on any dish and it will wait for you here. It is the quickest way to plan a table — show the list to whoever you are dining with, or just order from it."
        action={{ href: "/menu", label: "Browse the menu" }}
        secondaryAction={{ href: "/reserve", label: "Book a table" }}
      />
    );
  }

  const items: MenuCardData[] = saved.map((f) => ({
    slug: f.menuItem.slug,
    name: f.menuItem.name,
    description: f.menuItem.description,
    priceCents: f.menuItem.priceCents,
    category: f.menuItem.category as MenuCardData["category"],
    imageUrl: f.menuItem.imageUrl,
    tags: f.menuItem.tags as MenuCardData["tags"],
    isSignature: f.menuItem.isSignature,
    isSoldOut: f.menuItem.isSoldOut,
  }));

  const soldOut = items.filter((i) => i.isSoldOut).length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-display text-2xl md:text-3xl">Your list</h2>
        <p className="text-sm text-ink-muted">
          {pluralise(items.length, "dish", "dishes")}
          {soldOut > 0 ? ` · ${soldOut} off the menu today` : ""}
        </p>
      </div>

      {/*
        A sold-out dish keeps its place on the list. Taking it away would mean
        the guest silently loses a decision they made, and they can still read
        what it was — `MenuCard` greys it and says so.
      */}
      <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <MenuCard key={item.slug} item={item} currency={settings.currency} index={i} />
        ))}
      </div>

      <p className="mt-12 text-sm leading-relaxed text-ink-muted">
        Prices and availability move with the market.{" "}
        <Link href="/reserve" className="link-underline text-accent">
          Book a table
        </Link>{" "}
        and we will do our best to have all of it in front of you at once.
      </p>
    </div>
  );
}
