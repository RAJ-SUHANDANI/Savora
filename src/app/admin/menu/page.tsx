import type { Metadata } from "next";
import { Eye } from "lucide-react";

import { MenuManager, type Dish } from "@/components/admin/menu-manager";
import { PageHeader } from "@/components/admin/page-header";
import { prisma } from "@/lib/db";
import type { DietaryTag, MenuCategory } from "@/lib/constants";

export const metadata: Metadata = { title: "Menu — Savora" };
export const dynamic = "force-dynamic";

/**
 * The menu editor.
 *
 * The whole list is loaded at once, including the ingredients, allergens and
 * dietary tags that the list itself does not show. That is a deliberate trade:
 * twenty-six dishes is small enough that filtering on the server would be
 * latency for no saving, and loading the whole record means opening the editor
 * for a dish needs no second request and no loading spinner.
 *
 * If the menu ever grows past a couple of hundred dishes this page should switch
 * to a `?category=` query with server-side filtering, because at that size the
 * full read becomes the slow part of the screen rather than a non-event.
 */
export default async function AdminMenuPage() {
  const rows = await prisma.menuItem.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      priceCents: true,
      category: true,
      imageUrl: true,
      tags: true,
      ingredients: true,
      allergens: true,
      calories: true,
      isSignature: true,
      isAvailable: true,
      isSoldOut: true,
      chefNote: true,
      sortOrder: true,
    },
  });

  /**
   * Cast the three free-text columns once, here, rather than in the component.
   *
   * `tags` is a `String[]` that the schema constrains to `DIETARY_TAGS` but
   * cannot enforce in the database, so a value added to the constant later and a
   * row written before it exist at the same time. Narrowing to `DietaryTag[]`
   * makes the label lookup total; the component would otherwise need a lookup
   * with a fallback, and a missing label would render as `undefined` on a dish.
   */
  const dishes: Dish[] = rows.map((row) => ({
    ...row,
    category: row.category as MenuCategory,
    tags: row.tags as DietaryTag[],
  }));

  const soldOut = dishes.filter((d) => d.isSoldOut).length;
  const hidden = dishes.filter((d) => !d.isAvailable).length;

  /**
   * Say what actually needs attention rather than always using the same
   * "two things" phrasing — a screen that reports a problem on every visit
   * teaches staff to stop reading the top of the page.
   */
  const attention: string[] = [];
  if (soldOut > 0) attention.push(`${soldOut} sold out`);
  if (hidden > 0) attention.push(`${hidden} hidden from guests`);

  return (
    <>
      <PageHeader
        eyebrow="Menu"
        title="Dishes"
        description={
          attention.length > 0
            ? `Right now: ${attention.join(", ")}. The toggles on each row take effect on the public menu immediately.`
            : "Everything is live. The toggles on each row take effect on the public menu immediately — use them when the kitchen runs out of something mid-service."
        }
        actions={
          <a href="/menu" target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
            <Eye size={14} aria-hidden="true" />
            See the public menu
          </a>
        }
      />

      <MenuManager dishes={dishes} />
    </>
  );
}
