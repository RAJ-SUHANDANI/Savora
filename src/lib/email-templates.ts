/**
 * Email templates.
 *
 * Table-based HTML with inline styles, because email clients (Gmail in
 * particular) strip `<style>` blocks and do not reliably support modern CSS.
 * The visual language matches the site: cream ground, espresso ink, terracotta
 * accents, Fraunces for the wordmark with a Georgia fallback.
 *
 * Every template takes plain data and returns `{ subject, html, text }` so they
 * are trivially testable and can be previewed at /dev/outbox.
 */
import { formatDate, formatPrice, formatTime } from "./format";
import { ZONE_SHORT, type Zone } from "./constants";

/** Wraps content in the branded shell. */
function shell(opts: { preheader: string; heading: string; content: string; cta?: { label: string; url: string } }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f1e6d8">
  <!-- Preheader text is shown in the inbox list but not in the body. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1e6d8;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fdf8f3;border-radius:16px;overflow:hidden;border:1px solid #e8dac8">

        <tr><td style="padding:32px 32px 20px">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:-0.02em;color:#1e1815;font-weight:400">
            Savora
          </div>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9c8a7c;margin-top:4px">
            Seasonal Mediterranean
          </div>
        </td></tr>

        <tr><td style="padding:0 32px">
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:400;color:#1e1815;margin:8px 0 16px">
            ${escapeHtml(opts.heading)}
          </h1>
          ${opts.content}
        </td></tr>

        ${
          opts.cta
            ? `<tr><td style="padding:28px 32px 8px">
                <a href="${opts.cta.url}" style="display:inline-block;background:#c4623f;color:#fffaf6;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;padding:14px 28px;border-radius:999px">
                  ${escapeHtml(opts.cta.label)}
                </a>
              </td></tr>`
            : ""
        }

        <tr><td style="padding:28px 32px 32px">
          <div style="border-top:1px solid #e8dac8;padding-top:20px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:#9c8a7c">
            18 Alder Lane, Colchester CO1 1SP<br>
            +44 1206 555 0188 · reservations@savora.example
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The key/value grid used for booking details. */
function detailGrid(rows: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6eee3;border-radius:12px;padding:4px 0;margin:20px 0">
    ${rows
      .map(
        ([label, value]) => `<tr>
          <td style="padding:10px 20px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9c8a7c;white-space:nowrap;vertical-align:top;width:38%">${escapeHtml(label)}</td>
          <td style="padding:10px 20px 10px 0;font-family:Georgia,serif;font-size:16px;color:#1e1815">${escapeHtml(value)}</td>
        </tr>`,
      )
      .join("")}
  </table>`;
}

export type BookingEmailData = {
  guestName: string;
  dateIso: string;
  time: string;
  partySize: number;
  tableNumber?: number | null;
  zone?: Zone | null;
  confirmationCode: string;
  manageUrl: string;
  specialRequests?: string | null;
  occasion?: string | null;
  currency?: string;
  /** Totals are only known for a party that has ordered; used in the reminder. */
  estimatedSpendCents?: number | null;
};

/** Sent immediately on booking. */
export function bookingConfirmation(data: BookingEmailData) {
  const when = `${formatDate(data.dateIso)} at ${formatTime(data.time)}`;

  const content = `
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 8px">
      Dear ${escapeHtml(data.guestName.split(" ")[0] ?? data.guestName)},
    </p>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 4px">
      Your table is booked. We look forward to welcoming you.
    </p>
    ${detailGrid([
      ["When", when],
      ["Party", `${data.partySize} ${data.partySize === 1 ? "guest" : "guests"}`],
      ...(data.tableNumber ? ([["Table", String(data.tableNumber)]] as [string, string][]) : []),
      ...(data.zone ? ([["Seating", ZONE_SHORT[data.zone]]] as [string, string][]) : []),
      ["Reference", data.confirmationCode],
    ])}
    ${
      data.occasion
        ? `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.7;color:#6b5d52;margin:0 0 6px">We have noted the occasion: <strong>${escapeHtml(data.occasion)}</strong>.</p>`
        : ""
    }
    ${
      data.specialRequests
        ? `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.7;color:#6b5d52;margin:0 0 6px">Your request: <em>${escapeHtml(data.specialRequests)}</em></p>`
        : ""
    }
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#9c8a7c;margin:16px 0 0">
      If you need to change or cancel, use the button below. Please give us at least 24 hours' notice where you can —
      it lets us offer your table to someone else.
    </p>`;

  return {
    subject: `Your table at Savora — ${when}`,
    html: shell({
      preheader: `Confirmed for ${when}, party of ${data.partySize}. Reference ${data.confirmationCode}.`,
      heading: "Your table is booked",
      content,
      cta: { label: "Manage this booking", url: data.manageUrl },
    }),
    text: [
      `Dear ${data.guestName},`,
      ``,
      `Your table at Savora is confirmed.`,
      ``,
      `When:     ${when}`,
      `Party:    ${data.partySize}`,
      data.tableNumber ? `Table:    ${data.tableNumber}` : "",
      `Reference: ${data.confirmationCode}`,
      ``,
      `Manage or cancel: ${data.manageUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** Sent 24 hours before the booking. */
export function bookingReminder(data: BookingEmailData) {
  const when = `${formatDate(data.dateIso)} at ${formatTime(data.time)}`;

  const content = `
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 8px">
      Dear ${escapeHtml(data.guestName.split(" ")[0] ?? data.guestName)},
    </p>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 4px">
      A reminder that you are dining with us tomorrow.
    </p>
    ${detailGrid([
      ["When", when],
      ["Party", `${data.partySize} ${data.partySize === 1 ? "guest" : "guests"}`],
      ...(data.tableNumber ? ([["Table", String(data.tableNumber)]] as [string, string][]) : []),
      ["Reference", data.confirmationCode],
    ])}
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.7;color:#6b5d52;margin:16px 0 0">
      The kitchen gets its order from this list, so if anything has changed — an allergy, a
      large party, a late arrival — please tell us before we cook.
    </p>
    ${
      data.specialRequests
        ? `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.7;color:#6b5d52;margin:10px 0 0">Noted on your booking: <em>${escapeHtml(data.specialRequests)}</em></p>`
        : ""
    }`;

  return {
    subject: `Tomorrow at Savora — ${when}`,
    html: shell({
      preheader: `Reminder: your table is booked for ${when}.`,
      heading: `We are expecting you tomorrow`,
      content,
      cta: { label: "Manage this booking", url: data.manageUrl },
    }),
    text: [
      `Dear ${data.guestName},`,
      ``,
      `A reminder that you are dining with us tomorrow at ${when}, for ${data.partySize}.`,
      `Reference: ${data.confirmationCode}`,
      ``,
      `Manage or cancel: ${data.manageUrl}`,
    ].join("\n"),
  };
}

/** Sent when a guest cancels. */
export function bookingCancelled(data: BookingEmailData) {
  const when = `${formatDate(data.dateIso)} at ${formatTime(data.time)}`;

  const content = `
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 8px">
      Dear ${escapeHtml(data.guestName.split(" ")[0] ?? data.guestName)},
    </p>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 4px">
      Your booking for ${escapeHtml(when)} has been cancelled. Your table has been released.
    </p>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.7;color:#6b5d52;margin:16px 0 0">
      Something changed and we would love to see you another time.
    </p>`;

  return {
    subject: `Booking cancelled — Savora`,
    html: shell({
      preheader: `Your booking for ${when} has been cancelled.`,
      heading: "Your booking is cancelled",
      content,
      cta: { label: "Book another table", url: `${data.manageUrl.split("/manage")[0]}/reserve` },
    }),
    text: `Your booking for ${when} has been cancelled. We hope to see you soon.`,
  };
}

/** Sent when the owner changes a booking from the dashboard. */
export function bookingAmended(data: BookingEmailData & { changes: string[] }) {
  const when = `${formatDate(data.dateIso)} at ${formatTime(data.time)}`;

  const content = `
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 8px">
      Dear ${escapeHtml(data.guestName.split(" ")[0] ?? data.guestName)},
    </p>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 4px">
      We have made a change to your booking.
    </p>
    ${detailGrid([
      ["When", when],
      ["Party", `${data.partySize} ${data.partySize === 1 ? "guest" : "guests"}`],
      ...(data.tableNumber ? ([["Table", String(data.tableNumber)]] as [string, string][]) : []),
      ["Reference", data.confirmationCode],
    ])}
    <ul style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.8;color:#6b5d52;padding-left:20px;margin:12px 0 0">
      ${data.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
    </ul>`;

  return {
    subject: `Your booking has been updated — Savora`,
    html: shell({
      preheader: `Changes to your booking for ${when}.`,
      heading: "We have updated your booking",
      content,
      cta: { label: "View your booking", url: data.manageUrl },
    }),
    text: `Your booking for ${when} has been updated: ${data.changes.join("; ")}. ${data.manageUrl}`,
  };
}

/** Welcome email after signing up. */
export function welcomeEmail(name: string, accountUrl: string) {
  const content = `
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 8px">
      Welcome, ${escapeHtml(name.split(" ")[0] ?? name)}.
    </p>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 4px">
      Your Savora account is ready. From here you can keep track of upcoming tables, revisit
      dishes you have enjoyed, and change a booking without telephoning the restaurant.
    </p>`;

  return {
    subject: "Welcome to Savora",
    html: shell({
      preheader: "Your account is ready.",
      heading: "Welcome to Savora",
      content,
      cta: { label: "View your bookings", url: accountUrl },
    }),
    text: `Welcome to Savora. Manage your bookings at ${accountUrl}`,
  };
}

/** Waitlist offer. */
export function waitlistOffer(data: {
  guestName: string;
  dateIso: string;
  partySize: number;
  time: string;
  expiresInMinutes: number;
  claimUrl: string;
}) {
  const when = `${formatDate(data.dateIso)} at ${formatTime(data.time)}`;
  const content = `
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 8px">
      Dear ${escapeHtml(data.guestName.split(" ")[0] ?? data.guestName)},
    </p>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 4px">
      A table has come free at ${escapeHtml(when)} for ${data.partySize}. It is being held for you
      for ${data.expiresInMinutes} minutes.
    </p>`;

  return {
    subject: `A table has opened up at Savora — ${when}`,
    html: shell({
      preheader: `A table for ${data.partySize} is free at ${when}.`,
      heading: "A table has come free",
      content,
      cta: { label: "Claim this table", url: data.claimUrl },
    }),
    text: `A table for ${data.partySize} has opened at ${when}. Claim it: ${data.claimUrl}`,
  };
}

/**
 * A message from the contact form, forwarded to the restaurant's own address.
 *
 * This is deliberately the *only* copy of the message — there is no messages
 * table. An enquiry that is silently kept in nobody's inbox is worse than one
 * that is delivered, so the form is a thin front end over sending an email. In
 * development it lands in `.outbox/`, which means the whole path is reviewable
 * with no provider configured.
 */
export function contactMessage(data: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
      <tr>
        <td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#9c8a7c;width:70px;padding:6px 0;vertical-align:top">From</td>
        <td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1e1815;padding:6px 0">
          ${escapeHtml(data.name)} &lt;<a href="mailto:${escapeHtml(data.email)}" style="color:#c4623f">${escapeHtml(data.email)}</a>&gt;
        </td>
      </tr>
      <tr>
        <td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#9c8a7c;padding:6px 0;vertical-align:top">Subject</td>
        <td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1e1815;padding:6px 0">${escapeHtml(data.subject)}</td>
      </tr>
    </table>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;white-space:pre-wrap;border-top:1px solid #e8dac8;padding-top:20px">${escapeHtml(data.message)}</div>`;

  return {
    subject: `Enquiry: ${data.subject}`,
    html: shell({
      preheader: `${data.name} wrote to the restaurant`,
      heading: data.subject,
      content,
    }),
    // Reply-to is what makes this actionable; the restaurant's own address
    // stays in From so filters and threading still work.
    text: `From: ${data.name} <${data.email}>\nSubject: ${data.subject}\n\n${data.message}`,
  };
}

/** Acknowledgement sent to the person who made the enquiry. */
export function contactAcknowledgement(data: { name: string; subject: string }) {
  const first = data.name.split(" ")[0] ?? data.name;
  const content = `
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0 0 8px">
      Hello ${escapeHtml(first)},
    </p>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a2f28;margin:0">
      Thank you &mdash; your message has come through and one of us will come back to
      you, usually the same day. If it is about a booking that is tonight, please
      telephone instead; we read the book faster than we read email.
    </p>`;

  return {
    subject: "We have your message",
    html: shell({
      preheader: "Thank you for writing to Savora.",
      heading: "We have your message",
      content,
      cta: { label: "Reserve a table", url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/reserve` },
    }),
    text: `Thank you for writing to Savora, ${first}. We usually reply the same day.`,
  };
}

export { formatPrice };
