/**
 * Verifies that the credentials printed in README.md actually sign in, and that
 * each role lands on the dashboard it should.
 *
 * The README is the first thing a reviewer reads and the first thing they try.
 * Credentials printed there that do not work are worse than none, and demo mode
 * re-runs the seed in-process on PGlite, so "it worked locally against
 * PostgreSQL" is not evidence that it works on the deployment. This drives the
 * real HTTP sign-in flow against a server running in demo mode.
 *
 * Run with the demo-mode server already listening:
 *   DEMO_DB=1 npx next start -p 3000
 *   npx tsx scripts/check-credentials.ts
 */
import { loadEnv } from "./load-env";

loadEnv();

const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";

type Case = {
  label: string;
  email: string;
  password: string;
  /** A path that must be reachable, and must contain this, once signed in. */
  expectPath: string;
  /**
   * Markers that must be in the body. Deliberately not the word "Savora" —
   * that appears in the header of every page including the sign-in page, so it
   * would make this pass for a redirect back to /signin.
   */
  expectInBody: string[];
  /** Must NOT be present: the other role's dashboard leaking through. */
  expectAbsent: string[];
};

const CASES: Case[] = [
  {
    label: "admin",
    email: "admin@savora.example",
    password: "savora-admin",
    expectPath: "/admin",
    // The staff nav carries this aria-label and nothing else on the site does,
    // so it proves the dashboard chrome rendered and not merely a 200.
    expectInBody: ["Dashboard sections", "Service"],
    // A staff dashboard must never show a customer's bookings view.
    expectAbsent: ["My bookings"],
  },
  {
    label: "guest",
    email: "guest@savora.example",
    password: "savora-guest",
    expectPath: "/account",
    expectInBody: ["My bookings", "guest@savora.example"],
    // And a customer must not reach the staff dashboard.
    expectAbsent: ["ServiceList", "Floor plan"],
  },
];

/**
 * Signs in the way a browser does: fetch the CSRF token from the sign-in page,
 * then post the credentials callback with it and the cookie jar.
 *
 * A raw `POST /api/auth/callback/credentials` without the CSRF token is rejected
 * by Auth.js, which would make this test pass for the wrong reason if it
 * "worked".
 */
async function signIn(email: string, password: string): Promise<string> {
  const jar: string[] = [];

  const cookieHeader = () => (jar.length ? `; ${jar.join("; ")}` : "");
  const remember = (res: Response) => {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const c of raw) {
      const pair = c.split(";")[0];
      if (pair) jar.push(pair);
    }
  };

  const page = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookieHeader() } });
  if (!page.ok) throw new Error(`GET /api/auth/csrf -> ${page.status}`);
  remember(page);
  const { csrfToken } = (await page.json()) as { csrfToken: string };

  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${BASE}/account`,
  });

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body,
    redirect: "manual",
  });
  remember(res);

  if (res.status >= 400) {
    throw new Error(`POST callback -> ${res.status} ${res.statusText}`);
  }

  // The session cookie is what proves the sign-in, not the redirect: Auth.js
  // returns 302 to the callback URL whether or not the credentials were good.
  const session = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: cookieHeader() },
  });
  remember(session);
  if (!session.ok) throw new Error(`GET /api/auth/session -> ${session.status}`);
  const data = (await session.json()) as { user?: { email?: string } };
  if (!data.user?.email) throw new Error("signed in but the session has no user");
  return data.user.email;
}

/** Fetches a path with the signed-in cookie and returns the body text. */
async function fetchAs(jar: string[], path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: jar.length ? `; ${jar.join("; ")}` : "" },
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
    if (!ok) failures.push(name);
  };

  console.log(`credentials — against ${BASE}\n`);

  // The sign-in page must offer the credentials path at all.
  const signinPage = await fetch(`${BASE}/signin`);
  check("the sign-in page loads", signinPage.status === 200, String(signinPage.status));

  for (const c of CASES) {
    let jar: string[] = [];
    try {
      // Re-derive the jar by repeating the flow; `signIn` returns the identity,
      // and a fresh jar is built below for the authenticated fetches.
      const who = await signIn(c.email, c.password);
      check(`${c.label} signs in`, who.toLowerCase() === c.email.toLowerCase(), who);

      // Now authenticate again keeping the jar, for the page checks.
      jar = [];
      const page = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: "" } });
      const raw = page.headers.getSetCookie?.() ?? [];
      for (const k of raw) jar.push(k.split(";")[0]);
      const { csrfToken } = (await page.json()) as { csrfToken: string };
      const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: `; ${jar.join("; ")}`,
        },
        body: new URLSearchParams({
          csrfToken,
          email: c.email,
          password: c.password,
          callbackUrl: `${BASE}${c.expectPath}`,
        }),
        redirect: "manual",
      });
      for (const k of res.headers.getSetCookie?.() ?? []) jar.push(k.split(";")[0]);

      const dash = await fetchAs(jar, c.expectPath);
      check(`${c.label} reaches ${c.expectPath}`, dash.status === 200, String(dash.status));

      for (const marker of c.expectInBody) {
        check(
          `${c.label} dashboard shows "${marker}"`,
          dash.body.includes(marker),
          dash.body.includes(marker) ? "" : "not in the rendered page",
        );
      }
      for (const marker of c.expectAbsent) {
        check(
          `${c.label} dashboard does not show "${marker}"`,
          !dash.body.includes(marker),
        );
      }
    } catch (e) {
      check(`${c.label} signs in`, false, String((e as Error).message).slice(0, 120));
    }
  }

  // A wrong password must NOT sign in. Without this the test would also pass if
  // the credentials provider accepted anything.
  try {
    const who = await signIn("admin@savora.example", "definitely-not-the-password");
    check("a wrong password is rejected", false, `it signed in as ${who}`);
  } catch {
    check("a wrong password is rejected", true);
  }

  console.log();
  if (failures.length) {
    console.error(`${failures.length} check(s) failed: ${failures.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("all credential checks passed");
}

void main();
