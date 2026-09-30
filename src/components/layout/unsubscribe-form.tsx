"use client";

/**
 * The unsubscribe form on /newsletter.
 *
 * Kept as a plain `<form method="post">` posting `intent=unsubscribe` rather
 * than a button that calls `DELETE /api/newsletter` with `fetch`. The reason is
 * the same reason the signup form is a plain form: this is the control a reader
 * reaches for *because* they distrust a marketing email, and it is the control
 * most likely to be used on a flaky connection, in a plain reader, or with
 * JavaScript disabled. It works in all three. The hydrated path is an upgrade
 * that keeps the reader in place; the no-JS path redirects to the same page
 * with a flag the server renders.
 */
import { useState } from "react";
import { Loader2, MailMinus } from "lucide-react";

import { cn } from "@/lib/format";

type State =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

export function UnsubscribeForm() {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [email, setEmail] = useState("");

  const sending = state.phase === "sending";
  const errorId = "unsubscribe-error";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;

    setState({ phase: "sending" });
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, intent: "unsubscribe" }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; data?: { unsubscribed?: boolean } }
        | null;

      if (!response.ok) {
        setState({
          phase: "error",
          message: payload?.error ?? "We could not do that. Please try again.",
        });
        return;
      }

      // `unsubscribed: false` means the row was already opted out. Saying
      // "you are unsubscribed" would be true, but saying "we have stopped"
      // would imply we had just done something, which is a small lie that
      // makes a support question harder to answer later.
      setState({
        phase: "done",
        message: payload?.data?.unsubscribed
          ? "Done — we have stopped sending. Sorry to see you go."
          : "That address was not on the list, so there was nothing to stop.",
      });
    } catch {
      setState({
        phase: "error",
        message: "That did not reach us. Please check your connection and try again.",
      });
    }
  }

  if (state.phase === "done") {
    return (
      <p
        className="flex items-start gap-2.5 rounded-xl border border-border-subtle bg-surface-raised px-4 py-3.5 text-sm leading-relaxed text-ink"
        role="status"
        aria-live="polite"
      >
        <MailMinus size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        {state.message}
      </p>
    );
  }

  return (
    <form
      action="/api/newsletter"
      method="post"
      onSubmit={submit}
      className="flex flex-col gap-2 sm:flex-row"
    >
      <input type="hidden" name="intent" value="unsubscribe" />
      <label htmlFor="unsubscribe-email" className="sr-only">
        Email address to unsubscribe
      </label>
      <input
        id="unsubscribe-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        aria-invalid={state.phase === "error"}
        aria-describedby={state.phase === "error" ? errorId : undefined}
        className="field flex-1 !py-2.5 text-sm"
      />
      <button
        type="submit"
        disabled={sending}
        className={cn("btn btn-secondary btn-sm shrink-0 !px-4", sending && "opacity-70")}
      >
        {sending ? (
          <>
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            <span className="sr-only">Removing your address</span>
          </>
        ) : (
          "Unsubscribe"
        )}
      </button>

      {state.phase === "error" ? (
        <p id={errorId} role="alert" className="field-error text-xs sm:basis-auto">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
