"use client";

/**
 * The dashboard's top bar.
 *
 * Its real job is orientation. When someone lands on a section of a tool for
 * the first time, the two things they need are *where am I* and *what am I
 * allowed to do here*, and the answer to the second was nowhere on the page.
 * So the bar names the current section and states, in one sentence, what it is
 * for.
 *
 * A client component because the current section comes from `usePathname`. That
 * is the one thing a layout cannot know: layouts do not re-render on navigation
 * between their children, so a server-rendered title would be correct on arrival
 * and wrong forever after. `ADMIN_SECTIONS` supplies the copy, so the sidebar,
 * the rail and this bar can never describe the same section differently.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { SignOutButton } from "@/components/account/sign-out-button";
import { sectionFor } from "@/lib/admin-sections";
import { cn } from "@/lib/format";

export function AdminTopBar({ userName, isOwner }: { userName: string; isOwner: boolean }) {
  const pathname = usePathname();
  const section = sectionFor(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-surface/90 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 px-5 py-4 lg:px-8 lg:py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-xl leading-tight lg:text-2xl">{section.label}</h1>
            {isOwner ? (
              <span className="rounded-full bg-espresso px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-cream">
                Owner
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {section.description}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <p className="hidden text-sm text-ink-muted sm:block">
            Signed in as <span className="text-ink">{userName}</span>
          </p>
          <Link
            href="/"
            className={cn(
              "inline-flex items-center gap-1.5 text-xs text-ink-subtle transition-colors hover:text-ink",
            )}
          >
            <ExternalLink size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Public site</span>
          </Link>
          <SignOutButton className="btn btn-ghost btn-sm" />
        </div>
      </div>
    </header>
  );
}

/**
 * Shown on the overview only, and only as a link back: after clicking through
 * to a section, its own top bar already explains it. Rendered as a sibling
 * rather than a prop of `AdminTopBar` so the bar stays a pure "you are here".
 */
export function BackToOverviewLink() {
  return (
    <Link
      href="/admin"
      className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Overview
    </Link>
  );
}
