/**
 * Seeds the database with a coherent, realistic dataset.
 *
 * The data itself lives in `seed-data.ts` so that demo mode can reuse it
 * against an in-process PGlite. This file is only the command-line wrapper:
 * it reads `DATABASE_URL`, connects, and hands over.
 *
 * Note the `dotenv/config` import: `tsx` does not load `.env` the way Next.js
 * does, and without it `DATABASE_URL` would be undefined and the `pg` adapter
 * would silently fall back to localhost:5432 -- connecting to the wrong port
 * with a confusing "connection refused" rather than a clear config error.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

import { seedDatabase } from "./seed-data";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Is .env present? Try `npm run db:up`.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

seedDatabase(prisma)
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
