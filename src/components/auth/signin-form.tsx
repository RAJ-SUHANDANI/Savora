"use client";

/**
 * Sign-in form.
 *
 * RHF validates with the same `signInSchema` the action re-checks with, and —
 * as on the contact form — RHF drives the submit rather than the `<form action>`,
 * because having both would fire the action twice: once from RHF's validated
 * path and once from the browser's own submission.
 *
 * Errors arrive from two directions and are kept visually distinct on purpose:
 * RHF's are inline under the field that caused them, the server's per-field
 * errors merge underneath them, and anything the server could not attribute to
 * a field (a wrong password, a rate limit) becomes a banner above the button.
 * Collapsing all three into one message would leave a guest hunting for the
 * field they had got wrong.
 *
 * The `callbackUrl` is carried in a hidden input purely so the action can read
 * it back — it is re-sanitised server-side, because a hidden field is not a
 * security boundary.
 */
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn, useSession } from "next-auth/react";
import { AlertCircle, ArrowRight, LogIn } from "lucide-react";

import { Field, PasswordInput } from "@/components/auth/fields";
import { signInAction, type AuthState } from "@/app/signin/actions";
import { signInSchema } from "@/lib/validation";
import { cn } from "@/lib/format";

const INITIAL: AuthState = { status: "idle" };

export function SignInForm({
  callbackUrl,
  googleEnabled,
  showDemoHint,
}: {
  callbackUrl: string;
  googleEnabled: boolean;
  /** Seeded credentials, shown only outside production. */
  showDemoHint: boolean;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signInAction,
    INITIAL,
  );

  const router = useRouter();
  const { update } = useSession();

  /**
   * Finish the sign-in on the client.
   *
   * The action has already set the session cookie and told us where to go. What
   * it deliberately did *not* do is navigate: throwing a `NEXT_REDIRECT` from a
   * server action performs a server-side navigation, which swaps the RSC tree
   * but leaves `SessionProvider` holding the session it fetched when this page
   * first loaded. The header is a client component reading that provider, so it
   * kept rendering "Sign in" on a screen the visitor was now signed in to.
   *
   * `update()` re-reads `/api/auth/session` with the new cookie, and awaiting it
   * *before* `router.replace` is the whole fix: by the time the account page is
   * on screen the provider already holds the new session, so the header renders
   * the profile menu in the same paint. The `router.refresh()` afterwards pulls
   * the new route's server data, since the cookie change also invalidates it.
   *
   * The `cancelled` flag is not paranoia: React runs effects twice in
   * development Strict Mode, and without it the second pass would navigate again
   * after the first had already unmounted this component.
   */
  useEffect(() => {
    if (state.status !== "success") return;
    let cancelled = false;

    void (async () => {
      await update();
      if (cancelled) return;
      router.replace(state.redirectTo);
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [state, update, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const serverFields = state.status === "error" ? (state.fields ?? {}) : {};
  /** Stays true through the session refresh, so the button never flickers. */
  const busy = pending || isSubmitting || state.status === "success";

  const banner =
    state.status === "error" && !Object.keys(serverFields).length ? state.message : null;
  const rateLimited = state.status === "ratelimited" ? state.message : null;

  const submit = handleSubmit((values) => {
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set("callbackUrl", callbackUrl);
    return formAction(formData);
  });

  return (
    <div>
      <h2 className="font-display text-2xl">Welcome back</h2>
      <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
        Sign in to see your bookings and the dishes you have saved.
      </p>

      {googleEnabled ? <GoogleButton callbackUrl={callbackUrl} /> : null}

      {googleEnabled ? (
        <div className="my-7 flex items-center gap-4">
          <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
          <span className="text-xs uppercase tracking-[0.18em] text-ink-subtle">or</span>
          <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
        </div>
      ) : null}

      <form onSubmit={submit} noValidate>
        <div className="space-y-5">
          <Field
            id="email"
            label="Email"
            error={errors.email?.message ?? serverFields.email}
          >
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={Boolean(errors.email || serverFields.email)}
              className={cn("field", (errors.email || serverFields.email) && "field-error")}
              {...register("email")}
            />
          </Field>

          <Field id="password" label="Password" error={errors.password?.message ?? serverFields.password}>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="Your password"
              invalid={Boolean(errors.password || serverFields.password)}
              registration={register("password")}
            />
          </Field>
        </div>

        {banner || rateLimited ? (
          <p
            role="alert"
            className="mt-6 flex items-start gap-2 rounded-xl border border-wine/25 bg-wine/5 px-4 py-3 text-sm leading-relaxed text-wine"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            {rateLimited ?? banner}
          </p>
        ) : null}

        <button type="submit" disabled={busy} className="btn btn-primary mt-8 w-full">
          {busy ? "Signing in…" : "Sign in"}
          {busy ? null : <LogIn size={15} aria-hidden="true" />}
        </button>
      </form>

      {/* No password-reset flow exists, and inventing one that cannot send mail
          would be worse than saying so. The phone number always works. */}
      <p className="mt-5 text-xs leading-relaxed text-ink-subtle">
        Forgotten your password?{" "}
        <Link href="/contact" className="link-underline text-accent">
          Ask us to reset it
        </Link>{" "}
        — we will send a temporary one to the address on your account.
      </p>

      <p className="mt-6 border-t border-border-subtle pt-6 text-sm text-ink-muted">
        No account yet?{" "}
        <Link
          href={withCallback("/register", callbackUrl)}
          className="link-underline text-accent"
        >
          Create one
        </Link>
      </p>

      {showDemoHint ? <DemoHint /> : null}
    </div>
  );
}

/**
 * Seeded credentials, in development only.
 *
 * The alternative is a README line nobody opens; this is discoverable from the
 * screen, and it is gated on `NODE_ENV` so it can never ship.
 */
function DemoHint() {
  const [copied, setCopied] = useState<string | null>(null);

  const rows = [
    { role: "Owner", email: "admin@savora.example", password: "savora-admin" },
    { role: "Guest", email: "guest@savora.example", password: "savora-guest" },
  ];

  return (
    <div className="mt-7 rounded-2xl border border-dashed border-border-subtle bg-surface-raised/50 p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
        Demo accounts &mdash; development only
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const text = `${row.email} · ${row.password}`;
          return (
            <li key={row.email} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-ink-muted">
                <span className="font-medium text-ink">{row.role}</span> &middot; {text}
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(`${row.email}\n${row.password}`);
                  setCopied(row.email);
                  setTimeout(() => setCopied(null), 1600);
                }}
                className="btn btn-ghost btn-xs shrink-0"
              >
                {copied === row.email ? "Copied" : "Copy"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GoogleButton({ callbackUrl }: { callbackUrl: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          // Redirects the whole document; there is nothing to reset afterwards.
          void signIn("google", { redirectTo: callbackUrl });
        }}
        className="btn btn-secondary mt-7 w-full"
      >
        <GoogleMark />
        {busy ? "Opening Google…" : "Continue with Google"}
        {busy ? null : <ArrowRight size={15} aria-hidden="true" />}
      </button>
    </>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A8.99 8.99 0 009 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 010-3.44V4.94H.96a8.99 8.99 0 000 8.12l3.01-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A8.99 8.99 0 00.96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

/** Keeps `callbackUrl` when moving between the two auth pages. */
function withCallback(path: string, callbackUrl: string): string {
  return `${path}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
