import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PageTransition } from "@/components/layout/page-transition";
import { BackToTop, MobileReserveBar } from "@/components/layout/sticky-cta";

/**
 * Public site chrome.
 *
 * Split from the admin shell so staff tooling can use a dense, fixed sidebar
 * layout while guests get the editorial one. The header is fixed rather than
 * sticky so page transitions can cross-fade without the nav jumping.
 *
 * `pt-24` clears the full-height header that exists over the hero; the header
 * itself shrinks on scroll, so this is the worst case, not the common one.
 *
 * ## No bottom padding for the booking bar, and why that is right
 *
 * `MobileReserveBar` is `position: fixed`, 61px tall, and painted over whatever
 * sits at the bottom of the viewport. That looks like a bug and was measured as
 * one: a probe reported it covering the opening-hours table on /about and the
 * footer fine print on /newsletter. Reserving 61px of document padding was
 * tried and reverted, because the bar's own scroll gate already handles the case
 * that actually matters — it hides within 200px of the bottom of the document, so
 * the last line of every page can always be scrolled clear of it.
 *
 * Mid-page, the bar covering the bottom of the viewport is what a sticky booking
 * bar *is*. The reader scrolls and the text moves; there is no state in which
 * text is permanently unreachable. Adding permanent padding for it would just
 * leave a 72px gap above the footer on every phone, which looks like a mistake
 * rather than a fix.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-5 focus:py-2.5 focus:text-sm focus:text-accent-contrast"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="pt-24">
        <PageTransition>{children}</PageTransition>
      </main>
      <SiteFooter />
      <MobileReserveBar />
      <BackToTop />
    </>
  );
}
