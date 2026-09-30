/**
 * Local PostgreSQL supervisor.
 *
 * Savora targets PostgreSQL in production (Supabase / Railway / Neon). This
 * script removes the need for a paid or externally-hosted database during
 * development by running a *real* PostgreSQL 18 server — the `embedded-postgres`
 * package ships the official server binaries — inside the repo at
 * `.postgres-data/`. Nothing else in the codebase knows this exists: the app
 * only ever sees a normal `DATABASE_URL`.
 *
 * Why real PostgreSQL and not SQLite? The booking logic depends on features
 * that are awkward or silently wrong elsewhere:
 *   * a GiST `tstzrange` EXCLUDE constraint, which is what makes double
 *     bookings *impossible* rather than merely unlikely;
 *   * `SELECT ... FOR UPDATE` row locks inside the table-assignment
 *     transaction, so two guests cannot claim the last table simultaneously;
 *   * partial unique indexes and real advisory locks for rate limiting.
 * Testing against real Postgres means the code you run locally is the code
 * that ships.
 *
 * Usage:
 *   npm run db:up       # start the server (idempotent, returns immediately)
 *   npm run db:down     # stop it
 *   npm run db:status   # report liveness
 *
 * `db:up -- --force` stops leftover processes first, which is the recovery step
 * for a cluster that was killed badly enough to orphan a backend still holding
 * the port. It only ever terminates binaries shipped inside this project.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { Client } from "pg";

export const PG = {
  port: Number(process.env.SAVORA_PG_PORT ?? 5433),
  user: "savora",
  password: "savora",
  database: "savora",
  host: "127.0.0.1",
} as const;

export const DATABASE_URL = `postgresql://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${PG.database}`;

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".postgres-data");
const LOG_FILE = path.join(DATA_DIR, "server.log");
const PID_FILE = path.join(DATA_DIR, "supervisor.pid");

function log(msg: string) {
  process.stdout.write(`[db] ${msg}\n`);
}

function isPortOpen(port: number, host = "127.0.0.1", timeout = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (v: boolean) => {
      socket.destroy();
      resolve(v);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

async function canConnect(): Promise<boolean> {
  try {
    const client = new Client({ ...PG, connectionTimeoutMillis: 2500 });
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

function readPid(): number | null {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Windows-only: postgres processes left behind by a cluster that died badly.
 *
 * A postmaster killed mid-flight (see the watchdog note in `db-server.mjs`)
 * takes its children with it on the next crash-recovery pass, but Windows
 * occasionally leaves one backend alive and still holding the listening socket.
 * The result is the worst possible state: `isPortOpen` says the port is fine,
 * so `up()` reports success, and every client connection is refused.
 *
 * Deliberately matched on **the path inside this project**, not on process name.
 * `postgres.exe` is common enough that killing by name could take out a
 * developer's real PostgreSQL install, or a colleague's, on the same machine.
 *
 * `CommandLine` is the field that actually carries the path: WMI frequently
 * returns an empty `ExecutablePath` for a process, and filtering on it alone
 * silently matches nothing — which is exactly the failure this function exists
 * to prevent. The query avoids `-Filter "Name='...'"` for the same reason the
 * parser is worth avoiding here: embedded quotes inside a `-Command` string are
 * a reliable way to get a syntax error instead of a process list.
 */
async function findOrphanedBackends(): Promise<number[]> {
  if (process.platform !== "win32") return [];

  const script = [
    "Get-CimInstance Win32_Process",
    "Where-Object { $_.Name -eq 'postgres.exe' }",
    "Select-Object ProcessId,CommandLine",
    "ConvertTo-Json -Compress",
  ].join(" | ");

  const raw = await new Promise<string>((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
    });
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out));
  }).catch(() => "");

  if (!raw.trim()) return [];

  // A single result comes back as an object, several as an array.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const rows = (Array.isArray(parsed) ? parsed : [parsed]) as {
    ProcessId?: number;
    CommandLine?: string | null;
  }[];

  // Either the shipped binary, or anything living inside our own cluster
  // directory. Both are unambiguous, and both are inside this project.
  const dataDir = DATA_DIR.toLowerCase().replace(/\\/g, "/");
  const owned = (s: string | null | undefined) => {
    if (!s) return false;
    const p = s.toLowerCase().replace(/\\/g, "/");
    return p.includes("@embedded-postgres") || p.includes(dataDir);
  };

  return rows.filter((r) => typeof r.ProcessId === "number" && owned(r.CommandLine)).map((r) => r.ProcessId as number);
}

/**
 * Force a clean start: stop anything we own, then start.
 *
 * Only ever called behind an explicit `--force`, because it terminates running
 * processes. The pidfile alone is not enough — after a crash the supervisor is
 * gone and the pidfile is stale, so the orphan sweep is the only way to reclaim
 * the port.
 */
export async function force(): Promise<void> {
  await down();

  const orphans = await findOrphanedBackends();
  if (orphans.length === 0) {
    log("no leftover database processes");
    return;
  }

  log(`stopping ${orphans.length} leftover database process(es): ${orphans.join(", ")}`);
  for (const pid of orphans) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }

  // Give the OS a moment to release the listening socket.
  for (let i = 0; i < 25 && (await isPortOpen(PG.port)); i++) {
    await new Promise((r) => setTimeout(r, 200));
  }
  log(await isPortOpen(PG.port) ? "warning: port is still held by another process" : "port released");
}

export async function up(): Promise<void> {
  // An open port is not a working database, and the difference matters.
  // A postmaster killed mid-flight can leave an orphaned backend still holding
  // the listening socket: `isPortOpen` is true, every client connection is
  // refused, and a check on the port alone would cheerfully report success and
  // leave the developer staring at "Can't reach database server" from the app.
  // So the gate is a real connection.
  if (await canConnect()) {
    log(`already listening on ${PG.port} — nothing to do`);
    return;
  }

  if (await isPortOpen(PG.port)) {
    log(`port ${PG.port} is open but nothing will answer on it.`);
    log("that is usually a leftover process from a database that was killed badly.");
    log("run `npm run db:up -- --force` to stop it and start clean,");
    log("or set SAVORA_PG_PORT to a different port.");
    throw new Error(`Port ${PG.port} is held by a process this project does not control.`);
  }

  const pid = readPid();
  if (pid && !pidAlive(pid)) {
    log("clearing stale supervisor pidfile");
    fs.rmSync(PID_FILE, { force: true });
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // `detached` puts the server in its own process group so it survives this
  // command exiting (and, on Windows, so Ctrl-C in the terminal running
  // `npm run db:up` does not take the database down with it). It is plain
  // JavaScript, launched with a bare `node`, so no TypeScript loader is needed
  // in the detached process.
  const child = spawn(process.execPath, [path.join(ROOT, "scripts", "db-server.mjs")], {
    detached: true,
    stdio: "ignore",
    cwd: ROOT,
    env: { ...process.env, SAVORA_PG_PORT: String(PG.port) },
  });
  child.unref();
  if (child.pid) fs.writeFileSync(PID_FILE, String(child.pid));

  log("starting PostgreSQL (first run initialises the cluster, ~20s)…");
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await canConnect()) {
      log(`ready — ${DATABASE_URL}`);
      return;
    }
    const supervisor = readPid();
    if (supervisor && !pidAlive(supervisor)) break; // crashed
    await new Promise((r) => setTimeout(r, 400));
  }

  throw new Error(
    `PostgreSQL did not become reachable on port ${PG.port}. Check ${LOG_FILE} for details.`,
  );
}

export async function down(): Promise<void> {
  const pid = readPid();
  if (!pid || !pidAlive(pid)) {
    log("not running");
    return;
  }
  try {
    // Ask nicely first so the server checkpoints and shuts down cleanly.
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 50; i++) {
    if (!pidAlive(pid)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (pidAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
  fs.rmSync(PID_FILE, { force: true });
  log("stopped");
}

export async function status(): Promise<void> {
  const open = await isPortOpen(PG.port);
  const usable = await canConnect();
  const pid = readPid();
  log(`supervisor pid: ${pid && pidAlive(pid) ? pid : "none"}`);
  log(`port ${PG.port}: ${open ? "open" : "closed"}`);
  log(`connection: ${usable ? "ok" : "failing"}`);
  log(DATABASE_URL);
  if (!usable) process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  const cmd = process.argv[2] ?? "up";
  // `--force` is only meaningful on `up`, where it has to be able to reclaim a
  // port before the normal "already running" check.
  const useForce = process.argv.includes("--force");
  void (async () => {
    if (cmd === "up") {
      if (useForce) await force();
      await up();
    } else if (cmd === "down") await down();
    else if (cmd === "status") await status();
    else throw new Error(`unknown command "${cmd}" (expected up | down | status | force)`);
  })().catch((err) => {
    process.stderr.write(`[db] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
