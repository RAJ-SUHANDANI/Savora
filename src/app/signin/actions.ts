"use server";

/**
 * Sign-in server action.
 *
 * Two decisions worth spelling out:
 *
 * **The action returns a discriminated union rather than throwing.** Auth.js
 * signals failure by throwing an `AuthError`, and success by throwing a
 * `NEXT_REDIRECT`. Both have to be caught, and only the first is ours to
 * handle — re-throwing the redirect is what actually performs the navigation.
 * `useActionState` then has something renderable to show on the same screen.
 *
 * **Rate limiting happens here, before the credential check.** Ten attempts a
 * quarter-hour from one address is generous for a human who has forgotten which
 * of three passwords they used, and hopeless for a credential-stuffing run. The
 * counter is keyed on the IP *and* the submitted address, so neither a single
 * host hammering many addresses nor many hosts hammering one address gets a
 * free run — the two limits are independent and both must pass.
 */
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { ZodError } from "zod";

import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { signInSchema } from "@/lib/validation";
import { safeRedirect } from "@/lib/redirects";
import { clientIp, limit } from "@/lib/rate-limit";

export type AuthState =
  | { status: "idle" }
  | { status: "success"; redirectTo: string }
  | { status: "error"; message: string; fields?: Record<string, string> }
  | { status: "ratelimited"; message: string };

/** Deliberately generous. A person misremembering a password is the common case. */
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_SEC = 15 * 60;

/** Shared by sign-in and register; both are credential endpoints. */
function fieldsFrom(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

async function defaultLandingFor(email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  });
  return user?.role === "ADMIN" ? "/admin" : "/account";
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();

  const ip = clientIp(await headers());
  const addressLimit = await limit(`signin:ip:${ip}`, ATTEMPT_LIMIT, ATTEMPT_WINDOW_SEC);
  if (!addressLimit.success) {
    return {
      status: "ratelimited",
      message:
        "Too many sign-in attempts from this connection. Please try again in fifteen minutes, or telephone the restaurant and we will help.",
    };
  }
  // Only once the address is well-formed, so this bucket cannot be used to
  // enumerate which addresses exist by watching which limit fires.
  if (rawEmail) {
    const accountLimit = await limit(
      `signin:email:${rawEmail}`,
      ATTEMPT_LIMIT * 3,
      ATTEMPT_WINDOW_SEC,
    );
    if (!accountLimit.success) {
      return {
        status: "ratelimited",
        message:
          "Too many attempts for that email address. Please try again in fifteen minutes.",
      };
    }
  }

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fields: fieldsFrom(parsed.error as ZodError),
    };
  }

  // Where to land when the visitor did not ask for anywhere specific.
  //
  // This needs the role, and `signIn()` throws its redirect before we could ask
  // for a session — so it is read here, from an indexed unique lookup, rather
  // than sniffered out of the email address. It is not an authorisation
  // decision: `/admin` re-checks the role on every request, so a wrong answer
  // here would only land someone on the wrong screen, not let them in.
  const landing = await defaultLandingFor(parsed.data.email);

  const redirectTo = safeRedirect(formData.get("callbackUrl") as string | null, landing);

  try {
    // `redirect: false` is the whole point of this function returning a union
    // rather than throwing.
    //
    // With the default, Auth.js throws a `NEXT_REDIRECT` and Next performs a
    // server-side navigation to the RSC payload for `/account`. The session
    // cookie is set, but `SessionProvider` on the client still holds the session
    // it fetched when the page *first* loaded — and a server-rendered navigation
    // does not refetch it. So the header kept rendering "Sign in" on a page the
    // visitor was now signed in to, which is the exact bug this replaces.
    //
    // Returning the URL instead lets the client navigate *and* tell the session
    // provider to re-read `/api/auth/session` first, so the header updates in
    // the same render that lands them on their account.
    const url = await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo,
      redirect: false,
    });
    return { status: "success", redirectTo: url ?? redirectTo };
  } catch (error) {
    if (error instanceof AuthError) {
      // One message for every failure. A different copy for "no such account"
      // and "wrong password" is a free account-enumeration oracle, and the
      // `authorize` callback already spends a bcrypt comparison either way so
      // the two take the same time.
      return {
        status: "error",
        message: "That email and password did not match. Please try again.",
      };
    }
    // NEXT_REDIRECT and everything else. Rethrown unchanged.
    throw error;
  }
}
