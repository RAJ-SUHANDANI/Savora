import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/admin-nav";
import { AdminTopBar } from "@/components/admin/top-bar";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

/**
 * The staff dashboard shell.
 *
 * Authorisation lives here, in the layout, for the same reason it does in
 * `/account`: a new page added under `/admin` is protected the moment it is
 * created, and a page that forgot its own guard is the failure mode worth
 * designing against.
 *
 * Two different rejections, on purpose. A signed-out visitor is sent to sign in
 * and returned here afterwards; a signed-in *customer* is sent to their account
 * rather than to a sign-in page they have already passed through. Sending a
 * logged-in customer to `/signin` looks like a loop and tells them nothing.
 *
 * `requireAdmin()` throws, which is right inside a server action but wrong in a
 * layout — there is nothing to catch it with, and an error boundary would show
 * a stack trace to a guest. So the role is read directly and turned into a
 * redirect. Every action under `/admin/actions.ts` still re-checks, because a
 * server action is a public endpoint and the layout guard is not a
 * substitute for it.
 *
 * The shell is deliberately not the public site. See `admin-nav.tsx` for why
 * the dashboard is built to look like software rather than like a restaurant.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  // Staff tooling has no business in a search index, and a reservation list
  // leaking guest names into results is a privacy problem, not just a ranking one.
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/signin?callbackUrl=/admin");
  if (user.role !== "ADMIN") redirect("/account");

  const settings = await getSettings();
  const name = user.name?.trim() || "there";

  return (
    <div className="min-h-screen lg:flex">
      <AdminNav restaurantName={settings.name} />

      <div className="min-w-0 flex-1">
        <AdminTopBar userName={name} isOwner />
        <main className="px-5 py-8 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
