/**
 * Prisma configuration.
 *
 * Prisma 7 loads this file instead of reading `schema.prisma`'s datasource URL
 * directly for the CLI. We point the CLI at the same `.env` file the Next.js
 * app uses so `npm run db:push` and `npm run db:seed` can never disagree with
 * the running application about which database it is talking to.
 */
import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  // Prisma 7 removed `url` from the schema's datasource block; the connection
  // string is supplied here instead, and the runtime client gets it through a
  // driver adapter (see src/lib/db.ts).
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
