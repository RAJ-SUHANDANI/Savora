/**
 * Turns on demo mode.
 *
 * This is a separate module because of how module evaluation order works. In
 * the CommonJS output `tsx` produces, every `import` becomes a `require` and
 * all of them are emitted before any statement in the importing file. So
 * `process.env.DEMO_DB = "1"` written above the imports in a script runs
 * *after* `src/lib/db.ts` has already been evaluated — and `db.ts` reads the
 * variable at module scope, when it builds the Prisma client.
 *
 * A side-effect import is evaluated in source order under both CommonJS and
 * ES modules, so putting this first works in either.
 */
import { loadEnv } from "./load-env";

// `tsx` does not load `.env` the way `next dev` does, so a script that only
// sets `DEMO_DB` would still see an unset `DATABASE_URL` — or, worse, one
// inherited from the developer's shell pointing somewhere unexpected. Loading
// the project's own env files first means the script and the app agree.
loadEnv();

// Set *after* `loadEnv()`, which deliberately never overwrites a key that is
// already present, so the committed `.env` cannot quietly re-enable real-Postgres
// mode here.
process.env.DEMO_DB = "1";
