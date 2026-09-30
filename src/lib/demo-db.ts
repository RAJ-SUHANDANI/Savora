import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import pg from "pg";

/**
 * Demo mode: a real PostgreSQL, in-process, with no server.
 *
 * ## Why this exists
 *
 * The preview deployment has no `DATABASE_URL`. A Vercel project with no
 * attached Postgres cannot answer a query, so every page that reads the menu or
 * the booking calendar renders an error instead of the site. PGlite is
 * PostgreSQL compiled to WebAssembly: the same SQL, the same migrations and the
 * same seed, with no daemon, no port and no credentials.
 *
 * ## Why PGlite and not a hand-written mock
 *
 * The app makes 29 Prisma delegate calls across 95 call sites. A fake would
 * have to implement all of them, and every one added later would be a second
 * thing to keep in sync. Worse, a fake that has drifted from the schema fails
 * silently — as "the menu is empty" rather than as an error. PGlite answers
 * real SQL, so the schema, the constraints and the queries are the ones the
 * app already ships. The one thing it cannot do is concurrency, which is what
 * the mutex below is for.
 *
 * ## What the driver adapter requires of a pool
 *
 * `PrismaPg` does `poolOrConfig instanceof Pool` and takes a different branch
 * when that is true, so this extends `pg.Pool` rather than duck-typing one. It
 * then calls `pool.query({ text, values, rowMode: "array", types })` and reads
 * `fields[i].dataTypeID` to decide what each column is. Three consequences:
 *
 * - **Rows must be positional tuples.** The adapter indexes by column position.
 *   Returning objects makes every column `undefined`, which reads as "the
 *   database has no data" rather than as an error.
 *
 * - **PGlite's own parsers must be overridden.** PGlite's defaults disagree
 *   with `pg` on int8 (`9007199254740993n` vs `"9007199254740993"`) and on date
 *   (UTC midnight vs local midnight). Both differences are silent, and the date
 *   one is a real off-by-one-day bug in a restaurant that books by the day. The
 *   parsers are therefore resolved through the `types` object the adapter
 *   supplies, which is `pg`'s registry with Prisma's own normalisers on top.
 *
 * - **The parsers must be a real object, not a `Proxy`.** PGlite builds its
 *   table with `{...this.parsers, ...options.parsers}`. Spreading a `Proxy`
 *   invokes `ownKeys`, and a `Proxy` over `{}` reports none — so the spread
 *   contributes nothing and every value falls back to PGlite's defaults. This
 *   is the one detail that fails without raising anything, which is why it is
 *   worth stating outright.
 *
 * `scripts/probe-pglite.mjs` checks the claim rather than asserting it: it runs
 * the same SQL through PGlite and through real `pg`, and exits non-zero if any
 * value or field OID differs.
 */

/** The query shapes `pg` accepts. Only the object form reaches the adapter. */
type QueryConfig = {
  text: string;
  values?: unknown[];
  rowMode?: "array" | "object";
  types?: { getTypeParser: (oid: number, format: unknown) => (raw: string) => unknown };
};

type QueryResult = {
  command: string;
  rowCount: number;
  oid: number;
  fields: Array<{ name: string; dataTypeID: number }>;
  rows: unknown[][];
};

/** A pool client, shaped the way `pg` promises one. */
type DemoClient = {
  query(config: unknown, values?: unknown[]): Promise<unknown>;
  release(err?: Error): void;
  on(event: string, listener: (...args: never[]) => void): DemoClient;
  removeListener(event: string, listener: (...args: never[]) => void): DemoClient;
};

/** TEMPORARY diagnostic. Remove once the sign-in stall is understood. */
let traceSeq = 0;
const traceStart = Date.now();
function trace(event: string, detail: string): void {
  if (!process.env.SAVORA_DEMO_TRACE) return;
  const ms = String(Date.now() - traceStart).padStart(7, " ");
  process.stderr.write(`[demo-lock ${ms}ms #${String(++traceSeq).padStart(4, " ")}] ${event} ${detail}\n`);
}

/**
 * A `pg.Pool` backed by a single PGlite connection.
 *
 * Constructed synchronously and attached to later, because `createClient()` in
 * `src/lib/db.ts` is synchronous — the Prisma client is a module-level export
 * that the whole app imports. Boot therefore runs behind `gate`: every query
 * waits for it, and nothing has to be awaited at the import site.
 */
class PGlitePool extends pg.Pool {
  private instance: PGlite | null = null;

  /** Resolves when the database is migrated and seeded. */
  private gate: Promise<unknown> = Promise.resolve();

  /**
   * Serialises everything, because PGlite has exactly one connection.
   *
   * `pg` hands out pool clients and assumes each owns its own backend, so
   * `$transaction` would otherwise interleave two transactions on one backend —
   * and PostgreSQL has no such thing as two concurrent transactions on one
   * connection, so the second `BEGIN` silently becomes a no-op inside the first.
   * That is not theoretical here: the double-booking guarantee is an exclusion
   * constraint checked inside a transaction, so without this a concurrent
   * booking could be accepted and the guarantee would be a lie.
   *
   * The lock is held for the whole transaction — from `connect()` to
   * `release()` — not per query. Slower, and correct.
   */
  private locked = false;

  private waiting: Array<() => void> = [];

  constructor() {
    // `Pool`'s constructor only copies options: it opens no connections and
    // starts no timers. Every method that would reach the network is
    // overridden below.
    super({ max: 1 });
  }

  /** Hands over the PGlite instance. Called once, by `boot`. */
  attach(instance: PGlite): void {
    this.instance = instance;
  }

  /**
   * Closes the gate. Queries already in flight are unaffected; new ones block
   * until `ready` settles. If the boot failed, so does every query — with the
   * real reason, rather than a timeout.
   */
  seal(ready: Promise<unknown>): void {
    this.gate = ready.catch((e) => {
      throw e;
    });
  }

  private async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      trace("acquire", `instant depth=${this.waiting.length}`);
      return;
    }
    trace("wait", `queued depth=${this.waiting.length + 1}`);
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    trace("handed-off", `depth=${this.waiting.length}`);
  }

  private release(): void {
    const next = this.waiting.shift();
    trace("release", next ? `handing to waiter, depth=${this.waiting.length}` : "idle, depth=0");
    if (next) next();
    else this.locked = false;
  }

  /**
   * Runs one statement and returns it in the shape `pg` would.
   *
   * The adapter always sends values inside the config object, but `pg`'s own
   * signature is `query(text, values)`, so the positional form is honoured too
   * rather than silently running with no parameters.
   */
  private async exec(config: unknown, values?: unknown[]): Promise<QueryResult> {
    const q = (
      typeof config === "string" ? { text: config, values } : config
    ) as QueryConfig;
    if (typeof q?.text !== "string") {
      throw new TypeError(`Demo mode: expected a query string, received ${typeof q?.text}`);
    }

    // Resolved per query because the adapter's parser depends on the query
    // config. `types.builtins` is keyed by NAME and holds an OID, so the OID
    // list is its values, not its keys.
    const parsers: Record<number, (raw: string) => unknown> = {};
    for (const oid of Object.values(pg.types.builtins) as number[]) {
      parsers[oid] = q.types
        ? q.types.getTypeParser(oid, "text")
        : pg.types.getTypeParser(oid, "text");
    }

    const instance = this.instance;
    if (!instance) throw new Error("Demo mode: PGlite was never attached to the pool");

    const result = await instance.query(q.text, q.values ?? [], {
      rowMode: "array",
      parsers,
    });

    const fields = result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID }));
    // `rowMode: "array"` was requested, so the rows are already tuples, but
    // PGlite types them as objects. The object form is only built if something
    // asks for it.
    const tuples = result.rows as unknown as unknown[][];
    const rows = (
      q.rowMode === "object"
        ? tuples.map((row) => Object.fromEntries(fields.map((field, i) => [field.name, row[i]])))
        : tuples
    ) as unknown[][];

    return {
      command: result.command ?? "",
      rowCount: result.rowCount ?? rows.length,
      oid: 0,
      fields,
      rows,
    };
  }

  /**
   * Pool-level query: takes the lock for the duration of the statement.
   *
   * The signature is deliberately loose. `pg.Pool.query` has five overloads
   * covering callback, stream, text and config forms; the adapter only ever
   * uses the config form, and reproducing the rest would be a type-level claim
   * this pool cannot honour. `any` is the honest way to say so.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async query(...args: any[]): Promise<any> {
    const [config, values] = args as [unknown, unknown[] | undefined];
    await this.gate;
    await this.acquire();
    try {
      return await this.exec(config, values);
    } finally {
      this.release();
    }
  }

  /**
   * A transaction connection. The lock is taken here rather than on `BEGIN`,
   * because `startTransaction` calls `connect()` before it issues anything.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async connect(...args: any[]): Promise<any> {
    void args;
    await this.gate;
    await this.acquire();
    let released = false;
    // Arrow functions, so the client closes over the pool without aliasing
    // `this` to a local — which would break the moment the class is refactored
    // and, more to the point, reads as though the pool were a separate object.
    const client: DemoClient = {
      // The lock is already held, so this must not take it again.
      query: (config, values) => this.exec(config, values),
      release: () => {
        if (released) return;
        released = true;
        this.release();
      },
      on: () => client,
      removeListener: () => client,
    };
    return client;
  }

  override async end(): Promise<void> {
    this.release();
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * Where the demo database lives, or `undefined` for an in-memory one.
 *
 * ## In memory during a build
 *
 * `next build` collects page data in parallel worker processes. Each one
 * evaluates `src/lib/db.ts` independently, so each boots its own PGlite — and
 * pointed at a shared directory that is several PostgreSQL backends on one set
 * of files. It fails as `could not create file "base/5/41059": File exists` or
 * as a `TRUNCATE` refused because another session's transaction still holds the
 * table. Build-time data is thrown away the moment the build ends, so persisting
 * it buys nothing; an in-memory database gives each worker its own and removes
 * the conflict entirely.
 *
 * ## On disk otherwise
 *
 * PGlite persists to a directory, and without one every cold start re-runs both
 * migrations and a 298-row seed — slow enough that a reviewer gives up before
 * the first page appears. `/tmp` is the only writable path on a serverless
 * platform, and it is discarded when the instance recycles, which is the
 * behaviour a demo wants: fresh-looking, but not broken.
 */
function dataDir(): string | undefined {
  if (process.env.NEXT_PHASE === "phase-production-build") return undefined;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return "/tmp/savora-pglite";
  }
  return ".pglite";
}

/** Migrations, in the order they must run. Plain SQL, so they run as elsewhere. */
const MIGRATIONS = [
  "20260101000000_init",
  "20260102000000_newsletter_and_rate_limits",
] as const;

/**
 * Applies any migration that has not run yet, and records that it ran.
 *
 * The ledger exists because demo mode re-opens a database that already has
 * data. Without it the migrations are replayed on every warm start, and the
 * first statement in them is `CREATE TYPE "Zone"` — which is not idempotent, so
 * the second start fails with SQLSTATE 42710. That failure is worse than it
 * sounds: the boot runs *before* the gate opens, so the error rejects the gate,
 * and every single query on the pool then rejects with it. A warm database
 * renders as a completely dead site rather than as a migration error.
 *
 * A ledger also means a migration added later is applied to existing demo
 * instances instead of being skipped, which the naive "does the schema exist?"
 * check cannot do.
 */
async function migrate(instance: PGlite): Promise<void> {
  const table = '"_SavoraMigrations"';

  const ledgerExisted = await instance.query<{ present: boolean }>(
    `SELECT to_regclass('${table}') IS NOT NULL AS present`,
  );
  const hadLedger = ledgerExisted.rows[0]?.present === true;

  await instance.exec(
    `CREATE TABLE IF NOT EXISTS ${table} (
       "name"       TEXT PRIMARY KEY,
       "appliedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  // A database that already has the schema but no ledger predates the ledger.
  // Backfill it, otherwise every migration would be replayed against it and the
  // first `CREATE TYPE` would fail. This runs exactly once per database: once
  // the ledger exists it is the only thing consulted.
  if (!hadLedger) {
    const present = await instance.query<{ present: boolean }>(
      `SELECT to_regclass('"Reservation"') IS NOT NULL AS present`,
    );
    if (present.rows[0]?.present === true) {
      await instance.query(
        `INSERT INTO ${table} ("name") SELECT unnest($1::text[]) ON CONFLICT DO NOTHING`,
        [[...MIGRATIONS]],
      );
      return;
    }
  }

  const already = new Set(
    (await instance.query<{ name: string }>(`SELECT "name" FROM ${table}`)).rows.map(
      (r) => r.name,
    ),
  );

  const dir = join(process.cwd(), "prisma", "migrations");
  for (const name of MIGRATIONS) {
    if (already.has(name)) continue;

    let sql: string;
    try {
      sql = await readFile(join(dir, name, "migration.sql"), "utf8");
    } catch {
      throw new Error(
        `Demo mode could not read prisma/migrations/${name}/migration.sql from ${dir}. ` +
          `The SQL is read at runtime, so it has to be traced into the build — ` +
          `check outputFileTracingIncludes in next.config.ts.`,
      );
    }

    // `exec` runs a multi-statement script. `query` runs one statement and
    // would silently apply only the first.
    try {
      await instance.exec(sql);
    } catch (err) {
      throw new Error(
        `Demo mode could not apply migration ${name}: ${
          (err as { message?: string }).message ?? String(err)
        }\n` +
          `A half-applied migration leaves the ledger out of step with the schema. ` +
          `Delete the demo data directory (.pglite, or /tmp/savora-pglite on a ` +
          `serverless platform) to rebuild it from scratch.`,
        { cause: err },
      );
    }
    await instance.query(`INSERT INTO ${table} ("name") VALUES ($1)`, [name]);
  }
}

async function seed(instance: PGlite): Promise<void> {
  // The seed gets its *own* pool over the same PGlite, and that is not
  // incidental. The application pool's gate closes only *after* the seed, so
  // seeding through that pool means every seed query waits on a gate the seed
  // itself is holding shut — a deadlock, and one that presents as a silent
  // hang rather than as an error.
  //
  // Two pools over one connection is two mutexes, which would be a bug if they
  // could overlap. They cannot: this is the only pool with an open gate until
  // the seed is finished, and the seed is finished before the application
  // pool's gate opens.
  const seeder = new PGlitePool();
  seeder.attach(instance);

  // Relative specifiers, not the `@/` alias: this is a dynamic import, and the
  // script that drives the demo runs under `tsx`, which does not read the
  // tsconfig paths.
  const [{ seedDatabase }, { PrismaClient }, { PrismaPg }] = await Promise.all([
    import("../../prisma/seed-data"),
    import("../generated/prisma/client"),
    import("@prisma/adapter-pg"),
  ]);
  const client = new PrismaClient({ adapter: new PrismaPg(seeder) });
  try {
    await seedDatabase(client);
  } finally {
    await client.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// The export
// ---------------------------------------------------------------------------

/**
 * The pool, available synchronously.
 *
 * `PrismaPg` needs a pool at construction time and `createClient()` is
 * synchronous, so the pool exists before the database behind it does. Every
 * query waits on the gate, so the ordering is still correct — this is only
 * synchronising the *handle*, not pretending the work is done.
 *
 * Cached on `globalThis` for the same reason `src/lib/db.ts` caches its client:
 * Next re-evaluates modules on hot reload in development, and without it each
 * reload would boot its own PostgreSQL against the same data directory.
 */
const globalForDemo = globalThis as unknown as { savoraDemoPool?: pg.Pool };

export function demoPool(): pg.Pool {
  if (globalForDemo.savoraDemoPool) return globalForDemo.savoraDemoPool;

  const pool = new PGlitePool();
  globalForDemo.savoraDemoPool = pool;

  const ready = (async () => {
    // `btree_gist` is loaded as a PGlite *extension*, not by the migration's
    // `CREATE EXTENSION`. PGlite ships extensions as bundled WebAssembly that
    // must be named at construction time; a `CREATE EXTENSION` against a
    // database that was never given the bundle fails with `extension
    // "btree_gist" is not available`, and the exclusion constraint beneath it
    // cannot be created.
    const instance = await PGlite.create({
      dataDir: dataDir(),
      extensions: { btree_gist },
    });
    pool.attach(instance);
    await migrate(instance);
    return instance;
  })();

  // The gate closes once the migrations are in place, and only on the seed. If
  // the boot fails, `ready` rejects and so does every query — with the real
  // reason, rather than hanging until the platform kills the request.
  pool.seal(ready.then((instance) => seed(instance)));

  return pool;
}

/** True when the app should run against PGlite instead of `DATABASE_URL`. */
export function isDemoMode(): boolean {
  return process.env.DEMO_DB === "1";
}
