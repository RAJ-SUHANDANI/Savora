/**
 * Strips a UTF-8 BOM and normalises line endings in a file, in place.
 *
 * PowerShell's `Set-Content -Encoding UTF8` writes a BOM, and a BOM at the start
 * of migration.sql makes PostgreSQL reject the file. It also means any tooling
 * that reads these files as UTF-8 sees a stray U+FEFF.
 *
 * Usage: npx tsx scripts/strip-bom.ts <file> [...]
 */
import fs from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: tsx scripts/strip-bom.ts <file> [...]");
  process.exit(1);
}

for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  const cleaned = original.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (cleaned === original) {
    console.log(`unchanged  ${file}`);
  } else {
    fs.writeFileSync(file, cleaned, "utf8");
    console.log(`cleaned    ${file}`);
  }
}
