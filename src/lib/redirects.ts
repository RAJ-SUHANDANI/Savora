/**
 * Redirect sanitising for `?callbackUrl=`.
 *
 * Auth pages take a "where were you trying to go?" parameter and hand it to
 * `signIn({ redirectTo })`. Passed through unchecked, that is an open redirect
 * waiting to happen: `?callbackUrl=https://evil.test` would move a visitor who
 * has just typed their password onto a convincing copy of the site. It is the
 * most abused parameter in any sign-in flow.
 *
 * The rule is deliberately blunt rather than clever. A value survives only if
 * it is a plain, same-origin path into an area of the site a signed-in visitor
 * could legitimately be sent to. Everything else falls back to a known-good
 * path. There is no legitimate case here for accepting anything more, so there
 * is nothing to be gained by being permissive.
 *
 * The three rejections that matter, in the order they are checked:
 *
 *   1. A control character anywhere. Browsers strip tabs, newlines and NULs
 *      before parsing a URL, so a value built out of them can look
 *      path-absolute to this function and still be protocol-relative to the
 *      browser. Normalising first would turn the check into a lie; refusing is
 *      honest.
 *   2. Anything that is not `/`-rooted, which rejects `https:evil.test`,
 *      `mailto:…` and `javascript:…` in a single comparison.
 *   3. `//host` and any backslash, which browsers read as protocol-relative. A
 *      single leading slash does not rule those out on its own.
 *
 * Kept out of the `"use server"` action modules on purpose: a module carrying
 * that directive may only export async functions, and this is a pure helper.
 */

/**
 * Only these destinations are ever valid after signing in. `/account` and
 * `/admin` are the defaults; the rest are the pages that pass a `callbackUrl`
 * in the first place.
 */
const ALLOWED_ROOTS = ["/account", "/admin", "/reserve", "/menu"] as const;

/** C0 controls plus DEL — invisible, and stripped by browsers before parsing. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/** True when `path` is inside one of the roots we are willing to redirect to. */
function isAllowedPath(path: string): boolean {
  return ALLOWED_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

export function safeRedirect(target: string | null | undefined, fallback = "/account"): string {
  if (typeof target !== "string") return fallback;

  const value = target.trim();
  if (!value) return fallback;

  if (CONTROL_CHARS.test(value)) return fallback;

  // Must be path-absolute. This is what rejects absolute and scheme URLs.
  if (!value.startsWith("/")) return fallback;

  // Protocol-relative, plus the backslash spellings browsers normalise to `/`.
  if (value.startsWith("//") || value.includes("\\")) return fallback;

  // A `?` or `#` cannot change the origin, so a query string is safe to keep —
  // but the *path* in front of it still has to be one of ours.
  if (value.includes("?") || value.includes("#")) {
    return isAllowedPath(value.split(/[?#]/, 1)[0]) ? value : fallback;
  }

  return isAllowedPath(value) ? value : fallback;
}
