"use client";

/**
 * Registration form.
 *
 * RHF drives the submit rather than the `<form action>`, for the same reason as
 * every other form here: wiring both would post the action twice.
 *
 * The two password fields are compared by the shared `signUpSchema`, so the
 * "they do not match" message comes from the same rule the server enforces. The
 * strength meter is advisory and deliberately does not block submission — the
 * schema sets the floor (8 characters, mixed case), and inventing a stricter
 * rule in the meter would mean rejecting passwords the form had accepted.
 */
import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { AlertCircle, UserPlus } from "lucide-react";

import { Field, PasswordInput, PasswordStrength } from "@/components/auth/fields";
import { registerAction, type RegisterState } from "@/app/register/actions";
import { signUpSchema } from "@/lib/validation";
import { cn } from "@/lib/format";

const INITIAL: RegisterState = { status: "idle" };

export function RegisterForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    registerAction,
    INITIAL,
  );

  const router = useRouter();
  const { update } = useSession();

  /**
   * Refresh the client session, *then* navigate.
   *
   * Identical in intent to the sign-in form's version, and for the same reason:
   * the action returns the destination instead of throwing a redirect, so
   * `SessionProvider` can be caught up before the navigation happens. Otherwise
   * the header still reads "Sign in" on the account page a visitor has just
   * created an account in order to reach.
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
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signUpSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  /**
   * The strength meter needs every keystroke; the error messages do not.
   *
   * `useWatch` rather than `watch`, deliberately: React's compiler refuses to
   * memoise `watch`, so calling it opts this whole component out of
   * memoisation. `useWatch` is a separate subscription to a single field, which
   * both stays inside the compiler's rules and re-renders less — typing in the
   * password box touches the meter, not the other four inputs.
   */
  const passwordValue = useWatch({ control, name: "password" });

  const serverFields = state.status === "error" ? (state.fields ?? {}) : {};
  /** Stays true through the session refresh, so the button never flickers. */
  const busy = pending || isSubmitting || state.status === "success";

  const banner =
    state.status === "error" && !Object.keys(serverFields).length ? state.message : null;
  const rateLimited = state.status === "ratelimited" ? state.message : null;

  const submit = handleSubmit((values) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, String(value));
    formData.set("callbackUrl", callbackUrl);
    return formAction(formData);
  });

  return (
    <div>
      <h2 className="font-display text-2xl">Create your account</h2>
      <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
        One account keeps every booking in one place and remembers the dishes you
        liked. You can book without one &mdash; it is entirely optional.
      </p>

      <form onSubmit={submit} noValidate className="mt-7">
        <div className="space-y-5">
          <Field id="name" label="Your name" error={errors.name?.message ?? serverFields.name}>
            <input
              id="name"
              autoComplete="name"
              placeholder="Ida Lindqvist"
              aria-invalid={Boolean(errors.name || serverFields.name)}
              className={cn("field", (errors.name || serverFields.name) && "field-error")}
              {...register("name")}
            />
          </Field>

          <Field id="email" label="Email" error={errors.email?.message ?? serverFields.email}>
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

          <Field
            id="phone"
            label="Phone"
            hint="Optional. We only use it if the kitchen needs to reach you on the night."
            error={errors.phone?.message ?? serverFields.phone}
          >
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="07700 900123"
              aria-invalid={Boolean(errors.phone || serverFields.phone)}
              className={cn("field", (errors.phone || serverFields.phone) && "field-error")}
              {...register("phone")}
            />
          </Field>

          <div>
            <Field
              id="password"
              label="Password"
              error={errors.password?.message ?? serverFields.password}
            >
              <PasswordInput
                id="password"
                autoComplete="new-password"
                placeholder="Eight characters or more"
                invalid={Boolean(errors.password || serverFields.password)}
                registration={register("password")}
              />
            </Field>
            <PasswordStrength password={passwordValue} />
          </div>

          <Field
            id="confirmPassword"
            label="Confirm password"
            error={errors.confirmPassword?.message ?? serverFields.confirmPassword}
          >
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              placeholder="Type it once more"
              invalid={Boolean(errors.confirmPassword || serverFields.confirmPassword)}
              registration={register("confirmPassword")}
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
          {busy ? "Creating your account…" : "Create account"}
          {busy ? null : <UserPlus size={15} aria-hidden="true" />}
        </button>

        <p className="mt-5 text-xs leading-relaxed text-ink-subtle">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="link-underline text-accent">
            terms
          </Link>{" "}
          and our{" "}
          <Link href="/privacy" className="link-underline text-accent">
            privacy notice
          </Link>
          . We store your name, email and bookings &mdash; nothing else, and no
          marketing email unless you ask for it.
        </p>
      </form>

      <p className="mt-7 border-t border-border-subtle pt-6 text-sm text-ink-muted">
        Already have an account?{" "}
        <Link
          href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="link-underline text-accent"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
