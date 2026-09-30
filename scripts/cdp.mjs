/**
 * Chrome DevTools Protocol client and a Chrome launcher.
 *
 * There is no puppeteer in this project and there does not need to be one. Node
 * 22+ ships a global `WebSocket` and `fetch`, which is everything CDP needs, so
 * a headless-Chrome driver is about eighty lines and pulls in no dependencies.
 * That matters for a template: a screenshot harness that required a 300MB
 * browser download would not be installed by anyone who clones this.
 *
 * Why measure in the browser at all: "is this page responsive" is not a question
 * CSS can answer. Overflow comes from the interaction of a min-width, a padding
 * and a font fallback at one specific viewport width, and the only place that
 * interaction actually exists is a laid-out document. `scrollWidth` versus
 * `innerWidth` is the ground truth; everything else is us narrowing down which
 * element is responsible.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

async function findChrome() {
  const { access } = await import("node:fs/promises");
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    "No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.",
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll the DevTools HTTP endpoint until the browser is listening. */
async function waitForEndpoint(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return await response.json();
    } catch {
      /* not up yet */
    }
    await sleep(120);
  }
  throw new Error(`Chrome DevTools endpoint did not open on port ${port}`);
}

/**
 * Launch headless Chrome and attach to it.
 *
 * `port: 0` picks a free port. The user-data-dir is a fresh temp directory so
 * this never touches a real profile and two runs can never collide.
 */
export async function launchChrome({ port = 0, extraArgs = [] } = {}) {
  const binary = await findChrome();
  const userDataDir = await mkdtemp(join(tmpdir(), "savora-cdp-"));
  const actualPort = port || 9000 + Math.floor(Math.random() * 900);

  const child = spawn(
    binary,
    [
      "--headless=new",
      `--remote-debugging-port=${actualPort}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "--disable-extensions",
      // Keep the audit honest: no background networking, no throttling, and no
      // crash reporter padding the viewport with a bubble.
      "--disable-background-networking",
      "--disable-sync",
      "--disable-crash-reporter",
      "--disable-component-update",
      "--force-color-profile=srgb",
      ...extraArgs,
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );

  await waitForEndpoint(actualPort);
  const version = await waitForEndpoint(actualPort);

  return {
    version: version.Browser,
    async close() {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      await sleep(150);
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    },
    client: await CdpClient.connect(version.webSocketDebuggerUrl),
  };
}

/**
 * A CDP connection with flat session routing.
 *
 * `Target.attachToTarget({ flatten: true })` multiplexes every page onto the
 * one browser-level socket, which is how the protocol is meant to be used and
 * avoids opening a websocket per tab.
 */
export class CdpClient {
  #socket;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Map();

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => this.#onMessage(event));
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("CDP socket failed")), {
        once: true,
      });
    });
    return new CdpClient(socket);
  }

  #onMessage(event) {
    const message = JSON.parse(
      typeof event.data === "string" ? event.data : String(event.data),
    );

    if (message.id !== undefined) {
      const entry = this.#pending.get(message.id);
      if (!entry) return;
      this.#pending.delete(message.id);
      if (message.error) {
        entry.reject(
          new Error(`${entry.method}: ${message.error.message ?? "CDP error"}`),
        );
      } else {
        entry.resolve(message.result);
      }
      return;
    }

    // Event. `sessionId` is on the envelope, not the params.
    const handlers = this.#listeners.get(message.method);
    if (handlers) {
      for (const handler of handlers) handler(message.params, message.sessionId);
    }
  }

  send(method, params = {}, sessionId) {
    const id = this.#nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method });
      this.#socket.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.#pending.has(id)) {
          this.#pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 30000);
    });
  }

  on(method, handler) {
    if (!this.#listeners.has(method)) this.#listeners.set(method, new Set());
    this.#listeners.get(method).add(handler);
    return () => this.#listeners.get(method)?.delete(handler);
  }

  close() {
    try {
      this.#socket.close();
    } catch {
      /* already closed */
    }
  }
}

/** Open a page and attach a flat session to it. */
export async function openPage(client) {
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);

  const consoleMessages = [];
  const pageErrors = [];

  client.on("Runtime.consoleAPICalled", (params, sid) => {
    if (sid !== sessionId) return;
    const text = (params.args ?? [])
      .map((a) => a.value ?? a.description ?? a.unserializableValue ?? "")
      .join(" ");
    consoleMessages.push({ level: params.type, text });
  });

  client.on("Runtime.exceptionThrown", (params, sid) => {
    if (sid !== sessionId) return;
    const d = params.exceptionDetails;
    pageErrors.push(d?.exception?.description ?? d?.text ?? "unknown error");
  });

  return {
    sessionId,
    targetId,
    consoleMessages,
    pageErrors,

    async setViewport({ width, height, deviceScaleFactor = 1, mobile = false }) {
      await client.send(
        "Emulation.setDeviceMetricsOverride",
        {
          width,
          height,
          deviceScaleFactor,
          mobile,
          screenWidth: width,
          screenHeight: height,
        },
        sessionId,
      );
    },

    async goto(url, { waitMs = 0 } = {}) {
      const loaded = new Promise((resolve) => {
        const off = client.on("Page.loadEventFired", (_params, sid) => {
          if (sid !== sessionId) return;
          off();
          resolve();
        });
      });
      await client.send("Page.navigate", { url }, sessionId);
      await loaded;
      if (waitMs) await sleep(waitMs);
    },

    async evaluate(fn, ...args) {
      const expression = `(${fn.toString()})(${args
        .map((a) => JSON.stringify(a))
        .join(",")})`;
      const result = await client.send(
        "Runtime.evaluate",
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      );
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ??
            result.exceptionDetails.text,
        );
      }
      return result.result.value;
    },

    /**
     * @param {{ fullPage?: boolean, format?: "png" | "jpeg" | "webp", quality?: number }} options
     *
     * `jpeg` at a quality around 82 is the default for full-page captures, and
     * not for convenience: these pages are mostly flat colour and photography,
     * and an 8MB PNG of a menu page is a repository problem rather than an
     * image problem. Lossy is the right trade for a screenshot nobody measures
     * pixels from — the alternative is a README that is slow to clone and a
     * git history carrying 26MB of PNGs forever.
     */
    async screenshot({ fullPage = true, format = "jpeg", quality = 82 } = {}) {
      const params = { format, captureBeyondViewport: fullPage };
      if (format === "jpeg" || format === "webp") params.quality = quality;
      if (fullPage) {
        // Next's streaming shell means the real document is often taller than the
        // emulated viewport by a lot. Measure it rather than guessing, because a
        // full-page shot clipped at the viewport height silently crops the footer.
        const metrics = await client.send("Page.getLayoutMetrics", {}, sessionId);
        const height = Math.ceil(metrics.cssContentSize?.height ?? 800);
        const width = Math.ceil(metrics.cssContentSize?.width ?? 1280);
        params.clip = { x: 0, y: 0, width, height: Math.min(height, 30000), scale: 1 };
      }
      const { data } = await client.send(
        "Page.captureScreenshot",
        params,
        sessionId,
      );
      return Buffer.from(data, "base64");
    },

    async close() {
      await client.send("Target.closeTarget", { targetId }).catch(() => {});
    },
  };
}

export { sleep };
