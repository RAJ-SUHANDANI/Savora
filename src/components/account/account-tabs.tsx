"use client";

/**
 * Account tabs.
 *
 * The active tab is derived from `usePathname` rather than held in state. The
 * account is a small set of pages and nothing in it reorders the tabs, so there
 * is nothing for state to do — a `useState` here would be a second source of
 * truth that could disagree with the URL after a back/forward navigation, and
 * the URL is the one that has to be right.
 *
 * The `data-active` attribute is what `.link-underline::after` keys off in
 * `globals.css`, so the underline animates in through CSS rather than a
 * framer-motion variant per tab.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarHeart, Heart, UserRound } from "lucide-react";

import { cn } from "@/lib/format";

const TABS = [
  { href: "/account", label: "My bookings", icon: CalendarHeart },
  { href: "/account/favourites", label: "Saved dishes", icon: Heart },
  { href: "/account/profile", label: "Your details", icon: UserRound },
] as const;

export function AccountTabs({ favourites }: { favourites: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Account sections" className="border-b border-border-subtle">
      <ul className="-mb-px flex gap-6 overflow-x-auto sm:gap-8">
        {TABS.map(({ href, label, icon: Icon }) => {
          // Exact match for the index, prefix match for the nested page, so
          // "/account" does not light up while standing on "/account/favourites".
          const active = href === "/account" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                data-active={active}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "link-underline flex items-center gap-2 border-b-2 pb-4 text-sm font-medium transition-colors",
                  active
                    ? "border-accent text-accent"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
                {href === "/account/favourites" && favourites > 0 ? (
                  <span className="rounded-full bg-accent/12 px-2 py-0.5 text-xs tabular-nums text-accent">
                    {favourites}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
