"use client";

/**
 * Admin navigation.
 *
 * ## Why this looks nothing like the public site
 *
 * The restaurant's front end is an editorial page: warm cream, Fraunces
 * display type, generous margins, a transparent header over a photograph. All of
 * that is correct for a guest deciding where to eat, and all of it is wrong for
 * someone on their feet during service who needs to find "the 19:00 for four" in
 * under a second.
 *
 * So the dashboard is built as software instead:
 *
 *   * **A dark sidebar.** Espresso with cream text, permanently visible on a
 *     desktop, and the one element on the page that is not the light cream
 *     content surface. It reads as chrome rather than content, and it makes an
 *     accidental screenshot of a booking list obviously a screenshot of the
 *     staff tool rather than of the restaurant.
 *   * **Dense type.** 14px labels, tight leading, a 10px uppercase section
 *     header — the scale of a booking system, not of a menu.
 *   * **A different wordmark treatment.** The site's serif "Savora" is kept,
 *     because staff should recognise it, but it sits small and quiet with a
 *     "Dashboard" label above it, the way an application names its own scope.
 *
 * ## Why one list
 *
 * `ADMIN_SECTIONS` in `@/lib/admin-sections` is the single source. The sidebar,
 * the mobile rail and the top bar all read it, which is the only way to
 * guarantee that a new section cannot appear in one of them and be missing from
 * the other two.
 *
 * ## The two layouts
 *
 * On a phone a fixed 256px column would eat the whole first screen, so the same
 * items become a horizontally scrollable rail under a compact bar. Same data,
 * two presentations — not two lists.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ExternalLink,
  LayoutDashboard,
  Settings,
  Soup,
  Table2,
  Users,
  type LucideIcon,
} from "lucide-react";

import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import { cn } from "@/lib/format";
import { SavoraMark } from "@/components/brand/savora-mark";

/** Keyed by the `icon` field in the registry, so the two lists cannot drift. */
const ICONS: Record<(typeof ADMIN_SECTIONS)[number]["icon"], LucideIcon> = {
  overview: LayoutDashboard,
  reservations: CalendarDays,
  menu: Soup,
  tables: Table2,
  customers: Users,
  settings: Settings,
};

export function AdminNav({ restaurantName }: { restaurantName: string }) {
  const pathname = usePathname();

  return (
    <>
      {/* ---- Phone: a dark bar carrying the wordmark, then the scrolling rail ---- */}
      <div className="sticky top-0 z-30 bg-espresso text-cream lg:hidden">
        <div className="flex items-center justify-between px-5 pt-3.5 pb-2">
          <p className="flex items-center gap-2.5">
            <SavoraMark size={26} className="shrink-0" />
            <span className="font-display text-lg leading-none text-cream">
              {restaurantName}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-cream/55">
              Staff
            </span>
          </p>
        </div>
        <nav aria-label="Dashboard sections" className="px-5 pb-2.5">
          <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ADMIN_SECTIONS.map((section) => {
              const active = isActive(pathname, section.href);
              const Icon = ICONS[section.icon];
              return (
                <li key={section.href} className="shrink-0">
                  <Link
                    href={section.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-cream text-espresso"
                        : "bg-cream/10 text-cream/75 hover:bg-cream/18",
                    )}
                  >
                    <Icon size={13} aria-hidden="true" />
                    {section.short}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* ---- Desktop: a fixed dark column ---- */}
      <nav
        aria-label="Dashboard sections"
        className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-espresso px-4 py-7 text-cream lg:flex"
      >
        <Link href="/admin" className="mb-8 flex items-center gap-3 px-2">
          <SavoraMark size={34} className="shrink-0" />
          <span className="min-w-0">
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-cream/50">
              Dashboard
            </span>
            <span className="mt-1 block truncate font-display text-lg leading-tight text-cream">
              {restaurantName}
            </span>
          </span>
        </Link>

        <ul className="flex flex-1 flex-col gap-1">
          {ADMIN_SECTIONS.map((section) => {
            const active = isActive(pathname, section.href);
            const Icon = ICONS[section.icon];
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-cream text-espresso"
                      : "text-cream/65 hover:bg-cream/10 hover:text-cream",
                  )}
                >
                  <Icon size={17} aria-hidden="true" className="shrink-0" />
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <Link
          href="/"
          className="mt-6 flex items-center gap-2 border-t border-cream/15 px-2 pt-5 text-xs text-cream/55 transition-colors hover:text-cream"
        >
          <ExternalLink size={13} aria-hidden="true" />
          View the public site
        </Link>
      </nav>
    </>
  );
}

/**
 * `/admin` must match exactly, not as a prefix — otherwise the Overview link
 * stays lit on every page underneath it.
 */
function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}
