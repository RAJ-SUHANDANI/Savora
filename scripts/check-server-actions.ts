/**
 * Checks that every `"use server"` module exports nothing but async functions.
 *
 *   npx tsx scripts/check-server-actions.ts
 *
 * ## Why this script exists
 *
 * `src/app/admin/actions.ts` exported a plain object:
 *
 *     export const IDLE: ActionState = { ok: true, message: "" };
 *
 * Next.js builds one action manifest per `"use server"` file, and the loader
 * rejects the **whole module** the moment it finds an export that is not an
 * async function:
 *
 *     Error: A "use server" file can only export async functions, found object.
 *         at ...app\admin\menu\page\actions.js (server actions loader)
 *
 * The important part is "the whole module". Every action in the file died at
 * once — saving a dish, editing a table, promoting a guest, saving settings —
 * while every page still rendered perfectly, because a page is a server
 * component that never touches the action manifest. Only the click does.
 *
 * That combination is what made it hard to see: the build passed, every route
 * returned 200, and the admin overview rendered a full set of numbers. The
 * failure was only ever visible in a browser, on a button, and it presented as
 * six unrelated bugs rather than one.
 *
 * So it is checked here, and it exits non-zero.
 *
 * ## What counts as legal
 *
 *   export async function f() {}    legal
 *   export type T = ...              legal — types are erased, never registered
 *   export interface I {}            legal — same reason
 *
 *   export function f() {}           ILLEGAL — not async
 *   export const x = ...             ILLEGAL — a value, not a function
 *   export { x } from "./y"          ILLEGAL — an arbitrary re-export
 *   export default ...               ILLEGAL — Next cannot register it
 *
 * `export * from` is illegal for the same reason as a named re-export: the
 * module would be registering functions it does not declare and cannot vouch
 * for.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Collect every `.ts`/`.tsx` under a directory. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * A file is a server-action module if its *first* statement is the directive.
 *
 * Position matters: `"use server"` is only a directive at the top of the file.
 * The same string further down is an ordinary expression, and treating it as a
 * directive would send this check looking for illegal exports in files that have
 * none.
 */
function isActionModule(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  if (!first) return false;
  if (!ts.isExpressionStatement(first)) return false;
  if (!ts.isStringLiteral(first.expression)) return false;
  return first.expression.text === "use server";
}

/** Report every non-async-function export, with a reason. */
function illegalExports(source: ts.SourceFile): string[] {
  const problems: string[] = [];

  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const exported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

    if (ts.isFunctionDeclaration(statement)) {
      // `async` is the whole requirement. A non-async export is rejected by the
      // loader even though the function would return a promise.
      if (exported && !statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
        const name = statement.name?.text ?? "<anonymous>";
        problems.push(`export function ${name}() — must be declared \`async\``);
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      if (!exported) continue;
      const names = statement.declarationList.declarations
        .map((d) => d.name.getText(source))
        .join(", ");
      problems.push(
        `export const ${names} — a "${"use server"}" file may only export async functions. ` +
          `Move the value to a plain module and import it.`,
      );
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      // Erased at compile time, so it is never registered as an action.
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      if (!exported && !statement.modifiers?.length) {
        // `export ... from` has no `export` modifier of its own.
      }
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const names = statement.exportClause.elements.map((e) => e.getText(source)).join(", ");
        problems.push(
          `export { ${names} } — a "${"use server"}" file may only export async functions. ` +
            `Re-exports are not registered as actions.`,
        );
      } else {
        problems.push(
          `export ${statement.isTypeOnly ? "type " : ""}* / default — a "${"use server"}" ` +
            `file may only export async functions.`,
        );
      }
      continue;
    }

    if (exported && ts.isClassDeclaration(statement)) {
      problems.push("export class — a \"use server\" file may only export async functions.");
    }
  }

  return problems;
}

const files = walk(SRC);
const modules = files.filter((file) => {
  const text = readFileSync(file, "utf8");
  // Cheap pre-filter so the compiler is only invoked for plausible candidates.
  return /^\s*["']use server["']/.test(text);
});

const failures: { file: string; problems: string[] }[] = [];

for (const file of modules) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (!isActionModule(source)) continue;

  const problems = illegalExports(source);
  if (problems.length > 0) failures.push({ file: relative(ROOT, file), problems });
}

console.log(`\nServer-action module check — ${modules.length} module(s) found\n`);

if (failures.length === 0) {
  console.log("  ok   every \"use server\" module exports only async functions");
  console.log("\nPASS\n");
  process.exit(0);
}

for (const failure of failures) {
  console.log(`  FAIL ${failure.file}`);
  for (const problem of failure.problems) console.log(`         ${problem}`);
  console.log("");
}

console.log(`FAIL — ${failures.length} module(s) with illegal exports\n`);
process.exit(1);
