"use client";

/**
 * Save a dish.
 *
 * Optimistic: the heart fills the instant it is pressed and rolls back if the
 * server disagrees. A favourites button that waits on a round trip before
 * acknowledging the tap feels broken, and the rollback path is the only place
 * where a failure is actually visible to the user.
 *
 * The heart animates with a small spring rather than a fade, so a saved dish
 * feels like it was pressed rather than switched.
 */
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/format";
import { toggleFavorite, type ToggleFavoriteResult } from "@/app/menu/actions";

export function FavoriteButton({
  slug,
  initialFavorited = false,
}: {
  slug: string;
  initialFavorited?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // `useOptimistic` so the pressed state shows immediately and reverts
  // automatically when the action resolves or throws.
  const [favorited, setFavorited] = useOptimistic(initialFavorited);

  function onClick() {
    const next = !favorited;
    setFavorited(next);

    startTransition(async () => {
      const result: ToggleFavoriteResult = await toggleFavorite(slug);

      if (result.status === "unauthenticated") {
        // Sending them to sign in and back again is better than a dead button.
        router.push(`/signin?callbackUrl=/menu/${slug}`);
        return;
      }
      if (result.status === "error") {
        return; // `useOptimistic` reverts automatically once the transition ends.
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      // `aria-pressed` is what makes this a toggle to a screen reader; the
      // heartbeat animation alone communicates nothing.
      aria-pressed={favorited}
      aria-label={favorited ? "Remove from saved dishes" : "Save this dish"}
      disabled={pending}
      className={cn(
        "btn btn-secondary group",
        favorited && "border-accent/50 text-accent",
      )}
    >
      <motion.span
        animate={favorited ? { scale: [1, 1.35, 1] } : { scale: 1 }}
        transition={{ duration: 0.45, ease: [0.34, 1.4, 0.64, 1] }}
        className="flex"
      >
        <Heart
          size={16}
          className={cn("transition-colors", favorited && "fill-accent text-accent")}
          aria-hidden="true"
        />
      </motion.span>
      {favorited ? "Saved" : "Save dish"}
    </button>
  );
}
