"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DURATION, EASE } from "@/lib/motion";
import { cn } from "@/lib/format";

/**
 * Mobile sticky booking bar.
 *
 * Required by the brief and genuinely useful: on a phone the primary call to
 * action should never be more than a thumb away. It appears only after the
 * visitor has scrolled past the hero (where the main CTA already is) and hides
 * again near the footer so it does not cover the last thing they want to read.
 *
 * `env(safe-area-inset-bottom)` keeps it clear of the iOS home indicator.
 */
export function MobileReserveBar() {
  const pathname = usePathname();
  const [scrolledIntoView, setScrolledIntoView] = useState(false);

  // Never on the booking flow itself — a persistent "Reserve" button while
  // booking is a loop. Derived rather than stored, so the bar is correct on the
  // very first paint after a client-side navigation into `/reserve` instead of
  // flashing for one frame before an effect hides it.
  const suppressed = pathname.startsWith("/reserve");

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      // Past the hero, and not so close to the bottom that it would cover
      // footer content a visitor is actively reading.
      const pastHero = y > window.innerHeight * 0.9;
      const nearBottom = y + window.innerHeight > docHeight - 200;
      setScrolledIntoView(pastHero && !nearBottom);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const visible = scrolledIntoView && !suppressed;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface/95 backdrop-blur-md sm:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: DURATION.base, ease: EASE.out }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight">Tables available tonight</p>
              <p className="truncate text-xs text-ink-subtle">From 18:00 · book in under a minute</p>
            </div>
            <Link href="/reserve" className="btn btn-primary btn-sm shrink-0">
              <CalendarCheck size={15} /> Reserve
            </Link>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Back-to-top control. Appears past a full viewport of scrolling.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 1.2);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={cn(
            "fixed bottom-24 right-5 z-40 hidden h-11 w-11 items-center justify-center rounded-full",
            "border border-border-subtle bg-surface/90 text-ink-muted backdrop-blur-md",
            "shadow-[var(--shadow-card)] transition-colors hover:text-ink sm:bottom-8",
          )}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: DURATION.fast, ease: EASE.out }}
          aria-label="Back to top"
        >
          <ArrowUp size={16} />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
