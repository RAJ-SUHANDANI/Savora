/**
 * Throwaway probe: does `limit()` — the fixed-window rate limiter — ever settle
 * against the in-process PGlite used in demo mode?
 *
 * It opens the same data directory as the running server, so the server must be
 * stopped first.
 */
import "./enable-demo-db";

import { limit } from "../src/lib/rate-limit";
import { prisma } from "../src/lib/db";

const TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} did not settle in ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
    ),
  ]);
}

async function main() {
  console.log("probe: rate limiter against demo PGlite\n");

  const started = Date.now();
  try {
    const r = await withTimeout(
      limit("probe:key", 10, 900),
      "limit()",
    );
    console.log(`  ok    limit() settled in ${Date.now() - started}ms -> ${JSON.stringify(r)}`);
  } catch (e) {
    console.log(`  HANG  limit() -> ${(e as Error).message}`);
  }

  // Is a plain query on the same client still fine? Distinguishes "PGlite is
  // broken" from "the transaction path specifically is broken".
  try {
    const r = await withTimeout(prisma.$queryRawUnsafe<{ n: number }[]>("SELECT 1 AS n"), "SELECT 1");
    console.log(`  ok    SELECT 1 settled in ${Date.now() - started}ms -> ${JSON.stringify(r)}`);
  } catch (e) {
    console.log(`  HANG  SELECT 1 -> ${(e as Error).message}`);
  }

  // And an interactive transaction that does no locking at all.
  try {
    const r = await withTimeout(
      prisma.$transaction(async (tx) => tx.$queryRawUnsafe<{ n: number }[]>("SELECT 1 AS n")),
      "$transaction",
    );
    console.log(`  ok    $transaction settled -> ${JSON.stringify(r)}`);
  } catch (e) {
    console.log(`  HANG  $transaction -> ${(e as Error).message}`);
  }

  // The advisory lock on its own, which is the one statement limit() has that
  // nothing else in the app does.
  try {
    const r = await withTimeout(
      prisma.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, "probe:bucket"),
      "pg_advisory_xact_lock",
    );
    console.log(`  ok    pg_advisory_xact_lock settled -> ${r}`);
  } catch (e) {
    console.log(`  HANG  pg_advisory_xact_lock -> ${(e as Error).message}`);
  }

  await prisma.$disconnect();
}

void main();
