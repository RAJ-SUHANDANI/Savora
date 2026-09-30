import fs from "node:fs";
import path from "node:path";

/**
 * Environment loading that works in every context this project runs in:
 * `next dev`, `next build`, and standalone scripts under `tsx`.
 *
 * Next.js loads `.env*` itself, but `prisma`, `tsx scripts/*` and the seed do
 * not — so without this, `npm run db:push` would fail while the app worked,
 * which is a miserable thing to debug. The parse mirrors dotenv's precedence:
 * later files override earlier ones, and a real process environment always
 * wins (so Vercel's injected secrets are never clobbered by a local file).
 */
export function loadEnv(cwd = process.cwd()): void {
  const files = [".env.local", ".env"];
  for (const file of files) {
    const full = path.join(cwd, file);
    if (!fs.existsSync(full)) continue;
    for (const rawLine of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (key in process.env) continue; // real env wins
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
