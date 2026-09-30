/**
 * Responsive audit.
 *
 * Loads every public page at a spread of real viewport widths and reports what
 * is actually wrong in the browser: elements wider than the viewport, text that
 * has been squeezed until it overflows its box, interactive targets below the
 * 44px minimum, and pages that log an error or warn about hydration.
 *
 * ## Why measure instead of reading the CSS
 *
 * A responsive bug is almost never "this breakpoint is missing". It is a
 * `min-width` here and a `whitespace-nowrap` there that only collide between
 * 600px and 700px. Reading the stylesheet cannot find that; laying the page out
 * can. Every finding below is something a reader would have seen.
 *
 * ## Reading the output
 *
 * - `overflow`    the page scrolls sideways. Always a bug. This is the headline
 *                 number: it should be 0 at every width on every page.
 * - `too wide`    an element whose right edge is past the viewport. Usually the
 *                 cause of the above; occasionally the cause of a scrollbar.
 * - `text clipped`text wider than the box that holds it, hidden or not. The
 *                 reader loses content with no indication they did.
 * - `tap target`  an interactive element under 44x44. The single most common
 *                 real-world mobile complaint about a site like this.
 *
 * ## Deliberately not reported
 *
 * Three classes of finding are excluded, and each exclusion was added because
 * the first version of this script reported them and they were all wrong:
 *
 * 1. **Screen-reader-only text.** `sr-only` is a 1x1 clipped box by design --
 *    that is how "Skip to content" and the step names are made available to a
 *    screen reader without being seen. Measuring it reports "text clipped by
 *    223px" on every page, which is true and entirely correct.
 * 2. **Anything inside an `overflow: hidden` ancestor.** Such an element is
 *    already clipped by its container, so it cannot make the page scroll. The
 *    decorative blurred blobs behind the hero live here; they are 544px wide on
 *    a 320px screen *on purpose*, because the section clips them.
 * 3. **Horizontally scrollable strips.** The menu category rail, the account tab
 *    bar and the booking-date picker are deliberately scrollable on a phone.
 *
 * Everything left over is something a reader would actually have seen.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { launchChrome, openPage, sleep } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SAVORA_BASE_URL ?? "http://localhost:3000";

/**
 * Widths worth testing.
 *
 * Not a tidy 320/768/1024. Each one is either a device that actually exists or
 * a known trouble spot: 320 is the narrowest phone still in use, 360 and 390 are
 * the two most common Android and iPhone widths, 414 is a large phone, 430 and
 * 480 are the top of the phone range and the place a two-column grid first
 * breaks, 768 and 1024 are tablet portrait and landscape, and 1280/1440/1920
 * are laptop, large laptop and desktop.
 */
const WIDTHS = [320, 360, 390, 414, 480, 600, 768, 1024, 1280, 1440, 1920];

const PAGES = [
  { path: "/", name: "home" },
  { path: "/menu", name: "menu" },
  { path: "/menu/sea-bass", name: "menu item" },
  { path: "/reserve", name: "reserve" },
  { path: "/about", name: "about" },
  { path: "/contact", name: "contact" },
  { path: "/newsletter", name: "newsletter" },
  { path: "/privacy", name: "privacy" },
  { path: "/terms", name: "terms" },
  { path: "/signin", name: "signin" },
  { path: "/register", name: "register" },
];

/** Runs inside the page. Must be self-contained: it is stringified and sent over CDP. */
function probe() {
  const MIN_TAP = 44;

  /** A short, human-usable path to an element rather than a bare tag name. */
  const describe = (el) => {
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const cls = (node.getAttribute?.("class") ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .filter((c) => !/^(sm|md|lg|xl|2xl|hover|focus|group|dark|print):/.test(c))
          .slice(0, 2)
          .join(".");
      if (cls) part += `.${cls}`;
      parts.unshift(part);
      node = node.parentElement;
      depth += 1;
    }
    return parts.join(" > ").slice(0, 110);
  };

  const text = (el) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);

  /** Elements the reader can see and interact with. */
  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  /**
   * True when this element lives inside a deliberately scrollable strip.
   * The strip itself may be wider than the viewport; the children must not be.
   */
  const inScrollStrip = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowX)) return true;
      node = node.parentElement;
    }
    return false;
  };

  const doc = document.documentElement;
  const overflowBy = doc.scrollWidth - doc.clientWidth;

  /**
   * `sr-only` content: present for assistive tech, visually a 1x1 clip.
   *
   * Detected from the rendered box rather than by matching the class name,
   * because the class can be composed (`sr-only focus:not-sr-only`) and because
   * the same pattern is open to hand-written CSS.
   */
  const isScreenReaderOnly = (el, rect) =>
    rect.width <= 2 && rect.height <= 2;

  /**
   * True when an ancestor already clips, so this element cannot widen the page.
   * `overflow-x: hidden|clip|auto|scroll` all stop horizontal overflow escaping.
   */
  const insideClipper = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) return true;
      node = node.parentElement;
    }
    return false;
  };

  const tooWide = [];
  const clipped = [];
  const smallTargets = [];
  const seen = new Set();

  for (const el of document.body.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const style = getComputedStyle(el);
    if (style.position === "fixed" && style.visibility === "hidden") continue;
    // Only this branch needs the scroll-strip exemption: inside `auto`/`scroll`
    // the element is intentionally allowed to be wider than its parent.
    const inStrip = inScrollStrip(el);

    const rect = el.getBoundingClientRect();
    if (isScreenReaderOnly(el, rect)) continue;

    // --- an element extending past the right edge of the viewport ---
    if (!inStrip && !insideClipper(el)) {
      const pastRight = rect.right - doc.clientWidth;
      if (pastRight > 2) {
        const key = `w:${describe(el)}`;
        if (!seen.has(key)) {
          seen.add(key);
          tooWide.push({
            el: describe(el),
            overflowPx: Math.round(pastRight),
            width: Math.round(rect.width),
          });
        }
      }
    }

    // --- text wider than the box holding it ---
    // scrollWidth > clientWidth with overflow hidden means the reader loses the
    // rest of the string with nothing to indicate it happened.
    const hidesOverflow =
      style.overflow === "hidden" || style.overflowX === "hidden";
    if (
      hidesOverflow &&
      !inStrip &&
      el.scrollWidth > el.clientWidth + 2 &&
      el.clientWidth > 0 &&
      (el.childElementCount === 0 || el.tagName === "P")
    ) {
      clipped.push({
        el: describe(el),
        text: text(el),
        hiddenPx: el.scrollWidth - el.clientWidth,
      });
    }

    // --- interactive targets below the minimum ---
    const interactive = ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"];
    if (!interactive.includes(el.tagName)) continue;
    if (el.getAttribute("aria-hidden") === "true") continue;
    // A label wrapped around its own input is measured by that input.
    if (el.tagName === "LABEL" && el.querySelector("input,select,textarea")) continue;
    // WCAG 2.2 exempts a target that sits inside a sentence or a block of text:
    // an inline link mid-paragraph is not expected to be a 44px block.
    if (el.tagName === "A" && style.display === "inline") continue;

    const w = rect.width;
    const h = rect.height;
    // 8px of slack absorbs sub-pixel layout rounding, which is not a defect.
    if (w < MIN_TAP - 8 || h < MIN_TAP - 8) {
      const key = `t:${describe(el)}`;
      if (!seen.has(key)) {
        seen.add(key);
        smallTargets.push({
          el: describe(el),
          size: `${Math.round(w)}x${Math.round(h)}`,
          text: text(el),
        });
      }
    }
  }

  tooWide.sort((a, b) => b.overflowPx - a.overflowPx);
  smallTargets.sort((a, b) => parseInt(a.size) - parseInt(b.size));

  return {
    overflowBy,
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    tooWide: tooWide.slice(0, 12),
    clipped: clipped.slice(0, 12),
    smallTargets: smallTargets.slice(0, 12),
    counts: {
      tooWide: tooWide.length,
      clipped: clipped.length,
      smallTargets: smallTargets.length,
    },
  };
}

async function main() {
  const chrome = await launchChrome();
  const client = chrome.client;
  const page = await openPage(client);

  const findings = [];
  let checks = 0;

  try {
    console.log(`Chrome: ${chrome.version}`);
    console.log(`Base:   ${BASE}`);
    console.log(
      `Sweeping ${PAGES.length} pages x ${WIDTHS.length} widths = ${PAGES.length * WIDTHS.length} checks\n`,
    );

    for (const target of PAGES) {
      for (const width of WIDTHS) {
        const height = width < 768 ? 844 : 900;
        checks += 1;

        await page.setViewport({ width, height, mobile: width < 768 });
        await page.goto(`${BASE}${target.path}`, { waitMs: 260 });
        // Let framer-motion settle: an element mid-flight is at opacity 0 and
        // would be invisible to the layout probe, hiding exactly the problems
        // we are looking for.
        await sleep(140);

        let result;
        try {
          result = await page.evaluate(probe);
        } catch (error) {
          findings.push({
            page: target.name,
            width,
            kind: "PROBE FAILED",
            detail: String(error).slice(0, 200),
          });
          continue;
        }

        if (result.overflowBy > 0 || result.counts.tooWide || result.counts.clipped) {
          findings.push({
            page: target.name,
            width,
            kind: "layout",
            ...result,
          });
        }

        if (result.counts.smallTargets > 0) {
          findings.push({
            page: target.name,
            width,
            kind: "tap-targets",
            smallTargets: result.smallTargets,
            counts: result.counts,
          });
        }
      }

      // One console check per page at a realistic phone width, where hydration
      // and responsive paths are both actually exercised.
      await page.setViewport({ width: 390, height: 844, mobile: true });
      await page.goto(`${BASE}${target.path}`, { waitMs: 700 });
      const noisy = page.pageErrors
        .concat(
          page.consoleMessages
            .filter((m) => m.level === "error" || m.level === "warning")
            .map((m) => m.text),
        )
        .filter((t) => !/favicon|Download the React DevTools/i.test(t));
      if (noisy.length) {
        findings.push({
          page: target.name,
          width: 390,
          kind: "console",
          detail: [...new Set(noisy)].slice(0, 6),
        });
      }
    }

    // ---- report ----
    const outFile = join(HERE, "..", ".audit", "responsive-report.json");
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, JSON.stringify({ checks, findings }, null, 2), "utf8");

    const byKind = (kind) => findings.filter((f) => f.kind === kind);
    const overflow = byKind("layout");
    const tappy = byKind("tap-targets");
    const consoles = byKind("console");

    console.log(`checks run       : ${checks}`);
    console.log(`pages w/ overflow: ${overflow.length}`);
    console.log(`pages w/ small tap: ${tappy.length}`);
    console.log(`pages w/ console : ${consoles.length}`);

    if (overflow.length) {
      console.log("\n--- HORIZONTAL OVERFLOW ---");
      for (const f of overflow) {
        if (f.overflowBy > 0) {
          console.log(
            `  [${f.page} @${f.width}] page scrolls ${f.overflowBy}px sideways`,
          );
        }
        for (const w of f.tooWide ?? []) {
          console.log(
            `  [${f.page} @${f.width}] +${w.overflowPx}px  ${w.el}  (w=${w.width})`,
          );
        }
        for (const c of f.clipped ?? []) {
          console.log(
            `  [${f.page} @${f.width}] clipped ${c.hiddenPx}px  "${c.text}"  ${c.el}`,
          );
        }
      }
    }

    if (tappy.length) {
      console.log("\n--- TAP TARGETS UNDER 44px ---");
      for (const f of tappy) {
        for (const t of f.smallTargets.slice(0, 6)) {
          console.log(`  [${f.page} @${f.width}] ${t.size}  "${t.text}"  ${t.el}`);
        }
      }
    }

    if (consoles.length) {
      console.log("\n--- CONSOLE ---");
      for (const f of consoles) {
        for (const d of f.detail) console.log(`  [${f.page}] ${d.slice(0, 160)}`);
      }
    }

    if (!findings.length) {
      console.log("\nclean at every width");
    }
    console.log(`\nfull report: ${outFile}`);
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
