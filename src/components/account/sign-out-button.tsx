"use client";

/**
 * Sign out.
 *
 * A client component for one reason: `signOut` from `next-auth/react` has to
 * clear the cookie in the browser before the redirect, which a server action
 * followed by a redirect would race with. The header's own menu item does the
 * same thing for the same reason.
 *
 * Pending state is held so the button cannot be double-pressed — two sign-outs
 * in flight is harmless but produces a confusing flicker, and a guest who is
 * sure they pressed it deserves to see that it happened.
 */
import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  const [asked, setAsked] = useState(false);

  if (asked) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-ink-muted">Sign out of Savora?</span>
        <button
          type="button"
          // A pending transition already blocks interaction; `disabled` states
          // it explicitly for the focus ring and the cursor.
          disabled={pending}
          onClick={() => startTransition(() => void signOut({ callbackUrl: "/" }))}
          className="btn btn-secondary btn-sm"
        >
          {pending ? "Signing out…" : "Yes, sign out"}
        </button>
        <button
          type="button"
          onClick={() => setAsked(false)}
          disabled={pending}
          className="btn btn-ghost btn-sm"
        >
          Stay
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAsked(true)}
      className={className ?? "btn btn-secondary btn-sm"}
    >
      <LogOut size={14} aria-hidden="true" />
      Sign out
    </button>
  );
}
