"use server";

/**
 * Contact form submission.
 *
 * There is no messages table on purpose. The contact form is a front end over
 * sending an email: a saved message that nobody is notified about is worse than
 * a delivered one, and this keeps the schema honest about where enquiries
 * actually go. With no mail provider configured the messages land in
 * `.outbox/` and are browsable at `/dev/outbox`, so the whole path is
 * reviewable for free.
 */
import { headers } from "next/headers";
import { ZodError } from "zod";

import { contactSchema, type ContactInput } from "@/lib/validation";
import { sendEmail } from "@/lib/email";
import { contactAcknowledgement, contactMessage } from "@/lib/email-templates";
import { getSettings } from "@/lib/settings";
import { clientIp, limit } from "@/lib/rate-limit";

export type ContactState =
  | { status: "idle" }
  | { status: "error"; message: string; fields?: Record<string, string> }
  | { status: "sent"; echo: Pick<ContactInput, "name" | "email" | "subject"> };

/** Far more generous than booking: five enquiries an hour is still generous. */
const ENQUIRY_LIMIT = 5;
const ENQUIRY_WINDOW_SEC = 60 * 60;

export async function sendContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of (parsed.error as ZodError).issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fields[key]) fields[key] = issue.message;
    }
    return { status: "error", message: "Please check the highlighted fields", fields };
  }

  const { name, email, subject, message } = parsed.data;

  // Rate limiting by IP: a shared address (a hotel, an office) is allowed more
  // than an individual, but nobody gets to use the form as a mail relay.
  const ip = clientIp(await headers());
  const rate = await limit(`contact:${ip}`, ENQUIRY_LIMIT, ENQUIRY_WINDOW_SEC);
  if (!rate.success) {
    return {
      status: "error",
      message: "You have sent a few messages already. Please try again later, or telephone us.",
    };
  }

  const settings = await getSettings();

  // Forward the enquiry to the restaurant, then acknowledge the sender. Both
  // are fire-and-forget by design: `sendEmail` never throws, so a mail outage
  // cannot turn a successfully-received enquiry into an error page.
  await sendEmail({ to: settings.email, ...contactMessage({ name, email, subject, message }) });
  await sendEmail({ to: email, toName: name, ...contactAcknowledgement({ name, subject }) });

  return { status: "sent", echo: { name, email, subject } };
}
