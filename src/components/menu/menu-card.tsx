/**
 * Menu card.
 *
 * One component serves the landing page's featured strip, the full menu grid
 * and the "you might also like" rail on a dish page, so the dish is always
 * represented the same way. That consistency is the point: a guest who learns
 * what a card looks like on the landing page does not have to re-learn it on
 * the menu.
 *
 * The card is a server component. It has no interactivity beyond the link and
 * the CSS hover, which keeps it out of the client bundle entirely.
 */
import Image from "next/image";
import Link from "next/link";
import { Leaf } from "lucide-react";
import { CATEGORY_LABELS, TAG_LABELS, type DietaryTag } from "@/lib/constants";
import { cn, formatPrice } from "@/lib/format";
import { Reveal } from "@/components/ui/reveal";

/** The subset of a MenuItem this card needs. Keeps it usable from a projection. */
export type MenuCardData = {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  category: keyof typeof CATEGORY_LABELS;
  imageUrl: string;
  tags: DietaryTag[];
  isSignature: boolean;
  isSoldOut: boolean;
};

export function MenuCard({
  item,
  currency = "GBP",
  index = 0,
  className,
  showCategory = true,
}: {
  item: MenuCardData;
  currency?: string;
  /** Position in a grid, used only for the reveal stagger. */
  index?: number;
  className?: string;
  showCategory?: boolean;
}) {
  const unavailable = item.isSoldOut;
  // One tag is enough on a card. A row of five badges turns a dish into a
  // specification sheet, and the detail page carries the full list.
  const leadTag = item.tags[0];

  return (
    <Reveal as="article" index={index} className={cn("group", className)}>
      <Link
        href={`/menu/${item.slug}`}
        className="flex h-full flex-col focus-visible:outline-offset-8"
        // Sold-out dishes stay clickable on purpose — a guest who came for the
        // fried squid should find it and learn it has gone, not conclude the
        // restaurant does not serve it.
        aria-label={
          unavailable ? `${item.name}, sold out` : `${item.name}, ${formatPrice(item.priceCents, currency)}`
        }
      >
        <div
          className={cn(
            "relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface-raised",
            !unavailable && "transition-transform duration-700 ease-[var(--ease-out-expo)]",
          )}
        >
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
            className={cn(
              "object-cover transition-all duration-700 ease-[var(--ease-out-expo)]",
              unavailable ? "grayscale-[0.7] opacity-60" : "group-hover:scale-[1.06]",
            )}
          />

          {unavailable ? (
            <span className="absolute left-3 top-3 rounded-full bg-espresso/85 px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-cream backdrop-blur-sm">
              Sold out
            </span>
          ) : item.isSignature ? (
            <span className="absolute left-3 top-3 rounded-full bg-accent px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-accent-contrast">
              Signature
            </span>
          ) : null}

          {leadTag && !unavailable ? (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-cream/90 px-2.5 py-1 text-[0.6875rem] font-medium text-bark backdrop-blur-sm">
              <Leaf size={11} strokeWidth={2} aria-hidden="true" />
              {TAG_LABELS[leadTag]}
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col pt-5">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="font-display text-xl leading-snug">{item.name}</h3>
            <span className="shrink-0 font-display text-lg text-accent tabular-nums">
              {formatPrice(item.priceCents, currency)}
            </span>
          </div>

          {showCategory ? (
            <p className="eyebrow mt-2">{CATEGORY_LABELS[item.category]}</p>
          ) : null}

          <p
            className={cn(
              "mt-3 line-clamp-2 text-sm leading-relaxed text-ink-muted",
              unavailable && "line-through decoration-ink-subtle/50",
            )}
          >
            {item.description}
          </p>
        </div>
      </Link>
    </Reveal>
  );
}

/**
 * Compact horizontal variant used in rails and on the dish page.
 * Keeps the image small so several fit on a line without becoming thumbnails.
 */
export function MenuCardCompact({
  item,
  currency = "GBP",
  index = 0,
}: {
  item: MenuCardData;
  currency?: string;
  index?: number;
}) {
  return (
    <Reveal index={index}>
      <Link href={`/menu/${item.slug}`} className="group flex gap-5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-raised">
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="96px"
            className={cn(
              "object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-105",
              item.isSoldOut && "grayscale-[0.7] opacity-60",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="truncate font-display text-lg">{item.name}</h3>
            <span className="shrink-0 text-sm text-accent tabular-nums">
              {formatPrice(item.priceCents, currency)}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">
            {item.description}
          </p>
        </div>
      </Link>
    </Reveal>
  );
}
