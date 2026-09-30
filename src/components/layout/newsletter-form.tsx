"use client";

/**
 * The footer newsletter signup.
 *
 * ## Why this is a client component at all
 *
 * The form is a plain `<form action="/api/newsletter" method="post">` and that
 * stays true, deliberately. A bare form works before hydration, works if the JS
 * bundle fails, and needs no client state -- which is exactly what you want for
 * something at the bottom of every page of a restaurant's website.
 *
 * The upgrade is narrow: once hydrated, submitting with `fetch` keeps the guest
 * where they are. A no-JS POST navigates to the 303 redirect, which is why the
 * route also answers `accept: text/html` with a `?joined=1` flag. Both paths
 * write the same row; this one just does not throw the reader to the top of the
 * page afterwards.
 *
 * ## The state is three strings, not a reducer
 *
 * `idle` -> `sending` -> `sent` | `error`. There is no fourth case worth
 * modelling, and a discriminated union here would be four branches to keep in
 * sync for one field.
 *
 * ## Failure is shown, not swallowed
 *
 * A 404 or a rate-limit rejection used to be indistinguishable from success from
 * the reader's side: the form vanished and the address was never stored. The
 * error string from the API envelope is rendered next to the input, and the
 * input keeps its value so it can be corrected rather than retyped.
 */
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/format";

type State =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "sent" }
  | { phase: "error"; message: string };

export function NewsletterForm({
  inputId = "footer-email",
  className = "mt-5",
  buttonLabel = "Join",
  successText = "You’re on the list. We’ll be in touch.",
}: {
  /** Unique per instance: the page and the footer both render this form, and two
   *  elements sharing an id breaks the label association and `aria-describedby`. */
  inputId?: string;
  className?: string;
  buttonLabel?: string;
  successText?: string;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [email, setEmail] = useState("");

  const sending = state.phase === "sending";
  const errorId = `${inputId}-error`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;

    setState({ phase: "sending" });
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; fields?: Record<string, string> }
        | null;

      if (!response.ok) {
        setState({
          phase: "error",
          message: payload?.fields?.email ?? payload?.error ?? "We could not sign you up. Please try again.",
        });
        return;
      }
      setState({ phase: "sent" });
    } catch {
      // A dropped connection is not the same as a rejection, and saying "try
      // again" is the only honest response to it.
      setState({ phase: "error", message: "That did not reach us. Please check your connection and try again." });
    }
  }

  if (state.phase === "sent") {
    return (
      <p className={cn("flex items-center gap-2 text-sm text-ink", className)} role="status" aria-live="polite">
        <Check size={16} className="shrink-0 text-terracotta" aria-hidden="true" />
        {successText}
      </p>
    );
  }

  return (
    <form action="/api/newsletter" method="post" onSubmit={submit} className={cn("flex gap-2", className)}>
      <label htmlFor={inputId} className="sr-only">
        Email address
      </label>
      <input
        id={inputId}
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
      <button type="submit" disabled={sending} className="btn btn-primary btn-sm shrink-0 !px-4">
        {sending ? (
          <>
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            <span className="sr-only">Signing you up</span>
          </>
        ) : (
          buttonLabel
        )}
      </button>

      {/*
        Rendered outside the flex row rather than inside the input: a message
        under a two-item flex row would sit beside the button and shift it, and
        the input is `flex-1` so it would visibly narrow. The wrapper keeps the
        row's geometry stable and lets the message take the full column width.
      */}
      {state.phase === "error" ? (
        <p id={errorId} role="alert" className="field-error basis-full text-xs sm:basis-auto">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
