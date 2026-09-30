"use client";

/**
 * Menu browser.
 *
 * Filtering happens in the browser over the items already sent with the page.
 * That is a deliberate trade: the whole menu is 26 dishes, so a round trip per
 * filter change would add latency and a loading state to an interaction that
 * should feel instant. A restaurant with hundreds of covers per day would
 * instead want this to hit an API route.
 *
 * The filter state lives in the URL (`?category=mains&tag=vegan`) via
 * `useSearchParams`, so a filtered menu is shareable and the back button steps
 * back through filter changes. That is the behaviour people expect from
 * something that looks like navigation.
 */
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CATEGORY_LABELS,
  MENU_CATEGORIES,
  MENU_FILTER_TAGS,
  TAG_LABELS,
  type DietaryTag,
  type MenuCategory,
} from "@/lib/constants";
import { cn } from "@/lib/format";
import { DURATION, EASE } from "@/lib/motion";
import { MenuCard, type MenuCardData } from "@/components/menu/menu-card";
import { EmptySearch } from "@/components/ui/empty-state";

type Props = {
  items: MenuCardData[];
  currency: string;
  /** Every dietary tag present in the menu, so the filter row never offers a dead end. */
  availableTags: DietaryTag[];
};

export function MenuExplorer({ items, currency, availableTags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const activeCategory = params.get("category") as MenuCategory | null;
  const activeTags = useMemo(
    () => params.getAll("tag").filter((t): t is DietaryTag => MENU_FILTER_TAGS.includes(t as DietaryTag)),
    [params],
  );
  const query = params.get("q") ?? "";

  /**
   * `replace: true` while typing so the back button does not become a history
   * of every keystroke, but `push` for filter chips so those *are* back-navigable.
   */
  const setParams = (
    mutate: (next: URLSearchParams) => void,
    opts?: { replace?: boolean },
  ) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    const qs = next.toString();
    router[opts?.replace ? "replace" : "push"](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const toggleTag = (tag: DietaryTag) =>
    setParams((next) => {
      const current = next.getAll("tag");
      next.delete("tag");
      const updated = current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag];
      for (const t of updated) next.append("tag", t);
    });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeCategory && item.category !== activeCategory) return false;
      // Tags are AND-ed: choosing "vegan" and "gluten free" should mean a dish
      // that is both, not the union, which is what a guest filtering an allergy
      // actually needs.
      if (activeTags.length && !activeTags.every((t) => item.tags.includes(t))) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [items, activeCategory, activeTags, query]);

  const hasFilters = Boolean(activeCategory) || activeTags.length > 0 || Boolean(query);

  const clearAll = () => router.push(pathname, { scroll: false });

  return (
    <div>
      {/* ---- Controls ------------------------------------------------- */}
      <div className="sticky top-24 z-30 -mx-5 border-y border-border-subtle bg-surface/85 px-5 py-4 backdrop-blur-md sm:-mx-8 sm:px-8 xl:-mx-16 xl:px-16">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Category tabs. `role="tablist"` semantics with buttons rather than
                links, because these filter in place and do not change the route. */}
            <div
              role="tablist"
              aria-label="Menu category"
              className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <FilterChip
                active={!activeCategory}
                onClick={() =>
                  setParams((next) => {
                    next.delete("category");
                  })
                }
              >
                All
              </FilterChip>
              {MENU_CATEGORIES.map((category) => (
                <FilterChip
                  key={category}
                  active={activeCategory === category}
                  onClick={() =>
                    setParams((next) => {
                      next.set("category", category);
                    })
                  }
                >
                  {CATEGORY_LABELS[category]}
                </FilterChip>
              ))}
            </div>

            <div className="relative sm:w-64">
              <Search
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) =>
                  setParams(
                    (next) => {
                      if (e.target.value) next.set("q", e.target.value);
                      else next.delete("q");
                    },
                    { replace: true },
                  )
                }
                placeholder="Search the menu"
                aria-label="Search the menu"
                className="field py-2.5 pl-10 pr-9 text-sm"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() =>
                    setParams(
                      (next) => next.delete("q"),
                      { replace: true },
                    )
                  }
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-subtle transition-colors hover:text-ink"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>

          {availableTags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 pr-1 text-xs text-ink-subtle">
                <SlidersHorizontal size={13} aria-hidden="true" />
                Dietary
              </span>
              {MENU_FILTER_TAGS.filter((t) => availableTags.includes(t)).map((tag) => {
                const active = activeTags.includes(tag);
                // `py-1` on a `text-xs` pill is 26px tall, which is a hard hit on a
                // phone. `min-h-11` puts the target at 44px without changing the
                // type size or the gap between pills.
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-medium transition-all duration-200",
                      active
                        ? "border-accent bg-accent text-accent-contrast"
                        : "border-border-strong text-ink-muted hover:border-accent/50 hover:text-ink",
                    )}
                  >
                    {TAG_LABELS[tag]}
                  </button>
                );
              })}

              {hasFilters ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="ml-1 inline-flex items-center gap-1 text-xs text-ink-subtle underline underline-offset-4 transition-colors hover:text-ink"
                >
                  <X size={12} aria-hidden="true" />
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ---- Results --------------------------------------------------- */}
      <p className="mt-8 text-sm text-ink-subtle" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "dish" : "dishes"}
        {hasFilters ? " matching" : ""}
      </p>

      {filtered.length === 0 ? (
        <EmptySearch
          title="Nothing matches that"
          description="Try removing a dietary filter, or search for a dish you have in mind."
          action={{ href: "/contact", label: "Ask the kitchen" }}
          secondaryAction={hasFilters ? { href: pathname, label: "Clear filters" } : undefined}
        />
      ) : (
        <motion.div layout className="mt-10 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((item, i) => (
              <motion.div
                key={item.slug}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: DURATION.fast, ease: EASE.out, delay: Math.min(i * 0.03, 0.25) }}
              >
                <MenuCard item={item} index={i} currency={currency} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
        active
          ? "bg-ink text-surface shadow-[var(--shadow-subtle)]"
          : "text-ink-muted hover:bg-surface-raised hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
