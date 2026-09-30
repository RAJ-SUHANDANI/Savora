"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Menu,
  X,
  User,
  LayoutDashboard,
  LogOut,
  Sun,
  Moon,
  ChevronDown,
  CalendarCheck,
  Heart,
  LogIn,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/format";
import { navLinks } from "@/lib/site-config";
import { SavoraWordmark } from "@/components/brand/savora-wordmark";
import { useAuth, initials } from "@/components/providers/auth-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { EASE, DURATION } from "@/lib/motion";

/**
 * Sticky site header.
 *
 * Behaviour, in order of importance:
 *
 * 1. **Shrinks on scroll.** Full height and transparent over the hero, then
 *    compresses to 68px and picks up a backdrop blur and a hairline border.
 *    The scroll listener is passive and the state is only set when the
 *    threshold is actually crossed, so scrolling does not cause re-renders.
 *
 * 2. **Solid background on interior pages.** The hero only exists on the home
 *    page; elsewhere a transparent header would float over cream with nothing
 *    behind it, so those routes start in the shrunk, solid state.
 *
 * 3. **It changes when you sign in.** The right-hand cluster is the whole
 *    point: a signed-out visitor gets a "Sign in" link, and a signed-in one gets
 *    an avatar menu in its place. The nav also grows a "My bookings" entry, and
 *    staff get a "Dashboard" shortcut that is deliberately styled unlike
 *    anything else in the header so the back-of-house side of the app is
 *    obvious at a glance. This is all driven by `useAuth()`, which reads
 *    `SessionProvider` — see `signin-form.tsx` for why that provider is
 *    refreshed before the post-sign-in navigation rather than after it.
 *
 * 4. **Accessible menu.** The mobile panel is a real dialog: `aria-expanded` on
 *    the trigger, Escape to close, and focus moved into the panel on open.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAuthenticated, isAdmin, user, isLoading } = useAuth();
  const { theme, toggle, mounted } = useTheme();

  const isHome = pathname === "/";

  /**
   * The nav the visitor is allowed to see.
   *
   * The editorial links are identical either way — signing in should not hide
   * the restaurant. What changes is that the account's own destinations are
   * *added*, because a signed-in visitor reaching "My bookings" should be a
   * single click from anywhere, not something they have to remember the URL for.
   */
  const links = isAuthenticated ? accountNavLinks : navLinks;

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 24;
      // Only re-render when the threshold is crossed, not on every scroll event.
      setScrolled((prev) => (prev === next ? prev : next));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * Close the mobile panel on navigation.
   *
   * `setLastPath` and `setMenuOpen` here are React's documented "adjust state
   * when a prop changes" pattern: the calls sit in the render body, guarded by
   * a comparison, so React re-runs this component immediately and *before*
   * committing — the user never sees the panel on the new page. An effect would
   * render it first and close it on the following pass, which is the
   * cascading-render the lint rule exists to prevent.
   *
   * This is also the only version of the fix that cannot be forgotten. Calling
   * `setMenuOpen(false)` from each of the nine links in the panel means the
   * panel closes exactly as long as nobody adds a tenth link and misses it; the
   * links below still call `close` too, but only so the panel shuts on the tap
   * rather than a render later.
   */
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  // Escape closes the panel.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Prevent the page scrolling behind the open panel.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const solid = scrolled || !isHome;
  const headerHeight = solid ? "h-[68px]" : "h-24";

  // One handler for the mobile panel. Also called from every link inside it, so
  // the panel closes on the tap rather than a render later.
  const close = () => setMenuOpen(false);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        headerHeight,
      )}
      style={{ transitionTimingFunction: `cubic-bezier(${EASE.out.join(",")})` }}
    >
      {/* Background layer: separate element so opacity can cross-fade. */}
      <div
        className={cn(
          "absolute inset-0 border-b backdrop-blur-md transition-opacity duration-500",
          solid
            ? "border-border-subtle bg-surface/85 opacity-100"
            : "border-transparent bg-transparent opacity-0",
        )}
        aria-hidden="true"
      />

      <div className="container-editorial relative flex h-full items-center justify-between gap-6">
        {/* Wordmark: the rosette mark plus the name, as one lockup. */}
        <SavoraWordmark size={34} className="shrink-0" />

        {/* Desktop nav.

            This is `lg:` and not `md:`, and that is a correction rather than a
            preference. At 768px the lockup (156px), this nav (299px) and the
            right cluster (282px) need about 785px of content width; the container
            offers 704px. Nothing shrinks -- the nav links and the buttons are all
            `nowrap` -- so the cluster was pushed to x=816 on a 768px viewport and
            the Reserve button was clipped off the right edge. `lg` is the first
            width where the row genuinely fits. Everything this breakpoint hides
            is still reachable from the mobile panel below, including the staff
            dashboard. */}
        <nav className="hidden items-center gap-9 lg:flex" aria-label="Main">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            // `inline-flex min-h-11` rather than a bare inline link:
            // `link-underline` measures 20px tall on an inline element, which is
            // under the 44px target minimum. Padding the link is invisible,
            // because the underline sits on the text either way.
            return (
              <Link
                key={link.href}
                href={link.href}
                data-active={active}
                className={cn(
                  "link-underline inline-flex min-h-11 items-center text-sm tracking-wide transition-colors duration-300",
                  active ? "text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} mounted={mounted} onToggle={toggle} />

          {/**
           * The sign-in link and the avatar occupy the same slot, and swap as
           * soon as `SessionProvider` reports a session. `isLoading` is kept in
           * the condition deliberately: rendering the "Sign in" link during the
           * provider's own fetch is what makes the header flash the wrong
           * control on every cold load of a signed-in page.
           */}
          {isLoading ? (
            <span className="hidden h-10 w-24 lg:block" aria-hidden="true" />
          ) : isAuthenticated ? (
            <AccountMenu
              name={user?.name}
              email={user?.email}
              isAdmin={isAdmin}
            />
          ) : (
            <Link
              href="/signin"
              className={cn(
                "tap-target gap-1.5 text-sm tracking-wide transition-colors duration-300",
                "text-ink-muted hover:text-ink",
              )}
            >
              <LogIn size={15} aria-hidden="true" className="sm:hidden" />
              Sign in
            </Link>
          )}

          {/* `btn-sm` is 36px, which is under the 44px minimum. The header is
              96px tall and the controls beside it are `h-10`, so there is room
              to give the one primary action the full target. `btn-sm` itself is
              left at 36 because the admin tables use it as a deliberate density
              choice, and changing it there would be a different decision. */}
          <Link
            href="/reserve"
            className="btn btn-primary btn-sm hidden min-h-11 sm:inline-flex"
          >
            Reserve a table
          </Link>

          {/* Staff shortcut. Espresso rather than terracotta so it reads as a
              different application, not another button in the same one. */}
          {isAdmin ? (
            <Link
              href="/admin"
              className={cn(
                "btn btn-sm hidden border border-espresso/25 bg-espresso text-cream transition-colors duration-300",
                "hover:bg-espresso/85 lg:inline-flex",
              )}
            >
              <LayoutDashboard size={14} aria-hidden="true" />
              Dashboard
            </Link>
          ) : null}

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-raised lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      <AnimatePresence>
        {menuOpen ? (
          <>
            <motion.div
              className="fixed inset-0 -z-10 bg-espresso/25 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <motion.nav
              id="mobile-menu"
              aria-label="Mobile"
              className="absolute inset-x-0 top-full border-b border-border-subtle bg-surface px-5 pb-8 pt-4 lg:hidden"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: DURATION.fast, ease: EASE.out }}
            >
              <ul className="flex flex-col">
                {links.map((link, i) => (
                  <motion.li
                    key={link.href}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 + i * 0.05, duration: DURATION.fast, ease: EASE.out }}
                  >
                    <Link
                      href={link.href}
                      onClick={close}
                      className="flex items-center justify-between border-b border-border-subtle py-4 font-display text-2xl"
                    >
                      {link.label}
                      <span className="text-sm text-ink-subtle">0{i + 1}</span>
                    </Link>
                  </motion.li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col gap-3">
                <Link href="/reserve" onClick={close} className="btn btn-primary w-full">
                  Reserve a table
                </Link>
                {isAuthenticated ? (
                  <>
                    {isAdmin ? (
                      <Link href="/admin" onClick={close} className="btn btn-secondary w-full">
                        <LayoutDashboard size={16} /> Staff dashboard
                      </Link>
                    ) : null}
                    <Link href="/account" onClick={close} className="btn btn-secondary w-full">
                      <CalendarCheck size={16} /> My bookings
                    </Link>
                    <Link
                      href="/account/favourites"
                      onClick={close}
                      className="btn btn-secondary w-full"
                    >
                      <Heart size={16} /> Saved dishes
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        void signOut({ callbackUrl: "/" });
                      }}
                      className="btn btn-ghost w-full"
                    >
                      <LogOut size={16} /> Sign out
                    </button>
                  </>
                ) : (
                  <Link href="/signin" onClick={close} className="btn btn-secondary w-full">
                    <LogIn size={16} /> Sign in
                  </Link>
                )}
              </div>
            </motion.nav>
          </>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function ThemeToggle({
  theme,
  mounted,
  onToggle,
}: {
  theme: string;
  mounted: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-300",
        "text-ink-muted hover:bg-surface-raised hover:text-ink",
      )}
      aria-label={mounted ? `Switch to ${theme === "light" ? "dark" : "light"} mode` : "Toggle theme"}
    >
      {/* Both icons are rendered and cross-faded, so the button never changes
          size between states and there is no icon pop. Before `mounted`, we
          show a neutral dot to avoid rendering the wrong icon on hydration. */}
      <span className="relative block h-[18px] w-[18px]">
        <Sun
          size={18}
          className={cn(
            "absolute inset-0 transition-all duration-500",
            mounted && theme === "light" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0",
          )}
        />
        <Moon
          size={18}
          className={cn(
            "absolute inset-0 transition-all duration-500",
            mounted && theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0",
          )}
        />
        {!mounted ? <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-current opacity-40" /> : null}
      </span>
    </button>
  );
}

/**
 * The avatar menu that replaces the "Sign in" link.
 *
 * Visible at every width, unlike the old `hidden md:block` version. That class
 * meant a signed-in visitor on a phone had *no* account control in the header
 * at all — the menu existed only inside the burger panel, so the "sign in button
 * becomes a profile button" behaviour simply did not happen on the half of
 * devices people book dinner on.
 */
function AccountMenu({
  name,
  email,
  isAdmin,
}: {
  name?: string | null;
  email?: string | null;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    // Deferred so the click that opened the menu does not immediately close it.
    const timer = setTimeout(() => window.addEventListener("click", onClick), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
      clearTimeout(timer);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full pl-1 pr-2.5 transition-colors duration-300",
          "hover:bg-surface-raised",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-medium tracking-wide transition-colors",
            "bg-terracotta-soft text-accent",
          )}
        >
          {initials(name, email)}
        </span>
        <span className="hidden max-w-[9rem] truncate text-sm lg:inline">
          {name?.split(" ")[0] ?? "Account"}
        </span>
        <ChevronDown
          size={14}
          className={cn("text-ink-subtle transition-transform duration-300", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            className="absolute right-0 top-12 w-60 overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-[var(--shadow-float)]"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: DURATION.fast, ease: EASE.out }}
          >
            <div className="border-b border-border-subtle px-4 py-3">
              <p className="truncate text-sm font-medium">{name ?? "Guest"}</p>
              {email ? <p className="truncate text-xs text-ink-subtle">{email}</p> : null}
              {isAdmin ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-espresso px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-cream">
                  <LayoutDashboard size={10} aria-hidden="true" /> Staff
                </p>
              ) : null}
            </div>
            <div className="p-1.5">
              <Link
                href="/account"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-surface-raised"
              >
                <CalendarCheck size={15} className="text-ink-subtle" /> My bookings
              </Link>
              <Link
                href="/account/favourites"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-surface-raised"
              >
                <Heart size={15} className="text-ink-subtle" /> Saved dishes
              </Link>
              <Link
                href="/account/profile"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-surface-raised"
              >
                <User size={15} className="text-ink-subtle" /> Profile &amp; details
              </Link>
              {isAdmin ? (
                <>
                  <div className="my-1.5 h-px bg-border-subtle" />
                  <Link
                    href="/admin"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl bg-espresso px-3 py-2 text-sm text-cream transition-colors hover:bg-espresso/90"
                  >
                    <LayoutDashboard size={15} aria-hidden="true" /> Staff dashboard
                  </Link>
                </>
              ) : null}
              <div className="my-1.5 h-px bg-border-subtle" />
              <button
                type="button"
                role="menuitem"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
              >
                <LogOut size={15} className="text-ink-subtle" /> Sign out
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * `navLinks` plus the signed-in visitor's own destinations.
 *
 * Built here rather than in `site-config` because it depends on the session,
 * which is a runtime fact rather than a constant. The account entries are last
 * so the restaurant's own navigation keeps its positions and a habit formed
 * while signed out still lands on the right thing after signing in.
 */
const accountNavLinks = [
  ...navLinks,
  { href: "/account", label: "My bookings" },
] as const;
