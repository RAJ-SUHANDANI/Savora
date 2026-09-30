/**
 * Lists the emails the app wrote instead of sending.
 *
 * ## Why this page exists
 *
 * With no `RESEND_API_KEY` and no `SMTP_URL`, `lib/email.ts` falls back to
 * writing each message to `.outbox/` as HTML. Without somewhere to read them,
 * that fallback would be a write-only log: the app would report "email sent" and
 * there would be no way to check what was actually in it. Booking confirmations,
 * reminders and the manage-link email all go through this path during
 * development, so this is how you review them.
 *
 * ## It is a development tool and refuses to exist in production
 *
 * `.outbox/` holds real guest names, addresses and booking details. In a
 * deployed app that directory is not written to — the transport is chosen at
 * startup and a configured provider means the outbox stays empty — but the page
 * itself must not be reachable, because on a misconfigured deployment it would
 * be a directory listing of customer data behind no authentication at all.
 * Hence `notFound()` in production rather than a link hidden somewhere.
 *
 * ## Filenames are validated, not trusted
 *
 * The `?f=` parameter names a file, and the obvious mistake is `path.join` with
 * whatever arrived — which turns a query string into arbitrary file read. Two
 * independent checks stand in the way: the name must match the exact pattern
 * `outboxFilename()` produces, and the resolved path must still be inside
 * `.outbox/` once the base name is stripped of `..` and separators. The second
 * check is the one that actually holds; the first exists so the page fails
 * closed on anything unexpected.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { Mail } from "lucide-react";

import { cn } from "@/lib/format";
import { activeTransport } from "@/lib/email";

export const dynamic = "force-dynamic";

const OUTBOX_DIR = path.join(process.cwd(), ".outbox");

/** Exactly what `outboxFilename()` in `lib/email.ts` produces. */
const FILENAME = /^[\dT:-]+_[a-z0-9-]+_[a-z0-9-]+\.html$/;

/**
 * Resolve a `?f=` value to a readable path inside `.outbox/`, or `null`.
 *
 * `path.basename` discards any directory component the caller supplied, so
 * `../../.env` becomes `.env` and then fails the pattern. The `startsWith` is
 * belt and braces on top of that.
 */
function resolveInOutbox(file: string | undefined): string | null {
  if (!file) return null;
  const name = path.basename(file);
  if (!FILENAME.test(name)) return null;
  const full = path.join(OUTBOX_DIR, name);
  if (!full.startsWith(OUTBOX_DIR + path.sep)) return null;
  return full;
}

type Entry = {
  file: string;
  /** Bytes, shown so a stray non-email file is obvious at a glance. */
  size: number;
  /** `2026-06-01T19-30-00` from the filename, for sorting and display. */
  sent: string;
  /** The subject slug, which is the readable part of the filename. */
  subject: string;
  domain: string;
};

function parseEntry(name: string, size: number): Entry {
  const [stamp, ...rest] = name.replace(/\.html$/, "").split("_");
  const domain = rest.pop() ?? "unknown";
  return {
    file: name,
    size,
    sent: (stamp ?? "").replace("T", " ").replace(/-(\d{2})-(\d{2})-(\d{2})$/, ":$1:$2:$3"),
    subject: rest.join("_").replace(/-/g, " ") || "(no subject)",
    domain,
  };
}

async function listOutbox(): Promise<Entry[]> {
  let names: string[];
  try {
    names = await readdir(OUTBOX_DIR);
  } catch {
    // No directory yet simply means nothing has been written.
    return [];
  }

  const entries = await Promise.all(
    names
      .filter((name) => FILENAME.test(name))
      .map(async (name) => parseEntry(name, (await stat(path.join(OUTBOX_DIR, name))).size)),
  );

  return entries.sort((a, b) => b.sent.localeCompare(a.sent));
}

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { f } = await searchParams;
  const entries = await listOutbox();
  const selected = resolveInOutbox(f);
  const body = selected ? await readFile(selected, "utf8").catch(() => null) : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16 lg:px-10">
      <p className="eyebrow">Development only</p>
      <h1 className="mt-3 font-display text-3xl">Outbox</h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">
        Every email the app would have sent, written to <code>.outbox/</code> instead.
        {activeTransport() === "outbox"
          ? " No provider is configured, so this is where all of them land."
          : " A provider is configured, so this directory is only written to when a send fails."}
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[18rem_1fr]">
        <div>
          {entries.length === 0 ? (
            <p className="rounded-lg border border-border-subtle bg-surface-raised p-5 text-sm text-ink-muted">
              Nothing here yet. Make a booking and its confirmation will appear.
            </p>
          ) : (
            <ul className="space-y-1">
              {entries.map((entry) => (
                <li key={entry.file}>
                  <Link
                    href={`/dev/outbox?f=${encodeURIComponent(entry.file)}`}
                    aria-current={entry.file === f ? "page" : undefined}
                    className={cn(
                      "block rounded-md border px-3 py-2 text-xs transition-colors",
                      entry.file === f
                        ? "border-terracotta/40 bg-terracotta/5"
                        : "border-transparent hover:border-border-subtle hover:bg-surface-raised",
                    )}
                  >
                    <span className="flex items-start gap-2">
                      <Mail size={13} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium capitalize text-ink">
                          {entry.subject}
                        </span>
                        <span className="mt-0.5 block truncate text-ink-subtle">
                          {entry.sent} · {entry.domain}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {body ? (
            <>
              {/*
                `srcDoc` rather than `dangerouslySetInnerHTML`: the file is
                already a complete HTML document with its own styles, and
                inlining it would drag its `<style>` and `<body>` rules into
                this page. An iframe renders it as the browser would see it in
                an inbox, which is the thing worth checking.
              */}
              <iframe
                title="Email preview"
                srcDoc={body}
                className="h-[36rem] w-full rounded-lg border border-border-subtle bg-white"
              />
              <p className="mt-3 text-xs text-ink-subtle">
                Also at <code>.outbox/{f}</code> — open it directly in a browser.
              </p>
            </>
          ) : (
            <div className="flex h-[36rem] items-center justify-center rounded-lg border border-dashed border-border-subtle text-sm text-ink-subtle">
              {f ? "That message could not be read." : "Select a message to read it."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
