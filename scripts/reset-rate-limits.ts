/**
 * Clears the rate-limit counters.
 *
 * The booking endpoint allows a small number of attempts per IP per hour, which
 * is the right default for a public form but makes local testing — and driving
 * the flow with a script or a load test — fail in a way that looks like a bug
 * in the booking logic rather than in the limiter.
 *
 *   npx tsx scripts/reset-rate-limits.ts
 *
 * Safe to run at any time: the table only holds counters, and every entry is
 * recreated on the next request.
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const { rowCount } = await client.query('DELETE FROM "RateLimitCounter"');
    console.log(`[rate-limit] cleared ${rowCount ?? 0} counter(s)`);
  } catch (err) {
    console.error("[rate-limit] could not clear counters:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
