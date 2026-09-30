/**
 * Capture the README screenshots.
 *
 * Runs against a live server with a real database — the pages are server
 * components reading PostgreSQL, so there is nothing meaningful to photograph
 * without one. Start `npm run db:up && npm run dev` first, or point
 * `SAVORA_BASE_URL` at a deployed build.
 *
 * ## Why full-page shots, and why they need a scroll first
 *
 * `Reveal` and friends animate from `opacity: 0` as they enter the viewport, so
 * a full-page capture of a never-scrolled page is a column of blank space. The
 * page is therefore scrolled to the bottom in steps to trigger every reveal,
 * returned to the top, and only then captured.
 *
 * ## Light and dark
 *
 * Both are captured. Dark mode is a designed palette rather than an inverted
 * one, and a README that only shows the light theme is hiding half the work.
 * The theme is forced via `localStorage` before the first paint, which is the
 * same key the inline theme script in the document head reads.
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { launchChrome, openPage, sleep } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "docs", "screenshots");
const BASE = process.env.SAVORA_BASE_URL ?? "http://localhost:3000";

/**
 * Desktop and phone pairs. A single width would misrepresent the site, because
 * the phone layout is not the desktop layout squeezed — the navigation, the
 * grids and the booking flow all reflow.
 */
const SHOTS = [
  { name: "01-home-desktop", path: "/", width: 1440, height: 900, theme: "light" },
  { name: "02-home-mobile", path: "/", width: 390, height: 844, theme: "light", mobile: true },
  { name: "03-menu-desktop", path: "/menu", width: 1440, height: 900, theme: "light" },
  // Slugs come from the seed, so they are asserted rather than assumed: a
  // screenshot of a 404 is a 14KB image of a not-found page, which looks
  // exactly like a successful capture in a directory listing.
  { name: "04-menu-dish-mobile", path: "/menu/beef-fillet", width: 390, height: 844, theme: "light", mobile: true },
  { name: "05-reserve-desktop", path: "/reserve", width: 1440, height: 900, theme: "light" },
  { name: "06-reserve-steps-mobile", path: "/reserve", width: 390, height: 844, theme: "dark", mobile: true },
  { name: "07-about-dark", path: "/about", width: 1440, height: 900, theme: "dark" },
  { name: "08-menu-dark-mobile", path: "/menu", width: 390, height: 844, theme: "dark", mobile: true },
  { name: "09-newsletter-desktop", path: "/newsletter", width: 1440, height: 900, theme: "light" },
  { name: "10-contact-mobile", path: "/contact", width: 390, height: 844, theme: "light", mobile: true },
  { name: "11-signin-desktop", path: "/signin", width: 1440, height: 900, theme: "light" },
  { name: "12-privacy-mobile", path: "/privacy", width: 390, height: 844, theme: "light", mobile: true },
];

/** Forces the theme before any script on the page can read it. */
function setTheme(theme) {
  localStorage.setItem("theme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const chrome = await launchChrome();
  const client = chrome.client;
  const page = await openPage(client);

  const written = [];
  try {
    console.log(`Capturing to ${OUT}\n`);

    for (const shot of SHOTS) {
      // Seed the theme on the origin first, so every later navigation picks it
      // up from localStorage without a flash of the wrong palette.
      await page.setViewport({
        width: shot.width,
        height: shot.height,
        mobile: Boolean(shot.mobile),
      });
      await page.goto(`${BASE}/`, { waitMs: 400 });
      await page.evaluate(setTheme, shot.theme);

      await page.goto(`${BASE}${shot.path}`, { waitMs: 900 });
      await page.evaluate(setTheme, shot.theme);
      await sleep(300);

      // Walk the page so every scroll-triggered reveal has fired, then return.
      const docHeight = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      const step = Math.round(shot.height * 0.6);
      for (let y = 0; y < docHeight; y += step) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await sleep(120);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      // Let the last reveal settle and any lazy image decode.
      await sleep(700);

      // A capture under ~15KB is a blank or error page. A real page of this
      // design is measured in tens of KB even as a compressed JPEG, so a tiny
      // file means the route 404'd or threw — and a screenshot of a not-found
      // page is worse than no screenshot, because in a directory listing it is
      // indistinguishable from a good one.
      const bytes = await page.screenshot({ fullPage: true });
      if (bytes.length < 15 * 1024) {
        throw new Error(
          `${shot.name} (${shot.path}) captured only ${Math.round(bytes.length / 1024)}KB. ` +
            `That is an error or empty page, not a real screenshot. Check the route and the slug.`,
        );
      }

      const file = join(OUT, `${shot.name}.jpg`);
      await writeFile(file, bytes);
      written.push({ name: shot.name, path: shot.path, bytes: bytes.length });
      console.log(
        `  ${shot.name.padEnd(24)} ${String(Math.round(bytes.length / 1024)).padStart(5)} KB  ${shot.theme}  ${shot.width}px  ${shot.path}`,
      );
    }

    const total = written.reduce((sum, s) => sum + s.bytes, 0);
    console.log(
      `\n${written.length} screenshots written, ${(total / 1024 / 1024).toFixed(1)}MB total.`,
    );
  } finally {
    await page.close();
    client.close();
    await chrome.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
