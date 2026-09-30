# Savora — project state

## Stack (pinned)
- Next.js 16.3.7 (App Router, src/) — **Turbopack is on by default in 16**; there is no
  `--no-turbopack` and no webpack config. Turbopack caches compiled routes, so a
  server-action id captured before an edit can be stale by the time it is posted.
- React 19.3.0, TypeScript, Tailwind CSS v4 (CSS-first `@theme`, no tailwind.config.js)
- Prisma 7.10.0 **driver adapter** (`@prisma/adapter-pg`) — Rust-free client
- next-auth 5.0.0-beta.32 (Auth.js App Router)
- framer-motion 13, zustand 5, react-hook-form 7 + zod 4, recharts 3, canvas-confetti

## Database — free & local
`npm run db:up` boots a **real PostgreSQL 18.4** via `embedded-postgres`
(no Docker, no admin, no cost). Detached process, pidfile in `.postgres-data/`.
- `npm run db:up | db:down | db:status`, `db:up -- --force` to recreate a broken cluster
- `DATABASE_URL=postgresql://savora:savora@127.0.0.1:5433/savora`
- Cluster forced to `--encoding=UTF8 --locale=C` (Windows default is WIN1252 and
  cannot store the site's typography — see `scripts/db-server.mjs`).

### `prisma db push` is a trap — do not reintroduce it
It is **not** in `package.json` any more, and that is deliberate. Prisma's schema
cannot express three things this project relies on, so `push` sees them as drift
and "fixes" them by deleting them:

| What `db push` wanted to do | What that costs |
| --- | --- |
| `DROP TABLE "RateLimitCounter"` | every public write endpoint becomes unmetered |
| `ALTER TABLE "Reservation" ALTER COLUMN "slot" DROP DEFAULT` | the `GENERATED ALWAYS` double-booking guarantee |
| `DROP INDEX "Reservation_date_status_idx"` | slower availability scans |
| `SET DATA TYPE jsonb` on `RestaurantSettings.openingHours` | Prisma 7 cannot type `jsonb` at all |

Schema changes go through migrations: `db:migrate` (deploy) and
`db:migrate:make` (author). `db:diff` prints the additive SQL without applying it.
`setup` = `db:up && db:generate && db:migrate && db:seed && verify:constraint`.

## The `"use server"` rule
A `"use server"` module may export **only async functions**. Types are fine
(erased). Anything else — `export const IDLE = {...}`, a re-export, a non-`async`
function — makes Next's server-actions loader reject **the whole file**:

```
Error: A "use server" file can only export async functions, found object.
```

The loader builds one manifest per file, so every action in it dies at once while
every page still renders 200 — the pages are server components and never touch the
manifest. That is how saving a dish, editing a table, promoting a guest and saving
settings all broke together and looked like six unrelated bugs.

`npm run check:actions` enforces this and **exits 1**. It runs as part of
`npm run check`, which `npm run build` runs first. Action result types and idle
values live in `src/lib/action-state.ts` for exactly this reason.

## Verification
- `npm run check` — `tsc --noEmit` + `eslint src scripts --max-warnings 0` + the
  server-action export check. This is the gate; run it before claiming anything works.
- `npm run verify:constraint` — 8 checks on the double-booking guarantee, asserts
  SQLSTATE `23P01` rather than "it threw", and the concurrency check uses **five
  separate connections** (`pg` queues a second `query()` on a busy client, so one
  client would serialise the race and prove nothing).
- `npm run check:reservations` — drives `PATCH /api/reservations/:id` over HTTP and
  asserts against the row in PostgreSQL, not the response. A status code is not
  evidence: the route returns 200 whether or not anything moved.
- `npm run build` — runs `check` first.

**All three exit non-zero on failure.** A test that cannot fail is worse than no
test, because a green run gets reported as proof while proving nothing.

## Traps already hit (do not regress)
1. `package.json` written with a **UTF-8 BOM** by PowerShell → JSON parse failure.
   Use `scripts/strip-bom.ts` after PowerShell writes.
2. Prisma 7 **rejects `url` in schema.prisma**. Connection lives in
   `prisma.config.ts` (`datasource.url`).
3. Prisma 7 **omits `Unsupported()` fields from generated types entirely** —
   `jsonb` (`RestaurantSettings.openingHours`) and `tstzrange` (`Reservation.slot`)
   are invisible to the client. jsonb is handled in `src/lib/settings-repo.ts`;
   `slot` is `GENERATED ALWAYS` so PostgreSQL owns it.
4. `tsx` does not load `.env` → any script touching Prisma needs
   `import "dotenv/config"` as its first line, or it silently targets port 5432.
5. `tsx` emits **CJS here**, so top-level `await` is a transform error. Wrap in
   `async function main()` and call `void main()`.
6. npm 11 blocks lifecycle scripts → `npm install-scripts approve <pkg>` needed for
   `@embedded-postgres/windows-x64` (symlink hydration), prisma engines, esbuild.
7. PowerShell 5.1 reads BOM-less `.ps1` as ANSI, so an em-dash in a script
   becomes a smart quote and the file fails to parse with a bogus
   "string is missing the terminator". Keep probe scripts ASCII-only.
8. Launch long-lived dev processes through **WMI**
   (`Invoke-CimMethod -ClassName Win32_Process -MethodName Create`). A detached
   child stays in the harness's Windows job object and is killed with `0xC000013A`.
   Killing a server: match the *port*, not the command line — `next start` runs as
   `next" start` and a `-match 'next start'` filter silently misses it.
9. **Never render a React-managed `<script>` inside `<head>`.** React hydrates the
   head with a forward cursor that skips DOM nodes whose *tag* it is not looking
   for, but claims one positionally when the tag matches. A browser extension that
   injects a single `<script>` into the head is therefore claimed as *our* first
   script, ours is claimed as the second, and both come back as attribute
   mismatches. Because the throw happens in the root layout, React attaches **no
   event handlers anywhere**: pages paint perfectly and every button is inert.
   That is what killed the admin dashboard's confirm/seat/cancel. The theme script
   and the JSON-LD now live in the body for this reason — the theme script first,
   where a sync inline script still runs before the first paint, and the JSON-LD
   last, since it reads the same from the body. Do not move either into the head.

## The double-booking guarantee
`Reservation.slot` is `tstzrange GENERATED ALWAYS AS (tstzrange(startsAt,endsAt,'[)')) STORED`
plus a GiST `EXCLUDE USING gist ("tableId" WITH =, "slot" WITH &&)` filtered to
`PENDING, CONFIRMED, SEATED`. `CANCELLED` and `NO_SHOW` are deliberately excluded —
`reconcilePastBookings` writes `NO_SHOW` in bulk, so including it would make every
table that ever had a no-show permanently unbookable.

Advisory availability in `src/lib/availability.ts`; `createReservation` retries on
SQLSTATE 23P01 with a different table. It also retries on **40P01** (deadlock) and
**40001** (serialization failure) — five transactions inserting overlapping ranges
into one GiST index occasionally deadlock instead of one cleanly losing, and
treating only 23P01 as retryable let that reach the guest as a raw 500. The shared
predicate is `isRetryableConflict()` in `src/lib/db.ts`; both the new-booking path
and `PATCH /api/reservations/:id` use it, the latter to answer 409 rather than 500.
`verify:constraint` now prints the actual rejection codes on failure, so an
intermittent one is diagnosable instead of just "wrong reason".

## Seed
`npm run db:seed` — 11 tables/52 covers, 26 dishes, 298 reservations
(115 upcoming / 150 completed / 33 no-show), 7 customers, 4 favourites.
- admin@savora.example / savora-admin
- guest@savora.example / savora-guest

Seed owns **data**, not **schema**. `RateLimitCounter` and `NewsletterSubscriber`
are migrations. Newsletter rows survive a re-seed deliberately — they are real
addresses, not demo data.

## Commands
`npm run dev` (needs `db:up` first) · `check` · `build` · `start`
`db:up` `db:down` `db:status` `db:generate` `db:migrate` `db:migrate:make` `db:diff`
`db:seed` `db:reset` `setup` `verify:constraint` `check:actions` `check:reservations`
`cron` · `rate-limits:reset`

`npm run cron` is the primary way to send reminders — it calls `sendDueReminders()`
and `reconcilePastBookings()` directly, no HTTP and no secret. `/api/cron/reminders`
exists for hosted schedulers and is guarded by `CRON_SECRET` (constant-time),
falling back to requiring an admin session when unset.

## Timezone — read before touching any date code
`Settings.timezone` is the **only** thing that turns a wall-clock booking into an
instant. `openingHours` are local wall-clock strings; `startsAt`/`endsAt` are
`timestamptz`. Converting a booked time by appending `Z`, or formatting an instant
in the server's local zone, silently shifts every sitting by the UTC offset (British
Summer Time is +1, so this is a real one-hour bug in summer, not a theoretical
one). Go through `src/lib/settings.ts` and the `zoned` helpers. The zone is
operator-configurable — it is data, not a constant.

## Writes
- Reservations are **never** written by a server action. `PATCH /api/reservations/:id`
  owns that path because it owns the collision-safe write. The dashboard calls the
  route; a second implementation would be a second thing nobody tests.
- `saveSettings` is the only settings write. Settings are read through the cached
  `getSettings()`.
- Every admin action re-checks `requireAdmin()`. The `/admin` layout guard is a
  redirect, not authorisation — a server action is a public HTTP endpoint.

## Brand
Savora — terracotta `#C4623F` on warm cream `#FDF8F3`, espresso ink `#1E1815`.
Fraunces display + Inter body. Dark mode is a designed palette via `.dark`.
All tokens in `src/app/globals.css` `@theme`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
