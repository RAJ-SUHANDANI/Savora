/**
 * Reproduces the "signs in but never leaves /signin" bug, with diagnostics.
 *
 * `scripts/check-credentials.ts` posts to the credentials callback directly and
 * asserts on the session cookie, which proves the *server* works. It cannot see
 * this bug: the failure is on the client. So this drives the real form in a
 * real browser and reports what the page actually did — the path it ended on,
 * the button label, any error banner, and the status of the server-action POST.
 */
import { launchChrome, openPage, sleep } from "./cdp.mjs";

const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";

const CASES = [
  { role: "admin", email: "admin@savora.example", password: "savora-admin", land: "/admin" },
  { role: "guest", email: "guest@savora.example", password: "savora-guest", land: "/account" },
];

async function attempt(page, c) {
  await page.goto(`${BASE}/signin`, { waitMs: 1200 });

  // Type into the fields the way a person does: focus, then real key events.
  // Assigning `el.value` is not enough for React, and dispatching a synthetic
  // `input` on a React-controlled field is not enough for react-hook-form.
  for (const [selector, value] of [
    ["#email", c.email],
    ["#password", c.password],
  ]) {
    await page.evaluate((sel) => document.querySelector(sel)?.focus(), selector);
    for (const ch of value) {
      await client.send(
        "Input.insertText",
        { text: ch },
        page.sessionId,
      );
    }
    await page.evaluate(() => {});
  }

  // What the form would actually submit, as the browser sees it.
  const submitted = await page.evaluate(() => {
    const form = document.querySelector("form");
    if (!form) return null;
    const data = new FormData(form);
    const out = {};
    for (const [k, v] of data.entries()) out[k] = typeof v === "string" ? v : "(file)";
    return out;
  });

  await page.evaluate(() => {
    document.querySelector('button[type="submit"]')?.click();
  });

  const seen = [];
  const t0 = Date.now();
  let landedAt = null;
  // Generous on purpose: the question is whether it is slow or never, and a
  // short window cannot tell those apart.
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    let path;
    try {
      path = await page.evaluate(() => location.pathname + location.search);
    } catch {
      path = "<navigated>";
    }
    seen.push(path);
    if (!path.startsWith("/signin")) {
      landedAt = Date.now() - t0;
      break;
    }
  }

  let dom = null;
  try {
    dom = await page.evaluate(() => {
      const text = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      return {
        path: location.pathname,
        button: text(document.querySelector('button[type="submit"]')),
        // Anything the user would be staring at instead of a dashboard.
        alerts: [...document.querySelectorAll('[role="alert"], [role="alertdialog"]')]
          .map(text)
          .filter(Boolean),
        fieldErrors: [...document.querySelectorAll("p[id$='-error'], [data-error]")]
          .map(text)
          .filter(Boolean),
      };
    });
  } catch {
    dom = null;
  }

  return { submitted, seen, dom, landedAt, ok: seen[seen.length - 1] === c.land };
}

const chrome = await launchChrome();
const client = chrome.client;
const page = await openPage(client);

const failures = [];
console.log(`sign-in navigation — against ${BASE}\n`);

for (const c of CASES) {
  // Start signed out: /signin bounces an authenticated visitor straight to their
  // dashboard, which would otherwise make the next case untestable.
  await client.send("Network.enable", {}, page.sessionId);
  await client.send("Network.clearBrowserCookies", {}, page.sessionId);

  const result = await attempt(page, c);
  const ok = result.ok;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${c.role} lands on ${c.land}`);
  console.log(`        submitted: ${JSON.stringify(result.submitted)}`);
  console.log(
    `        landed:    ${result.landedAt === null ? "never (>60s)" : result.landedAt + "ms"}`,
  );
  if (result.dom) {
    console.log(`        button:    ${JSON.stringify(result.dom.button)}`);
    if (result.dom.alerts.length) console.log(`        alerts:    ${JSON.stringify(result.dom.alerts)}`);
    if (result.dom.fieldErrors.length)
      console.log(`        field errs: ${JSON.stringify(result.dom.fieldErrors)}`);
  } else {
    console.log(`        dom:       <context destroyed — page really navigated>`);
  }
  if (!ok) failures.push(`${c.role} did not navigate`);
  console.log();
}

if (failures.length) {
  console.error(`${failures.length} failure(s): ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("both roles navigated to their dashboard without a refresh");
}

await chrome.close();
