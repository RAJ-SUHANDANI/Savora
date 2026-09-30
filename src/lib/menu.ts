/**
 * Read-side data access for the public site.
 *
 * Kept separate from the route handlers so the same query can serve a server
 * component and an API route without duplication, and so read paths stay free
 * of the more careful write-path concerns in `lib/reservations.ts`.
 */
import type { MenuCategory } from "./constants";
import { prisma } from "./db";

/**
 * Public menu items.
 *
 * Sold-out dishes are still returned on purpose: the menu card renders in a
 * muted state rather than disappearing, because a guest who came for the
 * fried squid should learn it exists and that it sold out, not conclude the
 * restaurant does not serve it.
 */
export async function getMenuItems(options?: {
  category?: MenuCategory;
  includeUnavailable?: boolean;
}) {
  return prisma.menuItem.findMany({
    where: {
      ...(options?.includeUnavailable ? {} : { isAvailable: true }),
      ...(options?.category ? { category: options.category } : {}),
    },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getMenuItemBySlug(slug: string) {
  return prisma.menuItem.findUnique({ where: { slug } });
}

/**
 * Dishes related to the one being viewed: same category first, then anything
 * else, excluding the dish itself. Falls back to signature dishes so the
 * section is never empty.
 */
export async function getRelatedItems(itemId: string, category: MenuCategory, limit = 3) {
  const sameCategory = await prisma.menuItem.findMany({
    where: { id: { not: itemId }, category, isAvailable: true },
    orderBy: [{ isSignature: "desc" }, { sortOrder: "asc" }],
    take: limit,
  });
  if (sameCategory.length >= limit) return sameCategory;

  const filler = await prisma.menuItem.findMany({
    where: {
      id: { notIn: [itemId, ...sameCategory.map((i) => i.id)] },
      isAvailable: true,
    },
    orderBy: { isSignature: "desc" },
    take: limit - sameCategory.length,
  });
  return [...sameCategory, ...filler];
}

export async function getSignatureItems(limit = 6) {
  return prisma.menuItem.findMany({
    where: { isAvailable: true, isSignature: true },
    orderBy: { sortOrder: "asc" },
    take: limit,
  });
}

/** A guest's saved dishes. Returns an empty array for anonymous visitors. */
export async function getFavorites(userId: string | undefined) {
  if (!userId) return [];
  const rows = await prisma.favorite.findMany({
    where: { userId },
    include: { menuItem: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => r.menuItem);
}
