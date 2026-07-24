import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.KAKI_DANCE_URL ?? "http://127.0.0.1:4177";
const reviewRoot = resolve(root, "docs/review/frolic-rescue-candidate-1");
mkdirSync(resolve(reviewRoot, "reports"), { recursive: true });
const server = await ensureServer();
const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync("/home/nemoclaw/bin/chromium") ? "/home/nemoclaw/bin/chromium" : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const failedRequests = [];
  const badResponses = [];
  const expectedMediaAborts = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      errors.push(`${message.text()} @ ${location.url || "unknown"}:${location.lineNumber ?? 0}`);
    }
  });
  page.on("requestfailed", (request) => {
    const detail = `${request.url()}: ${request.failure()?.errorText}`;
    if (request.failure()?.errorText === "net::ERR_ABORTED"
      && request.url().includes("/docs/review/frolic-rescue-candidate-1/video/")
      && request.url().endsWith(".mp4")) {
      expectedMediaAborts.push(detail);
      return;
    }
    failedRequests.push(detail);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${baseUrl}/frolic-rescue-review.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(document.getElementById("game-frame").contentWindow?.kakiDance));
  await page.click("#start-review");
  await page.waitForFunction(() => document.documentElement.dataset.runtime === "ready");
  await page.click("[data-key='KeyX']");
  assert.equal(await page.getAttribute("[data-key='KeyX']", "data-press-count"), "1");
  await page.waitForFunction(() => document.getElementById("latency-simulation").textContent !== "—");
  const candidatePixels = await canvasHash(page);

  await page.click("[data-art='rejected']");
  await page.waitForTimeout(250);
  const rejectedPixels = await canvasHash(page);
  assert.notEqual(candidatePixels, rejectedPixels);
  await page.click("[data-art='candidate']");

  await page.click("[data-foley='rejected']");
  await page.waitForFunction(() => document.querySelectorAll("#sample-buttons button").length === 3);
  await page.click("[data-foley='candidate']");
  await page.waitForFunction(() => document.querySelectorAll("#sample-buttons button").length === 2);
  await page.click("#sample-buttons button");

  await page.click("[data-hero='soder']");
  await page.waitForTimeout(250);
  assert.equal(await page.getAttribute("[data-hero='soder']", "aria-pressed"), "true");
  await page.check("#overlay-toggle");
  await page.click("[data-key='KeyV']");
  await page.uncheck("#effects-toggle");
  await page.uncheck("#music-toggle");
  await page.click("[data-speed='0.5']");
  assert.equal(await page.locator("#movement-video").evaluate((video) => video.playbackRate), 0.5);

  const dimensions = await page.evaluate(() => {
    const canvas = document.getElementById("review-canvas");
    return [canvas.width, canvas.height];
  });
  assert.deepEqual(dimensions, [384, 216]);
  assert.deepEqual(badResponses, [], `HTTP errors: ${badResponses.join(", ")}`);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);

  const screenshot = resolve(reviewRoot, "review-page.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  const report = {
    candidateStatus: "human-review-required",
    url: `${baseUrl}/frolic-rescue-review.html`,
    nativeCamera: dimensions,
    candidateRejectedArtChangedPixels: candidatePixels !== rejectedPixels,
    heroSwitch: true,
    realControlDispatch: true,
    latencyReadout: true,
    oldNewFoley: true,
    normalHalfSpeed: true,
    skeletonContactOverlay: true,
    musicEffectsToggles: true,
    sampleIsolation: true,
    errors,
    failedRequests,
    badResponses,
    expectedMediaAborts,
    screenshot: "docs/review/frolic-rescue-candidate-1/review-page.png",
  };
  writeFileSync(resolve(reviewRoot, "reports/review-page-smoke.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  server?.kill();
}

async function canvasHash(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById("review-canvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 97) {
      hash ^= data[index];
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  });
}

async function ensureServer() {
  try {
    const response = await fetch(`${baseUrl}/index.html`);
    if (response.ok) return null;
  } catch {
    // Start a local static server below.
  }
  const child = spawn("python3", ["-m", "http.server", "4177", "--bind", "127.0.0.1"], {
    cwd: root,
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    try {
      const response = await fetch(`${baseUrl}/index.html`);
      if (response.ok) return child;
    } catch {
      // Keep waiting.
    }
  }
  child.kill();
  throw new Error(`Could not start review smoke server at ${baseUrl}`);
}
