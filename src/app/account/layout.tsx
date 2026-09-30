/**
 * The account section shell.
 *
 * One guard, one header, two pages. The guard lives here rather than in each
 * page so a new page under `/account` is protected by default — forgetting to
 * add it is the failure mode worth designing against, and a redirect from the
 * layout runs before the page's own data is fetched.
 *
 * A layout cannot read the current pathname on the server, so the sign-in
 * `callbackUrl` points at `/account` regardless of which page sent the guest
 * out. That costs a guest who deep-linked to `/account/favourites` one click
 * after signing in, and buys a guard that cannot be forgotten. `safeRedirect`
 * in `signin/actions.ts` allowlists the value, so this is not a place a request
 * could steer a stranger.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { AccountTabs } from "@/components/account/account-tabs";
import { SignOutButton } from "@/components/account/sign-out-button";
import { PublicShell } from "@/components/layout/public-shell";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/signin?callbackUrl=/account");

  // One count for the tab badge. The pages each need it too, and `cache()` on
  // this promise-free read would be a lie — it is a query, not a function — so
  // it is simply cheap and deduplicated by the layout's single render.
  const favourites = await prisma.favorite.count({ where: { userId: user.id } });

  const firstName = user.name?.trim().split(/\s+/)[0] ?? "there";

  return (
    <PublicShell>
      <div className="container-editorial py-14 md:py-20">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Your account</p>
            <h1 className="mt-3 font-display text-display-lg">Good to see you, {firstName}.</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
              Everything you have booked with us, and every dish you have set aside for next time.
            </p>
          </div>
          <SignOutButton />
        </header>

        <div className="mt-10">
          <AccountTabs favourites={favourites} />
        </div>

        <div className="mt-10">{children}</div>

        {/* A standing invitation rather than a dead end. Someone with an empty
            account has nothing to read here, and the booking flow is the only
            thing that puts something there. */}
        <aside className="mt-16 flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-border-subtle bg-surface-raised/60 px-7 py-6">
          <p className="flex items-start gap-3 text-sm leading-relaxed text-ink-muted">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <span>
              We take bookings thirty days ahead and hold tables back for walk-ins. If the times
              you want are not showing, telephone us — we can usually find something.
            </span>
          </p>
          <Link href="/reserve" className="btn btn-primary btn-sm shrink-0">
            Book a table
          </Link>
        </aside>
      </div>
    </PublicShell>
  );
}
