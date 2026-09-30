/**
 * Rate limiting.
 *
 * Reservations are the one public endpoint worth attacking: each hit can cost
 * the restaurant a table and an email, so it is limited per IP.
 *
 * Implementation note: a process-local map is *not* sufficient in production,
 * where the app runs as many serverless instances. `limit()` therefore uses
 * PostgreSQL as the shared store — `pg_advisory_xact_lock` serialises the
 * read-modify-write of the counter row, so N concurrent instances cannot each
 * see "3 requests" and all let a 4th through. It costs one small transaction per
 * request, which is negligible next to the availability query, and it needs no
 * paid Redis.
 */

import { prisma } from "./db";

/**
 * Counters live in the `RateLimitCounter` table, created on demand. There is no
 * in-process cache in front of it: caching the counter would defeat the point,
 * since the whole reason this uses PostgreSQL rather than a `Map` is that the
 * answer has to be the same on every instance.
 */
type CounterRow = {
  key: string;
  count: number;
  resetAt: Date;
};

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets; surfaced in the Retry-After header. */
  resetIn: number;
};

/**
 * Fixed-window counter.
 *
 * A fixed window is chosen over a sliding one deliberately: it needs one row
 * and one lock, and for the purpose here — stopping a spam script — the
 * theoretical 2x burst at a window boundary is irrelevant.
 */
export async function limit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  return prisma.$transaction(async (tx) => {
    // Hash the key so arbitrary user input cannot blow past Postgres' 63-byte
    // identifier limit or collide with another bucket's name.
    const bucket = `rl:${hashKey(key)}`;
    const now = Date.now();

    // Two details here that are easy to get wrong, and both fail at runtime:
    //   * `$executeRawUnsafe`, not `$queryRawUnsafe` — `pg_advisory_xact_lock`
    //     returns `void`, and the query path tries to deserialise the result
    //     into a row, which fails on a void column. The execute path does not
    //     map columns, which is all a statement whose only job is to block needs.
    //   * Parameters are variadic, not an array. Passing `[bucket]` binds one
    //     value that is itself a JS array, and Postgres then reports that the
    //     bind message supplies the wrong number of parameters.
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, bucket);

    const rows = await tx.$queryRawUnsafe<CounterRow[]>(
      `SELECT "key", "count", "resetAt" FROM "RateLimitCounter" WHERE "key" = $1 FOR UPDATE`,
      bucket,
    );

    const existing = rows[0];

    // Missing row, or the previous window has expired -> start a fresh window.
    if (!existing || existing.resetAt.getTime() <= now) {
      const resetAt = new Date(now + windowSeconds * 1000);
      await tx.$executeRawUnsafe(
        `INSERT INTO "RateLimitCounter" ("key", "count", "resetAt")
         VALUES ($1, 1, $2)
         ON CONFLICT ("key") DO UPDATE SET "count" = 1, "resetAt" = $2`,
        bucket,
        resetAt,
      );
      return {
        success: true,
        limit: max,
        remaining: max - 1,
        resetIn: windowSeconds,
      };
    }

    const count = existing.count + 1;
    if (count > max) {
      return {
        success: false,
        limit: max,
        remaining: 0,
        resetIn: Math.max(1, Math.ceil((existing.resetAt.getTime() - now) / 1000)),
      };
    }

    await tx.$executeRawUnsafe(
      `UPDATE "RateLimitCounter" SET "count" = $2 WHERE "key" = $1`,
      bucket,
      count,
    );

    return {
      success: true,
      limit: max,
      remaining: max - count,
      resetIn: Math.max(1, Math.ceil((existing.resetAt.getTime() - now) / 1000)),
    };
  });
}

/** FNV-1a, rendered base36. Short, stable, and collision-resistant enough here. */
function hashKey(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is a comma-separated chain appended to by each proxy; the
 * left-most entry is the original client. On Vercel `x-vercel-forwarded-for` is
 * the authoritative header. This is used for rate limiting only — never for
 * authorisation, which would be spoofable.
 */
export function clientIp(headers: Headers): string {
  const forwarded =
    headers.get("x-vercel-forwarded-for") ??
    headers.get("x-forwarded-for") ??
    headers.get("x-real-ip") ??
    "unknown";
  return forwarded.split(",")[0]!.trim();
}
