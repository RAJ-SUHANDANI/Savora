/**
 * Create an account.
 *
 * Optional by design. The booking flow never requires it, and the page says so
 * plainly, because a restaurant that makes an account a precondition for dinner
 * has misunderstood what it is selling. The account earns its place by being
 * useful — one list of bookings, saved dishes — not by being a gate.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PublicShell } from "@/components/layout/public-shell";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { currentUser } from "@/lib/auth";
import { safeRedirect } from "@/lib/redirects";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Keep your Savora bookings and saved dishes in one place.",
  robots: { index: false, follow: true },
};

type Props = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function RegisterPage({ searchParams }: Props) {
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
        title="Create an account"
        intro="So you can cancel a booking without hunting for the email, and find the sea bass again six months later. No confirmation email, no newsletter, no obligation."
      >
        <RegisterForm callbackUrl={callbackUrl} />
      </AuthShell>
    </PublicShell>
  );
}
