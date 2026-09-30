-- Rate-limit buckets.
--
-- Created outside the Prisma migration because the table is infrastructure
-- rather than domain data: it is created on first use by src/lib/rate-limit.ts
-- and can be dropped at any time without data loss.
CREATE TABLE IF NOT EXISTS "RateLimitCounter" (
    "key"     TEXT PRIMARY KEY,
    "count"   INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMPTZ NOT NULL
);

-- Supports the periodic sweep of expired windows.
CREATE INDEX IF NOT EXISTS "RateLimitCounter_resetAt_idx" ON "RateLimitCounter" ("resetAt");
