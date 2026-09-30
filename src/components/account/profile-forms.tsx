"use client";

/**
 * The two forms on `/account/profile`.
 *
 * They live in one file because they are one page and share the same two
 * banners, the same pending idiom, and the same rule that the server owns the
 * write — but they are separate forms with separate schemas and separate action
 * states, and merging them into a single eight-field submit would have been
 * worse in two concrete ways: changing a phone number would demand the current
 * password, and a stale password error would sit under the name field.
 *
 * Both are RHF-driven rather than `<form action>`, for the same reason as every
 * other form in the app: wiring both fires the action twice.
 */
import { useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Check, KeyRound, UserRound } from "lucide-react";

import { Field, PasswordInput } from "@/components/auth/fields";
import { changePasswordAction, updateProfileAction } from "@/app/account/actions";
import { PROFILE_IDLE, type ProfileState } from "@/lib/action-state";
import { changePasswordSchema, profileSchema, type ProfileInput } from "@/lib/validation";
import { cn } from "@/lib/format";

export function ProfileDetailsForm({
  defaultName,
  defaultPhone,
}: {
  defaultName: string;
  defaultPhone: string;
}) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    PROFILE_IDLE,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: defaultName, phone: defaultPhone },
  });

  const serverFields = state.status === "error" ? (state.fields ?? {}) : {};
  const busy = pending || isSubmitting;

  /**
   * Return the form to its saved values after a successful write.
   *
   * An effect rather than `formAction(...).then(...)`, because `useActionState`
   * types its dispatch as returning `void` — it is a state setter, not a
   * promise, and chaining off it would be pretending otherwise. The dependency
   * is `state`, not the field values, so this fires once per result rather than
   * on every render. `reset()` with no arguments restores the defaults RHF was
   * given, which after a save are the values that are now in the database.
   */
  useEffect(() => {
    if (state.status === "success") reset();
  }, [state, reset]);

  return (
    <section className="surface-raised rounded-2xl p-6 md:p-8">
      <header className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terracotta-soft text-accent"
          aria-hidden="true"
        >
          <UserRound size={16} />
        </span>
        <div>
          <h2 className="font-display text-xl">Your details</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            We use these on every booking confirmation, so a kitchen knows the name
            to put on a cover before you arrive.
          </p>
        </div>
      </header>

      <Banner state={state} />

      <form
        onSubmit={handleSubmit((values) => {
          // RHF is the only thing that decides this is submittable; the action
          // re-validates the same schema because a server action is public.
          const formData = new FormData();
          formData.set("name", values.name);
          formData.set("phone", values.phone ?? "");
          formAction(formData);
        })}
        noValidate
        className="mt-6 space-y-5"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="name"
            label="Full name"
            error={errors.name?.message ?? serverFields.name}
          >
            <input
              id="name"
              autoComplete="name"
              placeholder="Ida Lindqvist"
              aria-invalid={Boolean(errors.name || serverFields.name)}
              className={cn("field", (errors.name || serverFields.name) && "field-error")}
              {...register("name")}
            />
          </Field>

          <Field
            id="phone"
            label="Phone"
            hint="Optional, but it is the quickest way to reach you on the day."
            error={errors.phone?.message ?? serverFields.phone}
          >
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+44 7700 900123"
              aria-invalid={Boolean(errors.phone || serverFields.phone)}
              className={cn("field", (errors.phone || serverFields.phone) && "field-error")}
              {...register("phone")}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
            {busy ? "Saving…" : "Save details"}
          </button>
          <button
            type="button"
            onClick={() => reset({ name: defaultName, phone: defaultPhone })}
            disabled={busy}
            className="btn btn-ghost btn-sm"
          >
            Discard changes
          </button>
        </div>
      </form>
    </section>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    changePasswordAction,
    PROFILE_IDLE,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const serverFields = state.status === "error" ? (state.fields ?? {}) : {};
  const busy = pending || isSubmitting;

  /**
   * Wipe the three fields once the change lands.
   *
   * Nothing here is safe to leave on screen after a successful password change:
   * the old one is exactly the secret an attacker with a borrowed device would
   * want to read off the page, and the new one is sitting in a form the user has
   * already been told is correct.
   */
  useEffect(() => {
    if (state.status === "success") reset();
  }, [state, reset]);

  return (
    <section className="surface-raised rounded-2xl p-6 md:p-8">
      <header className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terracotta-soft text-accent"
          aria-hidden="true"
        >
          <KeyRound size={16} />
        </span>
        <div>
          <h2 className="font-display text-xl">Password</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            You need your current password to set a new one. There is no reset
            link in this build, so this is also the only route to a password you
            have forgotten &mdash; telephone us and a host will sort you out.
          </p>
        </div>
      </header>

      <Banner state={state} />

      <form
        onSubmit={handleSubmit((values) => {
          const formData = new FormData();
          formData.set("currentPassword", values.currentPassword);
          formData.set("newPassword", values.newPassword);
          formData.set("confirmPassword", values.confirmPassword);
          formAction(formData);
        })}
        noValidate
        className="mt-6 space-y-5"
      >
        <Field
          id="currentPassword"
          label="Current password"
          error={errors.currentPassword?.message ?? serverFields.currentPassword}
        >
          <PasswordInput
            id="currentPassword"
            autoComplete="current-password"
            placeholder="Your password now"
            invalid={Boolean(errors.currentPassword || serverFields.currentPassword)}
            registration={register("currentPassword")}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="newPassword"
            label="New password"
            hint="At least 8 characters, with a capital letter or a number."
            error={errors.newPassword?.message ?? serverFields.newPassword}
          >
            <PasswordInput
              id="newPassword"
              autoComplete="new-password"
              placeholder="A new password"
              invalid={Boolean(errors.newPassword || serverFields.newPassword)}
              registration={register("newPassword")}
            />
          </Field>

          <Field
            id="confirmPassword"
            label="Confirm new password"
            error={errors.confirmPassword?.message ?? serverFields.confirmPassword}
          >
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              placeholder="Type it again"
              invalid={Boolean(errors.confirmPassword || serverFields.confirmPassword)}
              registration={register("confirmPassword")}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
            {busy ? "Changing…" : "Change password"}
          </button>
          <p className="text-xs leading-relaxed text-ink-subtle">
            Each field has its own show/hide toggle, so you can check what you
            typed without leaving the form.
          </p>
        </div>
      </form>
    </section>
  );
}

/**
 * One banner, three tones.
 *
 * Success is not styled as an error. A form that saved correctly and turned its
 * confirmation red teaches people to distrust every message on the page, and on
 * a page that also asks for a password that is a particularly expensive habit
 * to learn.
 */
function Banner({ state }: { state: ProfileState }) {
  if (state.status === "success") {
    return (
      <p
        role="status"
        className="mt-5 flex items-start gap-2 rounded-xl border border-olive/30 bg-olive/8 px-4 py-3 text-sm leading-relaxed text-olive"
      >
        <Check size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        {state.message}
      </p>
    );
  }

  const message =
    state.status === "banner"
      ? state.message
      : state.status === "error" && !Object.keys(state.fields ?? {}).length
        ? state.message
        : null;

  if (!message) return null;

  return (
    <p
      role="alert"
      className="mt-5 flex items-start gap-2 rounded-xl border border-wine/25 bg-wine/5 px-4 py-3 text-sm leading-relaxed text-wine"
    >
      <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
