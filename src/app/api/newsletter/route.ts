/**
 * Newsletter signups.
 *
 *   POST   /api/newsletter   { email }
 *   DELETE /api/newsletter ?email=...   (one-click unsubscribe)
 *
 * ## Why this route exists
 *
 * The footer has always had a signup form pointing here, and there was no route
 * to point at. Submitting it returned a 404 and threw the guest off the site
 * mid-page. A form that silently discards an address is worse than no form,
 * because the guest leaves believing they are on the list.
 *
 * ## The form still works without JavaScript
 *
 * The footer is a plain `<form method="post">`, which is the right default: it
 * submits before this component hydrates, works if the JS bundle fails, and
 * needs no client state. The cost is that a successful POST navigates away, so
 * the route answers `accept: text/html` with a 303 to `/newsletter?joined=1`,
 * and that page reads the flag and confirms. Anything asking for JSON gets the
 * normal envelope instead, and the hydrated footer form never navigates at all.
 * Both paths write the same row.
 *
 * ## The address is normalised before it is stored
 *
 * Lower-cased and trimmed here, not at read time, because the address is the
 * primary key. `Ada@Example.com ` and `ada@example.com` are one person, and an
 * insert that is not normalised either creates two rows or trips the primary
 * key - both of which read as a bug in the signup form rather than as a data
 * hygiene problem.
 *
 * ## Signing up twice is not an error
 *
 * `upsert`, not `create`. Someone who forgot they had already subscribed should
 * be told they are on the list, not shown a failure for a thing that already
 * succeeded. It also clears `unsubscribedAt`, which is the whole point of
 * signing up again - the row is kept so there is a record of the earlier opt-out
 * rather than a silent re-subscribe.
 */
import { z } from "zod";

import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { clientIp, limit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Deliberately loose about the domain and strict about the shape.
 *
 * Rejecting `user@example` with a confident "add a TLD" is routinely wrong -
 * intranet and single-label addresses are real - and the only addresses worth
 * rejecting are the ones no mail server will accept. The shape check catches
 * those without pretending to know which TLDs exist.
 */
const schema = z.object({
  email: z
    .string()
    .trim()
    .min(3, "Enter your email address.")
    .max(254, "That address is too long.")
    .email("That does not look like an email address."),
});

function normalise(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Read the address and the intent from whichever encoding the caller used.
 *
 * The content type is checked rather than `request.json()` being tried and
 * caught: a `try` around a `json()` call on a form POST consumes the body, and
 * the `formData()` fallback that follows would then read an already-drained
 * stream. Checking the header costs one line and cannot desynchronise.
 *
 * `intent` exists because a plain HTML form can only speak GET and POST, so the
 * unsubscribe form on /newsletter cannot send the DELETE below. Rather than
 * making that form JavaScript-only — which would break the one page that most
 * needs to work without it — the intent rides along in the body and shares the
 * exact same soft-delete code path.
 */
async function readPayload(request: Request): Promise<{ email?: unknown; intent?: unknown }> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      return (await request.json()) as { email?: unknown; intent?: unknown };
    } catch {
      return {};
    }
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  return { email: form.get("email"), intent: form.get("intent") };
}

/** The soft delete, shared by the DELETE verb and the form-driven `intent`. */
async function unsubscribe(email: string) {
  // `updateMany` rather than `update` so an unknown address is a no-op instead
  // of a throw - an unsubscribe clicked twice must not 500.
  const { count } = await prisma.newsletterSubscriber.updateMany({
    where: { email, unsubscribedAt: null },
    data: { unsubscribedAt: new Date() },
  });
  return { email, unsubscribed: count > 0 };
}

export async function POST(request: Request) {
  return handle(async () => {
    // Without a cap this is a free mail-relay endpoint for anyone with a script.
    const result = await limit(`newsletter:${clientIp(request.headers)}`, 5, 60 * 60);
    if (!result.success) {
      return fail("Too many attempts. Please try again later.", {
        status: 429,
        code: "RATE_LIMITED",
      });
    }

    const payload = await readPayload(request);

    // A form cannot send DELETE, so `intent=unsubscribe` arrives here instead.
    if (payload.intent === "unsubscribe") {
      const email = normalise(typeof payload.email === "string" ? payload.email : "");
      if (!email) return fail("An email address is required.", { status: 400 });
      const result = await unsubscribe(email);
      if ((request.headers.get("accept") ?? "").includes("text/html")) {
        return Response.redirect(
          new URL(result.unsubscribed ? "/newsletter?left=1" : "/newsletter?already=1", request.url),
          303,
        );
      }
      return ok(result);
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return fail("Please check the highlighted fields.", {
        status: 422,
        code: "VALIDATION",
        fields: { email: parsed.error.issues[0]?.message ?? "Enter your email address." },
      });
    }

    const email = normalise(parsed.data.email);
    await prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email },
      update: { unsubscribedAt: null },
    });

    // A real browser navigation is sent to the newsletter page with a flag it
    // reads, so the confirmation survives without JavaScript. It used to point
    // back at `/?joined=1`, but nothing on the home page ever read that flag --
    // the comment above claimed the footer did, and it did not -- so a no-JS
    // signup navigated away and confirmed nothing at all.
    const accepts = request.headers.get("accept") ?? "";
    if (accepts.includes("text/html")) {
      return Response.redirect(new URL("/newsletter?joined=1", request.url), 303);
    }

    return ok({ email });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    const email = normalise(new URL(request.url).searchParams.get("email") ?? "");
    if (!email) return fail("An email address is required.", { status: 400 });

    // Soft delete: see the module comment.
    return ok(await unsubscribe(email));
  });
}
