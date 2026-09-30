"use server";

/**
 * Favourite a dish.
 *
 * A server action rather than an API route: the mutation is triggered by exactly
 * one button and needs no client-side shape, and an action keeps the mutation
 * and the read of the result in one round trip. The booking flow, by contrast,
 * is a multi-step client experience and uses a real API route.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

const toggleSchema = z.object({ slug: z.string().trim().min(1).max(140) });

export type ToggleFavoriteResult =
  | { status: "ok"; favorited: boolean }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export async function toggleFavorite(slug: string): Promise<ToggleFavoriteResult> {
  const user = await currentUser();
  if (!user) return { status: "unauthenticated" };

  const parsed = toggleSchema.safeParse({ slug });
  if (!parsed.success) return { status: "error", message: "That dish could not be found." };

  const item = await prisma.menuItem.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });
  if (!item) return { status: "error", message: "That dish could not be found." };

  // Toggle via delete-then-create inside a transaction. A `deleteMany`/`create`
  // pair on a composite primary key is idempotent, unlike an `upsert` on a
  // relation, and cannot half-apply.
  const existing = await prisma.favorite.findUnique({
    where: { userId_menuItemId: { userId: user.id, menuItemId: item.id } },
    select: { userId: true },
  });

  const favorited = !existing;
  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.favorite.delete({
        where: { userId_menuItemId: { userId: user.id, menuItemId: item.id } },
      });
    } else {
      await tx.favorite.create({ data: { userId: user.id, menuItemId: item.id } });
    }
  });

  // Keeps the favourites page and the dish page's button in step without a
  // manual refresh.
  revalidatePath("/account/favourites");
  revalidatePath(`/menu/${parsed.data.slug}`);

  return { status: "ok", favorited };
}
