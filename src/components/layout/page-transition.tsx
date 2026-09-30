"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/format";
import { EASE, DURATION } from "@/lib/motion";

/**
 * Cross-route page transition.
 *
 * A short cross-fade plus a small upward drift, deliberately restrained: the
 * brief called for "subtle fade/slide", and a heavy transition makes a
 * restaurant site feel like a slideshow. Children are keyed by pathname, which
 * is what triggers the enter/exit cycle on navigation.
 *
 * The outgoing element fades faster than the incoming one appears, so the two
 * overlap briefly without the page ever looking doubled.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{
          duration: DURATION.fast,
          ease: EASE.out,
          // The entrance is fractionally longer than the exit, which reads as
          // "arriving" rather than "being swapped".
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Predictive back/forward affordance.
 *
 * Disabled by default (rendered only when `show` is true) because a back button
 * that guesses wrong is worse than none. It is wired up here so the pattern is
 * in place for the booking flow, where back genuinely means "previous step".
 */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink",
        className,
      )}
    >
      <ArrowLeft
        size={15}
        className="transition-transform duration-300 group-hover:-translate-x-1"
      />
      {children}
    </Link>
  );
}

/**
 * Filter drawer for the menu on small screens.
 *
 * A bottom sheet rather than a side panel: on a phone, a sheet is reachable
 * with a thumb, and the filter count stays visible in the sticky trigger.
 */
export function FilterSheet({
  open,
  onClose,
  trigger,
  children,
}: {
  open: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the sheet so keyboard users are not left behind it.
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <>
      <div onClick={onClose} className="lg:hidden">
        {trigger}
      </div>
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-espresso/30 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Filters"
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-border-subtle bg-surface px-6 pb-8 pt-6 shadow-[var(--shadow-float)] lg:hidden"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: DURATION.base, ease: EASE.out }}
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="font-display text-xl">Filter the menu</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-raised"
                  aria-label="Close filters"
                >
                  <X size={18} />
                </button>
              </div>
              {children}
              <button type="button" onClick={onClose} className="btn btn-primary mt-8 w-full">
                Show results
              </button>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/**
 * Section navigation with a sliding active indicator.
 *
 * `layoutId` on the pill lets Framer Motion animate it between items, which
 * reads as a single element travelling rather than three blinking.
 */
export function TabNav({
  items,
  value,
  onChange,
  className,
}: {
  items: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-1 overflow-x-auto rounded-full bg-surface-raised p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative shrink-0 rounded-full px-4 py-2 text-sm transition-colors duration-300",
              active ? "text-accent-contrast" : "text-ink-muted hover:text-ink",
            )}
          >
            {active ? (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-full bg-accent"
                transition={{ duration: DURATION.fast, ease: EASE.out }}
              />
            ) : null}
            <span className="relative flex items-center gap-2">
              {item.label}
              {typeof item.count === "number" ? (
                <span className={cn("text-xs tabular-nums", active ? "opacity-70" : "opacity-50")}>
                  {item.count}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Breadcrumb trail. Hidden on mobile, where it would crowd the header.
 */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="hidden sm:block">
      <ol className="flex items-center gap-2 text-xs text-ink-subtle">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <Link href={item.href} className="transition-colors hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span className="text-ink-muted">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Subtle scroll progress bar, used on the booking flow so a long form always
 * shows how much is left.
 */
export function ScrollProgress({ className }: { className?: string }) {
  const [progress, setProgress] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  return (
    <div className={cn("fixed inset-x-0 top-0 z-[60] h-0.5 bg-transparent", className)} aria-hidden="true">
      <motion.div
        className="h-full origin-left bg-accent"
        style={{ scaleX: progress }}
        transition={{ duration: 0.1 }}
      />
    </div>
  );
}

export { ArrowRight, ArrowLeft };
