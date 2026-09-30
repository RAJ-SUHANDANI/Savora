/**
 * Long-lived PostgreSQL server process.
 *
 * This file is plain ESM JavaScript on purpose: `local-db.ts` spawns it with a
 * bare `node` invocation so that the server keeps running after the CLI command
 * that started it has exited, with no TypeScript loader or build step involved.
 *
 * The `PG_*` constants here mirror those in `local-db.ts`. Both read the port
 * from `SAVORA_PG_PORT`, so that is the single value that must be kept in sync
 * (and it has a default in both places).
 */
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.SAVORA_PG_PORT ?? 5433);
const USER = "savora";
const PASSWORD = "savora";
const DATABASE = "savora";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".postgres-data");
const LOG_FILE = path.join(DATA_DIR, "server.log");
// The cluster lives in its own subdirectory: initdb refuses to run in a
// directory that contains anything else, and this one holds the log and pidfile.
const CLUSTER_DIR = path.join(DATA_DIR, "cluster");

fs.mkdirSync(CLUSTER_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
const log = (msg) => logStream.write(`[${new Date().toISOString()}] ${msg}\n`);

/** Surface unexpected failures in the log rather than dying silently. */
process.on("uncaughtException", (err) => log(`uncaughtException: ${err?.stack ?? err}`));
process.on("unhandledRejection", (err) => log(`unhandledRejection: ${err?.stack ?? err}`));

const isFreshCluster = !fs.existsSync(path.join(CLUSTER_DIR, "PG_VERSION"));

/**
 * Liveness watchdog.
 *
 * PostgreSQL's postmaster shuts the entire cluster down when one of its
 * backends dies on a signal it cannot ignore. On Windows that is not a rare
 * edge case: a console control event (Ctrl+C in any shell sharing the console,
 * a `CTRL_BREAK`, or a job-object teardown of the parent process tree) reaches
 * the server's own process group, a client backend dies with
 * `0xC000013A STATUS_CONTROL_C_EXIT`, and the postmaster then does
 * "terminating any other active server processes" + "received fast shutdown
 * request". The log looks like a clean stop; the database is simply gone, and
 * every page 500s with "Can't reach database server".
 *
 * `spawn({ detached: true })` cannot prevent this, because on Windows a
 * detached child still shares the parent's job object. So the supervisor
 * watches the one thing that matters — can a client still connect? — and
 * restarts the cluster if it cannot. `persistent: true` means the data
 * directory is untouched, so this is a restart, not a reinitialise.
 *
 * Two consecutive failures are required before acting, because a restart
 * during a brief GC pause or a checkpoint would be worse than the problem, and
 * the budget is bounded so a cluster that genuinely cannot start (a corrupt
 * data directory, a port stolen by something else) fails loudly and visibly in
 * the log instead of looping silently forever.
 */
const WATCHDOG_INTERVAL_MS = 3000;
const FAILURES_BEFORE_RESTART = 2;
const MAX_RESTARTS = 20;

let shuttingDown = false;
let consecutiveFailures = 0;
let restarts = 0;
let watchdogTimer = null;

/** One cheap connection attempt. Never throws. */
async function canConnect() {
  const client = new Client({
    host: "127.0.0.1",
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: DATABASE,
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    client.end().catch(() => {});
  }
}

function startWatchdog() {
  watchdogTimer = setInterval(() => {
    void (async () => {
      if (shuttingDown) return;

      if (await canConnect()) {
        consecutiveFailures = 0;
        return;
      }

      consecutiveFailures += 1;
      if (consecutiveFailures < FAILURES_BEFORE_RESTART) return;
      consecutiveFailures = 0;

      if (restarts >= MAX_RESTARTS) {
        if (watchdogTimer) clearInterval(watchdogTimer);
        log(`watchdog: still unreachable after ${restarts} restarts, giving up`);
        return;
      }

      restarts += 1;
      log(`watchdog: database unreachable, restarting (${restarts}/${MAX_RESTARTS})`);
      try {
        await pg.start();
        log(`watchdog: restarted on port ${PORT}`);
      } catch (err) {
        log(`watchdog: restart failed: ${err?.stack ?? err}`);
      }
    })();
  }, WATCHDOG_INTERVAL_MS);

  // Never hold the event loop open on the watcher's account.
  watchdogTimer.unref?.();
}

const pg = new EmbeddedPostgres({
  databaseDir: CLUSTER_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // Force UTF-8 rather than inheriting the machine's code page. Without this,
  // initdb on a Western-European Windows box creates a WIN1252 cluster, and the
  // site's typography (em dashes, curly quotes, £) fails to insert with
  // SQLSTATE 22P05.
  //
  // `--encoding` is the part that must not be dropped. `--locale` is platform
  // specific: Windows has no "C.UTF-8", so we ask for the plain "C" locale,
  // which every platform has, and get deterministic byte ordering on top.
  // (On Linux/macOS this yields a UTF-8 cluster with C collation; on Windows
  // it yields UTF-8 with the system collation. Collation only affects ORDER BY
  // on text, and the one place that matters here — menu sort order — is an
  // explicit integer, not a string comparison.)
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: (message) => logStream.write(`${String(message)}\n`),
  onError: (message) => logStream.write(`ERROR ${String(message)}\n`),
});

async function main() {
  if (isFreshCluster) {
    log(`initialising cluster in ${CLUSTER_DIR} (first run)`);
    await pg.initialise();
    log("cluster initialised");
  }
  await pg.start();
  log(`server started on port ${PORT}`);

  if (isFreshCluster) {
    const client = new Client({ host: "127.0.0.1", port: PORT, user: USER, password: PASSWORD, database: "postgres" });
    await client.connect();
    await client.query(`CREATE DATABASE "${DATABASE}"`);
    await client.end();
    log(`created database "${DATABASE}"`);
  }

  log("ready");
  startWatchdog();

  // Stay alive until signalled; `db:down` sends SIGTERM.
  const stop = async (signal) => {
    shuttingDown = true;
    clearInterval(watchdogTimer);
    log(`received ${signal}, shutting down`);
    try {
      await pg.stop();
      log("stopped cleanly");
    } catch (err) {
      log(`stop error: ${err?.stack ?? err}`);
    }
    logStream.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
}

main().catch((err) => {
  log(`FATAL: ${err?.stack ?? err}`);
  logStream.end();
  process.exit(1);
});
