/**
 * Sign in.
 *
 * A visitor who already has a session never sees this page: they are sent on to
 * wherever they were headed, or to the dashboard that suits their role. Doing it
 * in the page rather than in the form means an authenticated user does not
 * briefly see a password field before being redirected.
 *
 * `noindex` because a sign-in page in a search index is a phishing target — the
 * result snippet ("Sign in to Savora") attaches itself to a copy of the page an
 * attacker controls, with our domain next to it.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PublicShell } from "@/components/layout/public-shell";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/signin-form";
import { currentUser, googleEnabled } from "@/lib/auth";
import { safeRedirect } from "@/lib/redirects";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Savora to see your bookings and saved dishes.",
  robots: { index: false, follow: true },
};

type Props = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.callbackUrl) ? params.callbackUrl[0] : params.callbackUrl;

  const user = await currentUser();
  const callbackUrl = safeRedirect(
    raw,
    user?.role === "ADMIN" ? "/admin" : "/account",
  );

  if (user) redirect(callbackUrl);

  return (
    <PublicShell>
      <AuthShell
        eyebrow="Your table"
        title="Sign in to Savora"
        intro="Keep every booking in one place, cancel in a tap, and remember the dishes you liked. It takes a moment the first time and never again after that."
      >
        <SignInForm
          callbackUrl={callbackUrl}
          googleEnabled={googleEnabled}
          showDemoHint={process.env.NODE_ENV !== "production"}
        />
      </AuthShell>
    </PublicShell>
  );
}
