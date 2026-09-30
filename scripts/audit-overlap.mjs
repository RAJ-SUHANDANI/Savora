/**
 * Overlap audit — the failure mode the horizontal-overflow check cannot see.
 *
 * ## Why this is a separate script
 *
 * `audit-responsive.mjs` reports elements *wider than the viewport*. A page can
 * pass that check completely and still be unusable: two stacked blocks can each
 * be exactly the right width and still be drawn on top of each other. That is
 * what "the text is overlapping" means on a 360px phone, and it is invisible to
 * a scrollWidth comparison because nothing is overflowing — the boxes are simply
 * in the same place.
 *
 * The usual cause is a fixed-height container (`h-24rem`, an aspect-ratio box, a
 * `h-[420px]` panel) that is tall enough on a desktop and too short once the text
 * inside it wraps to three lines instead of one. The container does not grow,
 * the text does, and the text spills out over whatever is below.
 *
 * ## How overlap is decided
 *
 * Text is taken from *leaf* elements only. A paragraph inside a section overlaps
 * its own parent by definition, so including containers would report every
 * element on the page. A leaf here is an element with visible text and no
 * element children, which is what actually gets painted as glyphs.
 *
 * Two leaves are reported only when their rectangles genuinely intersect by more
 * than a couple of pixels on both axes, and neither is an ancestor of the other.
 * Descendant pairs are excluded for the same reason.
 *
 * The fix for almost every finding is to let the box grow: replace a fixed `h-*`
 * with `min-h-*`, or drop an `aspect-*` in favour of padding. That is stated in
 * the finding so it can be acted on without re-deriving the cause.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { launchChrome, openPage, sleep } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SAVORA_BASE_URL ?? "http://localhost:3000";

/** Phones first — this is where the brief says it breaks. */
const WIDTHS = [320, 360, 390, 414];

const PAGES = [
  { path: "/", name: "home" },
  { path: "/menu", name: "menu" },
  { path: "/reserve", name: "reserve" },
  { path: "/about", name: "about" },
  { path: "/contact", name: "contact" },
  { path: "/newsletter", name: "newsletter" },
  { path: "/signin", name: "signin" },
  { path: "/register", name: "register" },
];

/**
 * Runs in the page. Self-contained: stringified and sent over CDP.
 *
 * ## Why this measures Ranges and not elements
 *
 * The first version compared the boxes of "leaf" elements — those with no
 * element children — and reported nothing. That was wrong twice over:
 *
 * - A `<p>` containing a `<strong>` has element children, so the paragraph was
 *   skipped and only the `<strong>` was measured. The one element most likely to
 *   collide with the heading above it was the one element never checked.
 * - An element's box is not where its text is. Padding, a taller sibling line
 *   box, and `align-items` all make the element box bigger than the glyphs, so
 *   element boxes report overlaps that are really just shared padding.
 *
 * A `Range` over a text node returns the actual painted line boxes, one per
 * visual line. That is the real geometry of the words on screen, it works for
 * mixed inline content, and it is what the reader sees. Everything below works
 * in those line boxes.
 */
function probeOverlap() {
  /** Tolerance. Sub-pixel layout rounding produces slivers that are not defects. */
  const EPSILON = 2;

  const describe = (el) => {
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 3) {
      let part = node.tagName.toLowerCase();
      const cls = (node.getAttribute?.("class") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .filter((c) => !/^(sm|md|lg|xl|2xl|hover|focus|group|dark|peer|print|data-\[|aria-)/.test(c))
        .slice(0, 2)
        .join(".");
      if (cls) part += `.${cls}`;
      parts.unshift(part);
      node = node.parentElement;
      depth += 1;
    }
    return parts.join(" > ").slice(0, 88);
  };

  /** Is this text actually painted? */
  const visible = (node) => {
    let el = node.parentElement;
    if (!el) return false;
    // Walk to the block that owns the text, checking every element between the
    // text and the body: a single `hidden` ancestor hides all of it.
    const chain = [];
    while (el && el !== document.body) {
      chain.push(el);
      el = el.parentElement;
    }
    for (const e of chain) {
      const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden") return false;
      if (Number(s.opacity) === 0) return false;
      // `sr-only` is a 1x1 clip by design; it is for screen readers, not eyes.
      if (s.overflow === "hidden" || s.overflowY === "hidden") {
        const r = e.getBoundingClientRect();
        if (r.width <= 2 || r.height <= 2) return false;
      }
    }
    return true;
  };

  /**
   * The visible part of a rect, after every clipping ancestor has had its say.
   *
   * This is the correction that makes the whole check trustworthy. A Range
   * reports where text *would* be laid out, not where it is painted, so a
   * `line-clamp-1` paragraph — 23px of box holding 114px of text — returns four
   * line rects running 90px past the bottom of its own element and straight
   * through the heading of the next row. Nothing is wrong on the page; the
   * overflow is hidden. Reporting it produced 30 false positives on /menu alone.
   *
   * So each rect is intersected with the padding box of every ancestor that
   * clips, and a line that is entirely clipped away is dropped. What survives is
   * genuinely on screen.
   */
  const clipToAncestors = (rect, el) => {
    let box = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    let node = el;
    while (node && node !== document.body && node.nodeType === 1) {
      const s = getComputedStyle(node);
      const clipsY = s.overflowY === "hidden" || s.overflowY === "clip";
      const clipsX = s.overflowX === "hidden" || s.overflowX === "clip";
      if (clipsY || clipsX) {
        const r = node.getBoundingClientRect();
        if (clipsY) {
          box.top = Math.max(box.top, r.top);
          box.bottom = Math.min(box.bottom, r.bottom);
        }
        if (clipsX) {
          box.left = Math.max(box.left, r.left);
          box.right = Math.min(box.right, r.right);
        }
      }
      node = node.parentElement;
    }
    return box;
  };

  // ---- collect the painted line boxes -----------------------------------
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const lines = [];
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent;
    if (text && text.trim().length >= 2 && visible(node)) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const raw of range.getClientRects()) {
        if (raw.width < 3 || raw.height < 3) continue;
        const box = clipToAncestors(raw, node.parentElement);
        // Entirely clipped away: the reader cannot see any of it.
        if (box.bottom - box.top < 3 || box.right - box.left < 3) continue;
        lines.push({ el: node.parentElement, rect: box, text: text.trim() });
      }
      range.detach?.();
    }
    node = walker.nextNode();
  }

  // Two runs of the *same* paragraph do not overlap: they are the same block
  // wrapping. Group by owning element so a paragraph is only compared against
  // other blocks.
  const overlaps = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const a = lines[i];
      const b = lines[j];
      if (a.el === b.el) continue;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;

      const ow = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const oh = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (ow <= EPSILON || oh <= EPSILON) continue;

      // Require a real collision, not a shared edge. Two lines of text are only
      // unreadable when a meaningful part of one sits on top of the other.
      const lineH = Math.min(a.rect.height, b.rect.height);
      if (oh < lineH * 0.55) continue;
      if (ow < Math.min(a.rect.width, b.rect.width) * 0.3) continue;

      // The later element in document order paints on top, absent a z-index.
      // Naming which is which turns "these overlap" into "this one is buried".
      const bFollowsA = Boolean(
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      const under = bFollowsA ? a : b;
      const over = bFollowsA ? b : a;

      overlaps.push({
        a: describe(a.el),
        b: describe(b.el),
        under: under.el.tagName.toLowerCase() + "." + (under.el.className || "").toString().split(/\s+/)[0],
        over: over.el.tagName.toLowerCase() + "." + (over.el.className || "").toString().split(/\s+/)[0],
        underText: under.text.replace(/\s+/g, " ").slice(0, 36),
        overText: over.text.replace(/\s+/g, " ").slice(0, 36),
        overlapPx: `${Math.round(ow)}x${Math.round(oh)}`,
      });
    }
  }

  return overlaps.slice(0, 30);
}

/**
 * Reports text that is genuinely being cut off.
 *
 * The first version of this reported 24 false positives per page, and both
 * causes are worth naming because they are easy to mistake for the real thing:
 *
 * - `line-clamp-2` truncating a dish description to two lines. That is the
 *   design, not a defect.
 * - A container whose `scrollHeight` exceeds its `clientHeight` by exactly the
 *   bottom margin of its last child. That is margin collapsing: the margin
 *   escapes the box and adds whitespace below it. Nothing is hidden and nothing
 *   overlaps, because the parent does not clip.
 *
 * So this only reports an element that both overflows *and* actually clips —
 * `overflow-y: hidden|clip` on itself. That is the only case where a reader
 * loses text they could otherwise see.
 */
function probeClipped() {
  const EPSILON = 4;

  const describe = (el) => {
    let part = el.tagName.toLowerCase();
    const cls = (el.getAttribute?.("class") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join(".");
    if (cls) part += `.${cls}`;
    return part.slice(0, 80);
  };

  const out = [];
  for (const el of document.body.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    // Deliberate truncation, not a lost line.
    if (style.webkitLineClamp && style.webkitLineClamp !== "none") continue;
    if (style.textOverflow === "ellipsis" && style.whiteSpace === "nowrap") continue;
    // Nothing is lost unless this element is the thing doing the cutting.
    if (style.overflowY !== "hidden" && style.overflowY !== "clip") continue;
    if (el.clientHeight < 24) continue;
    if (el.scrollHeight <= el.clientHeight + EPSILON) continue;
    // A frame holding only an image is cropping by design. The Parallax
    // primitive clips deliberately so the drift cannot escape the rounded
    // corners, and the hero images use `object-cover`, so the image is already
    // larger than the window. Only *text* being cut off is a defect here, and
    // this element has none.
    const ownText = (el.textContent ?? "").trim();
    if (!ownText && el.querySelector("img, picture, video, svg")) continue;

    out.push({
      el: describe(el),
      box: Math.round(el.clientHeight),
      content: el.scrollHeight,
      overflowPx: el.scrollHeight - el.clientHeight,
      text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 44),
    });
  }
  return out.slice(0, 20);
}

/**
 * Two failures that a bounding-box comparison cannot detect, because in both
 * cases the rectangles are *correct* — it is the painting that is wrong.
 *
 * 1. **Glyph collision inside one block.** Two lines of text occupy adjacent
 *    line boxes. If `line-height` is smaller than the font's own ascent+descent,
 *    the descenders of one line sit inside the cap-height of the next and the
 *    words touch. Every box still measures exactly where the browser put it, so
 *    no amount of overlap testing finds it. Fraunces is a display face with
 *    tall metrics, and it is the one most likely to be set too tight.
 *
 * 2. **A fixed bar painted over the content.** The mobile booking bar and the
 *    header are `position: fixed`. If the document does not reserve space for
 *    them, they are drawn on top of the footer text at the bottom of the page.
 *    Again the boxes are correct; they are simply stacked in the wrong order,
 *    and the reader sees the bar sitting on top of a sentence.
 *
 * @param {{ probe: "lineheight" | "fixed" }} which
 */
function probePaint(which) {
  const describe = (el) => {
    let part = el.tagName.toLowerCase();
    const cls = (el.getAttribute?.("class") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .filter((c) => !/^(sm|md|lg|xl|2xl|hover|focus|group|dark|peer|print|data-\[)/.test(c))
      .slice(0, 3)
      .join(".");
    if (cls) part += `.${cls}`;
    if (el.id) part += `#${el.id}`;
    return part.slice(0, 90);
  };
  const snippet = (el) =>
    (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);

  const out = [];

  if (which === "lineheight") {
    for (const el of document.body.querySelectorAll("*")) {
      if (el.children.length > 0) continue;
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join("")
        .trim();
      // Needs at least two lines for a collision to be possible, which means
      // the text has to actually wrap.
      if (own.length < 12) continue;

      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const fontSize = parseFloat(style.fontSize);
      const lineHeight = parseFloat(style.lineHeight);
      if (!fontSize || !lineHeight || !Number.isFinite(lineHeight)) continue;

      const ratio = lineHeight / fontSize;
      // Below 1.0 the lines physically cannot fit their own glyphs. Between 1.0
      // and 1.15 is the band where a display serif with descenders starts to
      // touch, and it is worth knowing about before a user does.
      if (ratio >= 1.15) continue;
      // Ignore anything smaller than body text: a 12px caption at 1.1 is tight
      // but legible, and flagging it would bury the real cases.
      if (fontSize < 16) continue;

      out.push({
        el: describe(el),
        fontSize: Math.round(fontSize),
        lineHeight: Math.round(lineHeight),
        ratio: ratio.toFixed(2),
        text: snippet(el),
      });
    }
    return out.slice(0, 25);
  }

  // ---- fixed overlays ----
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const docHeight = document.documentElement.scrollHeight;

  const bars = [];
  for (const el of document.body.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    if (style.position !== "fixed" && style.position !== "sticky") continue;
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (Number(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 20) continue;
    // A sticky bar that has scrolled out of its own range is not painting.
    if (rect.bottom < -50 || rect.top > vh + 50) continue;
    bars.push({ el, rect, style });
  }
  if (!bars.length) return out;

  /** Scrolls the page to the bottom so a bar that only covers the last screen
   *  of content is caught, then reports text underneath each bar. */
  window.scrollTo(0, docHeight);
  const scrolled = new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return scrolled.then(() => {
    for (const bar of bars) {
      const rect = bar.el.getBoundingClientRect();
      for (const el of document.body.querySelectorAll("*")) {
        if (el.children.length > 0) continue;
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join("")
          .trim();
        if (own.length < 3) continue;
        if (el.contains(bar.el) || bar.el.contains(el)) continue;

        const r = el.getBoundingClientRect();
        if (r.width <= 2 || r.height <= 2) continue;

        const ow = Math.min(r.right, rect.right) - Math.max(r.left, rect.left);
        const oh = Math.min(r.bottom, rect.bottom) - Math.max(r.top, rect.top);
        if (ow <= 2 || oh <= 2) continue;

        // A bar is allowed a solid backdrop: what matters is whether the text
        // is actually invisible behind it, which is true when the bar is opaque
        // or blurred. Semi-transparent bars are reported.
        const bg = bar.style.backgroundColor;
        const opaque = bg && !/rgba?\([^)]*,\s*0?\.\d+\)/.test(bg);
        const blurred = /blur/.test(bar.style.backdropFilter || "");

        out.push({
          bar: describe(bar.el),
          barBg: bg,
          blurred,
          opaque: Boolean(opaque),
          covered: `${Math.round(ow)}x${Math.round(oh)}`,
          text: snippet(el),
          el: describe(el),
          viewport: `${vw}x${vh}`,
        });
      }
    }
    return out.slice(0, 25);
  });
}

async function main() {
  const chrome = await launchChrome();
  const client = chrome.client;
  const page = await openPage(client);

  const findings = [];
  let checks = 0;

  try {
    console.log(`Chrome: ${chrome.version}`);
    console.log(`Sweeping ${PAGES.length} pages x ${WIDTHS.length} phone widths\n`);

    for (const target of PAGES) {
      for (const width of WIDTHS) {
        checks += 1;
        await page.setViewport({ width, height: 780, mobile: true });
        await page.goto(`${BASE}${target.path}`, { waitMs: 500 });
        await sleep(200);

        const overlaps = await page.evaluate(probeOverlap);
        const clipped = await page.evaluate(probeClipped);
        const lineHeight = await page.evaluate(probePaint, "lineheight");
        const fixed = await page.evaluate(probePaint, "fixed");
        if (overlaps.length || clipped.length || lineHeight.length || fixed.length) {
          findings.push({
            page: target.name,
            width,
            overlaps,
            clipped,
            lineHeight,
            fixed,
          });
        }
        // The fixed-overlay probe scrolls the page, so put it back before the
        // next width measures anything.
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    }

    const outFile = join(HERE, "..", ".audit", "overlap-report.json");
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, JSON.stringify({ checks, findings }, null, 2), "utf8");

    console.log(`checks run : ${checks}`);
    console.log(`findings   : ${findings.length}\n`);

    for (const f of findings) {
      console.log(`=== ${f.page} @${f.width} ===`);
      for (const o of f.overlaps) {
        console.log(
          `  OVERLAP ${o.overlapPx}  "${o.underText}" UNDER "${o.overText}"`,
        );
        console.log(`     hidden: ${o.a}`);
        console.log(`     on top: ${o.b}`);
      }
      for (const c of f.clipped) {
        console.log(`  CLIPPED  box ${c.box}px holds ${c.content}px (-${c.overflowPx})`);
        console.log(`     ${c.el}  "${c.text}"`);
      }
      for (const l of f.lineHeight) {
        console.log(
          `  TIGHT LINE-HEIGHT  ${l.fontSize}px text on ${l.lineHeight}px (${l.ratio})`,
        );
        console.log(`     ${l.el}  "${l.text}"`);
      }
      for (const x of f.fixed) {
        const flag = x.opaque || x.blurred ? "backdrop is opaque" : "TRANSPARENT BAR";
        console.log(
          `  FIXED BAR OVER TEXT  covered ${x.covered} at ${x.viewport}  [${flag}]`,
        );
        console.log(`     bar: ${x.bar}`);
        console.log(`     under: ${x.el}  "${x.text}"`);
      }
    }

    if (!findings.length) console.log("no overlapping or clipped text at any phone width");
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
