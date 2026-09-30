-- Newsletter signups and the rate-limit counter.
--
-- ## Why this file exists
--
-- Both tables were previously created by `prisma/seed.ts` with raw `CREATE
-- TABLE IF NOT EXISTS`. That worked, and it was still wrong:
--
--   * A fresh `prisma migrate deploy` followed by a failed or skipped seed
--     leaves the app without its rate limiter, so every public write endpoint
--     is unmetered. The failure is silent until someone is hammering it.
--   * `prisma db push` *drops* a table it does not know about. Running the
--     documented `db:push` to add an unrelated column therefore deleted
--     `RateLimitCounter` and the `Reservation_no_overlapping_slot_per_table`
--     constraint along with it. Schema changes have to be migrations.
--
-- So the schema lives in `prisma/migrations` like everything else, and the
-- setup script runs `migrate deploy` rather than `db push`.
--
-- ## The column names here are load-bearing
--
-- `RateLimitCounter` is read and written by hand-written SQL in
-- `src/lib/rate-limit.ts`, which names the columns `"key"`, `"count"` and
-- `"resetAt"`. Prisma has no model for this table, so it cannot check them and
-- will not warn about a rename. `resetAt` is `TIMESTAMPTZ` because that is what
-- the code created and what `resetAt.getTime()` in TypeScript is reading.
--
-- ---------------------------------------------------------------------------

-- Someone who asked to hear about seasonal menus.
--
-- Not a `User` row on purpose: a newsletter signup is an address and nothing
-- else, and inventing a password, name and role for someone who has never
-- signed in would make the signup form look like an account. The address is the
-- primary key so signing up twice is an upsert rather than a duplicate row, and
-- it is stored already lower-cased and trimmed by the route -- `Ada@Example.com`
-- and `ada@example.com` are one person.
--
-- `unsubscribedAt` soft-deletes. Deleting the row would mean the very next
-- signup silently re-adds someone who asked not to be contacted, with no record
-- that they ever opted out.
CREATE TABLE "NewsletterSubscriber" (
    "email"          TEXT         NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("email")
);

-- The fixed-window rate-limit counter.
--
-- Keyed by a hash of the caller's identity, so an arbitrary email address or IP
-- cannot exceed PostgreSQL's 63-byte identifier limit. `count` is reset to 0
-- when `resetAt` passes, which is what makes this a *fixed* window rather than a
-- sliding one: one row and one advisory lock instead of a per-request history.
CREATE TABLE IF NOT EXISTS "RateLimitCounter" (
    "key"     TEXT PRIMARY KEY,
    "count"   INTEGER     NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMPTZ NOT NULL
);

-- Lets the sweeper that clears expired windows scan on `resetAt` alone.
CREATE INDEX IF NOT EXISTS "RateLimitCounter_resetAt_idx"
    ON "RateLimitCounter" ("resetAt");
