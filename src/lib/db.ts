import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

import { demoPool, isDemoMode } from "./demo-db";

/**
 * A single Prisma client for the whole server process.
 *
 * Two things matter here:
 *
 * 1. **The global cache.** Next.js dev mode re-evaluates modules on every hot
 *    reload. Without caching on `globalThis`, each reload would open a fresh
 *    connection pool, and the local PostgreSQL server (or any managed one)
 *    would eventually refuse connections. In production the extra client would
 *    also leak memory across serverless invocations.
 *
 * 2. **The driver adapter.** Prisma 7 no longer ships a Rust query engine. It
 *    talks to PostgreSQL through `PrismaPg`, a thin adapter over `pg`. This is
 *    what lets the same client work against the local embedded server, Supabase,
 *    Railway, or Neon with nothing but a different `DATABASE_URL`.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  // Demo mode is checked first, and deliberately ignores `DATABASE_URL`. The
  // committed `.env` points at `127.0.0.1:5433`, which exists on a developer's
  // machine and nowhere else: a preview deployment that trusted it would build
  // fine and then time out on every query.
  const adapter = isDemoMode()
    ? new PrismaPg(demoPool())
    : new PrismaPg({ connectionString: requiredDatabaseUrl() });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : // Never log queries in production: they can contain guest emails and
          // phone numbers, and the volume makes the logs unreadable anyway.
          ["error"],
  });
}

function requiredDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env, run `npm run db:up` to start the " +
        "local database, or set DEMO_DB=1 to run against the in-process demo database.",
    );
  }
  return connectionString;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Prisma error codes this app reacts to by name. Kept in one place so the
 * booking logic can distinguish "somebody else took that table" (retry) from
 * "your input was wrong" (400) without stringly-typed comparisons.
 */
export const PG_ERROR = {
  /** EXCLUDE constraint fired: an overlapping booking exists for this table. */
  EXCLUSION_VIOLATION: "23P01",
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  NOT_NULL_VIOLATION: "23502",
  /**
   * Two transactions inserting overlapping ranges into the same GiST index can
   * deadlock rather than have one cleanly lose. Observed intermittently under
   * the 5-way race in `verify:constraint` — the guarantee held (still exactly
   * one winner) but the losers were not all reported as `23P01`.
   */
  DEADLOCK_DETECTED: "40P01",
  /** Transaction rolled back to break a serialization conflict. Also transient. */
  SERIALIZATION_FAILURE: "40001",
} as const;

/**
 * The SQLSTATE for an error, from wherever it actually is.
 *
 * Prisma re-wraps driver errors, so the code on the thrown object is a *Prisma*
 * code and the SQLSTATE is buried: an exclusion-constraint rejection arrives as
 * `code: "P2039"` with `23P01` at `meta.driverAdapterError.cause.code`. Reading
 * only the outer `code` therefore never matched a PostgreSQL code at all, which
 * made the retry below unreachable — a contested booking surfaced as a 500
 * instead of being retried against another table, which is the exact failure the
 * retry exists to prevent.
 *
 * A raw `pg` error has no such wrapper and puts the SQLSTATE on `code` directly,
 * so both shapes have to be handled. The driver's own code is preferred over the
 * outer one because the outer one is a re-labelling of it.
 */
export function pgErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;

  // Prisma's own wrapper first: its `code` is a re-labelling, and the
  // SQLSTATE underneath is the thing every caller is actually testing for.
  const meta = (err as { meta?: unknown }).meta;
  if (meta && typeof meta === "object") {
    const adapter = (meta as { driverAdapterError?: unknown }).driverAdapterError;
    if (adapter && typeof adapter === "object") {
      const cause = (adapter as { cause?: { code?: unknown } }).cause;
      if (cause && typeof cause.code === "string") return cause.code;
    }
  }

  // A raw `pg` error has no wrapper and puts the SQLSTATE on `code` directly.
  const outer = (err as { code?: unknown }).code;
  if (typeof outer === "string") return outer;

  // Some errors chain through `cause` rather than through Prisma's `meta`.
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }

  return undefined;
}

/**
 * True when the write lost a race for a table and is worth re-reading and
 * retrying against a different one. All three are transient and all three mean
 * "somebody else got there first" to a guest, so all three get the same
 * treatment: re-read the day, pick the next-best table, try again. Treating only
 * `23P01` as retryable would let the occasional deadlock reach the guest as a
 * raw database error.
 */
export function isRetryableConflict(err: unknown): boolean {
  const code = pgErrorCode(err);
  return (
    code === PG_ERROR.EXCLUSION_VIOLATION ||
    code === PG_ERROR.DEADLOCK_DETECTED ||
    code === PG_ERROR.SERIALIZATION_FAILURE
  );
}
