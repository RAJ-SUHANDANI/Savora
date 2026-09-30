"use server";

/**
 * Registration server action.
 *
 * Creates the row, then signs the visitor straight in — there is no "check your
 * inbox" step, because there is no email provider configured and, more to the
 * point, because a guest who has just made an account and then has to wait for
 * a link to use it will simply book as a stranger instead. The account is a
 * convenience for keeping track of bookings, not a gate in front of them.
 *
 * Three things this deliberately does *not* do:
 *
 *   * **No email verification.** `emailVerified` stays null and nothing depends
 *     on it. A verification workflow with no mail server configured would leave
 *     accounts permanently unverified, which is worse than not having one.
 *   * **No role in the form.** `role` is not read from `FormData`; it is set to
 *     `CUSTOMER` in code. A self-registration form that posts `role=ADMIN` is
 *     the oldest privilege-escalation bug in web applications.
 *   * **No silent merge.** If the address already exists the visitor is told so
 *     and sent to sign in. Quietly overwriting somebody's password because they
 *     forgot they had an account is a data-loss bug wearing a helpful hat.
 */
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { hash } from "bcryptjs";
import { ZodError } from "zod";

import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { signUpSchema } from "@/lib/validation";
import { BCRYPT_ROUNDS } from "@/lib/password";
import { safeRedirect } from "@/lib/redirects";
import { clientIp, limit } from "@/lib/rate-limit";

export type RegisterState =
  | { status: "idle" }
  | { status: "success"; redirectTo: string }
  | { status: "error"; message: string; fields?: Record<string, string> }
  | { status: "ratelimited"; message: string };

/** Creating an account is cheap for us and free to abuse, so it is limited. */
const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_SEC = 60 * 60;

/**
 * bcrypt work factor.
 *
 * 12 is roughly 250ms on current server hardware — slow enough to make a
 * stolen hash table expensive to attack, fast enough that a signing-in
 * restaurant host does not notice. `bcryptjs` is pure JavaScript and therefore
 * slower than the native binding, which is the main argument for not going to
 * 13 or higher here.
 *
 * The constant itself now lives in `@/lib/password`, so the account's password
 * change cannot quietly drift away from it.
 */

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const ip = clientIp(await headers());
  const rate = await limit(`register:${ip}`, SIGNUP_LIMIT, SIGNUP_WINDOW_SEC);
  if (!rate.success) {
    return {
      status: "ratelimited",
      message:
        "You have created a few accounts already. Please try again later, or telephone the restaurant.",
    };
  }

  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of (parsed.error as ZodError).issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fields[key]) fields[key] = issue.message;
    }
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fields,
    };
  }

  const { name, email, phone, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    return {
      status: "error",
      message: "We already have an account with that email address.",
      fields: { email: "Try signing in instead" },
    };
  }

  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  try {
    await prisma.user.create({
      data: {
        name,
        email,
        phone: phone || null,
        password: passwordHash,
        // Set here, never read from the form. See the note at the top.
        role: "CUSTOMER",
      },
    });
  } catch (error) {
    // Two people submitting the same address at the same moment gets past the
    // lookup above and loses on the unique index. That is a success for the
    // visitor's purposes — the account now exists — so they are sent to sign in
    // rather than shown a database error.
    if (isUniqueViolation(error)) {
      return {
        status: "error",
        message: "We already have an account with that email address.",
        fields: { email: "Try signing in instead" },
      };
    }
    throw error;
  }

  const redirectTo = safeRedirect(formData.get("callbackUrl") as string | null, "/account");

  try {
    // `redirect: false` for the same reason as in `signInAction`: returning the
    // URL instead of throwing a redirect is what lets the client refresh
    // `SessionProvider` before navigating, so the header swaps to the profile
    // menu on the same render rather than one page-load later.
    const url = await signIn("credentials", {
      email,
      password,
      redirectTo,
      redirect: false,
    });
    return { status: "success", redirectTo: url ?? redirectTo };
  } catch (error) {
    if (error instanceof AuthError) {
      // The row exists but the session could not be established — an
      // infrastructure problem, not anything the visitor did. Say so plainly.
      return {
        status: "error",
        message:
          "Your account was created, but we could not sign you in. Please sign in now.",
      };
    }
    throw error;
  }
}

/** Prisma's P2002. Matched on the code so we do not import the error classes. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
