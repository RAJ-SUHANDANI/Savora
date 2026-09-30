"use server";

/**
 * Account self-service actions.
 *
 * Two mutations and a hard rule: **the row being written is always
 * `session.user.id`.** It is never read from `FormData`.
 *
 * That single constraint is the difference between "edit your profile" and
 * "edit anyone's profile". A server action is a public HTTP endpoint — anyone
 * can POST to it with any body they like — so a field that arrives in the form
 * is attacker-controlled no matter what the client UI does with it. The owner id
 * comes from the verified JWT and nowhere else. There is no `userId` input for a
 * crafted request to set.
 *
 * `/admin/actions.ts` is the one place that deliberately does take an id, and it
 * re-checks `requireAdmin()` on every call.
 *
 * ## The result type is imported, not declared
 *
 * A `"use server"` module may only export async functions. The `IDLE` constant
 * that used to sit next to the `ActionState` union here was a plain object, and
 * Next.js's server-actions loader rejects the whole file when it sees one —
 * which silently took down every action in the module, not just its neighbour.
 * Both the union and the idle value now come from `@/lib/action-state`.
 */
import { compare, hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { type ProfileState, fieldsFrom } from "@/lib/action-state";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clientIp, limit } from "@/lib/rate-limit";
import { BCRYPT_ROUNDS } from "@/lib/password";
import { changePasswordSchema, profileSchema } from "@/lib/validation";

export type ActionState = ProfileState;

/**
 * Save name and phone.
 *
 * `phone` is normalised to `null` rather than `""`, because the column is
 * nullable and an empty string would make `if (user.phone)` true for a user who
 * has never given a number — which then shows up as a phone icon pointing at
 * nothing in every reservation card.
 */
export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fields: fieldsFrom(parsed.error.issues),
    };
  }

  const phone = parsed.data.phone?.trim() ?? "";

  await prisma.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name, phone: phone === "" ? null : phone },
  });

  // The session name is baked into the JWT, so the header's avatar would keep
  // showing the old one until the token expired.
  revalidatePath("/account", "layout");

  return { status: "success", message: "Your details have been saved." };
}

/**
 * Change the account password.
 *
 * Rate limited per IP, and separately, because this is the one authenticated
 * endpoint where an attacker can brute-force something: they need a valid
 * session, but a session is exactly what a stolen cookie provides, and the
 * current password is the last thing standing between them and a durable
 * takeover. Ten tries an hour is generous for someone who knows their own
 * password and hopeless for a guessing run.
 */
export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const ip = clientIp(await headers());
  const rate = await limit(`pwchange:${ip}`, 10, 3600);
  if (!rate.success) {
    return {
      status: "banner",
      message:
        "Too many password changes from this connection. Please try again later, or telephone the restaurant.",
    };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fields: fieldsFrom(parsed.error.issues),
    };
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { password: true },
  });

  if (!record?.password) {
    // A Google-only account has no password hash to compare against and no way
    // to set one from here without inventing a reset flow.
    return {
      status: "banner",
      message:
        "This account signs in with Google, so it has no password to change. Use the Google button on the sign-in page.",
    };
  }

  // Always spend a bcrypt comparison, even for a user with no password, so the
  // response time does not reveal which accounts are Google-only.
  const ok = await compare(
    parsed.data.currentPassword,
    record.password ??
      "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi",
  );

  if (!ok) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fields: { currentPassword: "That is not your current password" },
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await hash(parsed.data.newPassword, BCRYPT_ROUNDS) },
  });

  // The session cookie is not invalidated by a password change — it is a
  // stateless JWT. Saying so in the confirmation is better than letting someone
  // believe a stolen device has just been locked out.
  return {
    status: "success",
    message:
      "Your password has been changed. Other devices that were already signed in will stay signed in — sign out of them if that concerns you.",
  };
}

/** First error per field, which is all a form can usefully display. */

