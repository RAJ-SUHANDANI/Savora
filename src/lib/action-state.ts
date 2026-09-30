/**
 * The shapes that dashboard and account form actions return.
 *
 * ## Why these live here and not in the action modules
 *
 * Every export from a `"use server"` file must be an async function. The rule is
 * not stylistic: Next.js builds a per-module manifest mapping an action id to a
 * function, and it refuses the whole module if it finds anything else. Exporting
 * a plain object from `admin/actions.ts` produced, at runtime and in the
 * browser:
 *
 *     Error: A "use server" file can only export async functions, found object.
 *         at ...app\admin\menu\page\actions.js (server actions loader)
 *
 * That error is raised by the *loader*, so it takes down the entire module —
 * every action in the file at once, not just the one next to the bad export.
 * That is why saving a dish, editing a table, promoting a guest and saving
 * settings all failed together while their pages still rendered perfectly. The
 * pages are server components that never touch the action manifest; only the
 * click does.
 *
 * So the shapes and their idle values live in a plain module with no directive,
 * and the action files import them. Nothing but async functions crosses the
 * "use server" boundary.
 *
 * ## Why there are two shapes
 *
 * They came from two different screens and solve genuinely different problems,
 * so they were never the same type and should not be forced into one.
 *
 * `BannerState` is the dashboard's: a boolean plus a message, with optional
 * per-field errors. The dashboard forms are hand-rolled and read
 * `state.errors?.name` directly, and a success is not a special case — it is
 * the same shape with a different message, so the banner can render success and
 * failure through one code path.
 *
 * `ProfileState` is the account's: a discriminated union on `status`, because
 * those forms are driven by react-hook-form and need to tell "no banner at all"
 * apart from "a banner that is not about any one field". A boolean cannot
 * express that without a magic empty-string message.
 */

/**
 * The dashboard form result: a pass/fail flag, a message, and optional
 * per-field messages.
 *
 * `ok: true` with an empty `message` is the idle state, not a success — the
 * banner is hidden whenever `message` is empty.
 */
export type BannerState = {
  ok: boolean;
  message: string;
  /** Field-level messages keyed by field name, for inline errors. */
  errors?: Record<string, string>;
};

export const BANNER_IDLE: BannerState = { ok: true, message: "" };

/**
 * The account form result.
 *
 * A union rather than a boolean because the four states render differently and
 * conflating them is how "Nothing to report" ends up shown as a green tick.
 */
export type ProfileState =
  /** Nothing to report — the banner is hidden. */
  | { status: "idle" }
  /** Field-level errors, keyed by input name so RHF can place each one. */
  | { status: "error"; message: string; fields?: Record<string, string> }
  /** The write landed. `message` is the confirmation shown in a green banner. */
  | { status: "success"; message: string }
  /** Not attributable to one field — shown above the form. */
  | { status: "banner"; message: string };

export const PROFILE_IDLE: ProfileState = { status: "idle" };

/**
 * The bits of a Zod issue this needs.
 *
 * Structurally typed rather than importing `ZodIssue`, so the helper stays a
 * plain data function and callers can pass `parsed.error.issues` straight from
 * whichever Zod version a given schema happens to resolve to.
 */
export type FieldIssue = { path: PropertyKey[]; message: string };

/**
 * Zod issues -> `{ fieldName: firstMessage }`.
 *
 * Only the first message per field is kept. A `<input>` has one
 * `aria-describedby` slot, so a second message would either be dropped or
 * concatenated into something that reads as one run-on sentence.
 *
 * An issue with an empty path is filed under `"form"`, which the callers render
 * as a banner above the form. That is the right home for a whole-record error
 * like "this field is required" on a schema with no enclosing object, and it is
 * better than dropping the message.
 */
export function fieldsFrom(issues: FieldIssue[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
