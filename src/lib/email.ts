/**
 * Email delivery.
 *
 * Three transports, chosen by what is available in the environment, so the app
 * is fully functional with zero configuration and needs no change (only a key)
 * to go live:
 *
 *   1. **Resend** — set `RESEND_API_KEY`. Free tier, 3,000 emails/month.
 *   2. **SMTP** — set `SMTP_URL` (e.g. a Gmail or Fastmail app password).
 *   3. **Outbox** — the default. Every message is rendered to HTML and written
 *      to `.outbox/`, and browsable at `/dev/outbox`. This is not a stub: the
 *      exact HTML that would be sent is written, so the emails can be reviewed
 *      and designed for free.
 *
 * Delivery is deliberately fire-and-forget from the caller's perspective: a
 * failed email must never roll back a confirmed booking, so errors are logged
 * and swallowed here and the route still returns 200.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

export type EmailMessage = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  /** Tags for the Resend dashboard. */
  tags?: { name: string; value: string }[];
};

export type Transport = "resend" | "smtp" | "outbox";

export function activeTransport(): Transport {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_URL) return "smtp";
  return "outbox";
}

const OUTBOX_DIR = path.join(process.cwd(), ".outbox");

/** Filename-safe, sortable, and unique: `2026-06-01T19-30-00_booking_abc123.html`. */
function outboxFilename(subject: string, to: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const domain = to.split("@")[1]?.replace(/[^a-z0-9]/g, "-") ?? "unknown";
  return `${stamp}_${slug}_${domain}.html`;
}

async function writeToOutbox(message: EmailMessage): Promise<void> {
  await fs.mkdir(OUTBOX_DIR, { recursive: true });
  const file = path.join(OUTBOX_DIR, outboxFilename(message.subject, message.to));
  // The .html wraps the real body with a header showing envelope details, so
  // opening the file in a browser shows exactly what would have been sent.
  const envelope = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(message.subject)}</title></head>
<body style="margin:0;background:#f4ede4;font-family:ui-monospace,Menlo,monospace;font-size:12px">
  <div style="padding:16px 24px;background:#1e1815;color:#f4ece4">
    <strong>Savora outbox</strong> &nbsp;·&nbsp; no email provider configured, so this message was written to disk
  </div>
  <div style="padding:16px 24px;background:#fff;color:#111">
    <table style="width:100%;max-width:640px;margin:0 auto;line-height:1.7">
      <tr><td style="color:#666">To</td><td><strong>${escapeHtml(message.toName ? `${message.toName} <${message.to}>` : message.to)}</strong></td></tr>
      <tr><td style="color:#666">Subject</td><td><strong>${escapeHtml(message.subject)}</strong></td></tr>
      <tr><td style="color:#666">Sent</td><td>${new Date().toISOString()}</td></tr>
    </table>
  </div>
  <hr style="border:0;border-top:1px solid #ddd;margin:24px">
  <div style="background:#fff;padding:8px 24px 40px">${message.html}</div>
</body></html>`;
  await fs.writeFile(file, envelope, "utf8");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Resend delivery.
 *
 * Calls the REST API directly rather than pulling in the `resend` SDK. The
 * endpoint is a single unauthenticated-shape POST, and doing it with `fetch`
 * means the app ships without an extra dependency that would otherwise only be
 * exercised on a paid account. It also keeps the free outbox path the default:
 * the SDK is never imported, and never bundled, unless a key is actually set.
 */
async function sendViaResend(message: EmailMessage): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Savora <bookings@savora.example>",
      to: [message.toName ? `${message.toName} <${message.to}>` : message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: message.tags,
    }),
  });

  if (!res.ok) {
    // Surface the provider's own message; it is far more useful than a bare
    // status code when a domain or from-address is misconfigured.
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
}

async function sendViaSmtp(message: EmailMessage): Promise<void> {
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(process.env.SMTP_URL!);
  await transport.sendMail({
    from: process.env.EMAIL_FROM ?? "Savora <bookings@savora.example>",
    to: message.toName ? `${message.toName} <${message.to}>` : message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}

/**
 * Sends a message. Never throws — a booking must succeed even if email does not.
 * Returns the transport used so callers can log or surface it in dev.
 */
export async function sendEmail(message: EmailMessage): Promise<Transport> {
  const transport = activeTransport();
  try {
    if (transport === "resend") await sendViaResend(message);
    else if (transport === "smtp") await sendViaSmtp(message);
    else await writeToOutbox(message);
  } catch (err) {
    console.error(`[email] ${transport} delivery failed for ${message.to}:`, err);
  }
  return transport;
}

/** Lists outbox files, newest first, for the dev mailbox viewer. */
export async function listOutbox(): Promise<{ file: string; subject: string; to: string; mtime: Date }[]> {
  try {
    const names = await fs.readdir(OUTBOX_DIR);
    const entries = await Promise.all(
      names
        .filter((n) => n.endsWith(".html"))
        .map(async (file) => {
          const stat = await fs.stat(path.join(OUTBOX_DIR, file));
          return { file, subject: file.replace(/^\d{4}-\d{2}-\d{2}T[\d-]+_/, "").replace(/\.html$/, "").replace(/-/g, " "), to: file.split("_").pop()?.replace(/\.html$/, "") ?? "", mtime: stat.mtime };
        }),
    );
    return entries.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

export async function readOutboxFile(file: string): Promise<string | null> {
  // Reject anything that is not a bare filename, so `..` cannot escape the dir.
  if (!/^[A-Za-z0-9._-]+\.html$/.test(file)) return null;
  try {
    return await fs.readFile(path.join(OUTBOX_DIR, file), "utf8");
  } catch {
    return null;
  }
}
