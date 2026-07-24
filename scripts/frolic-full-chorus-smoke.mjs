import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.KAKI_DANCE_URL ?? "http://127.0.0.1:4177";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(projectRoot, "docs/images/appalachian/final");
mkdirSync(outputDir, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync("/home/nemoclaw/bin/chromium") ? "/home/nemoclaw/bin/chromium" : undefined);

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const errors = [];
const failedRequests = [];
page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  failedRequests.push(`${request.url()} — ${request.failure()?.errorText}`);
});

try {
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.click("[data-start-mode='frolic']");
await page.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "running");
try {
  await page.waitForFunction(
    () => globalThis.kakiDance.getSnapshot().simulation?.frolic?.tick >= 0,
    undefined,
    { timeout: 15_000 },
  );
} catch {
  const probe = await page.evaluate(() => ({
    visibility: document.visibilityState,
    snapshot: globalThis.kakiDance.getSnapshot(),
  }));
  throw new Error(JSON.stringify({
    message: "Frolic count-in clock did not advance.",
    state: probe.snapshot.state,
    tick: probe.snapshot.simulation?.frolic?.tick,
    visibility: probe.visibility,
    errors,
    failedRequests,
  }, null, 2));
}

const inputPlan = [];
for (let tick = 0; tick < 32 * 4 * 96; tick += 96) inputPlan.push({ tick, code: "Space" });
for (let bar = 0; bar < 32; bar += 1) inputPlan.push({ tick: bar * 384 + 48, code: "KeyF" });
for (let bar = 0; bar < 32; bar += 2) inputPlan.push({ tick: bar * 384 + 240, code: "ShiftLeft" });
for (const bar of [8, 16, 24, 32]) inputPlan.push({ tick: bar * 384 - 48, code: "KeyT" });
inputPlan.sort((left, right) => left.tick - right.tick);

let cursor = 0;
const startedAt = performance.now();
const progress = [];
let nextProgressTick = 0;
while (performance.now() - startedAt < 80_000) {
  const value = await page.evaluate(() => globalThis.kakiDance.getSnapshot());
  if (errors.length || failedRequests.length) {
    throw new Error(JSON.stringify({
      state: value.state,
      tick: value.simulation?.frolic?.tick,
      errors,
      failedRequests,
    }));
  }
  if (value.state === "results") break;
  const tick = value.simulation?.frolic?.tick ?? -1;
  if (tick >= nextProgressTick) {
    progress.push({
      elapsedSeconds: (performance.now() - startedAt) / 1000,
      tick,
      bar: value.simulation?.frolic?.bar,
      state: value.simulation?.frolic?.state,
      audioClockFallback: value.transport?.audioClockFallback,
    });
    nextProgressTick += 1_536;
  }
  while (cursor < inputPlan.length && inputPlan[cursor].tick <= tick) {
    await page.keyboard.press(inputPlan[cursor].code);
    cursor += 1;
  }
  await page.waitForTimeout(16);
}

try {
  await page.waitForFunction(
    () => globalThis.kakiDance.getSnapshot().state === "results",
    undefined,
    { timeout: 8_000 },
  );
} catch {
  const probe = await page.evaluate(() => globalThis.kakiDance.getSnapshot());
  throw new Error(JSON.stringify({
    message: "Frolic did not reach results.",
    state: probe.state,
    tick: probe.simulation?.frolic?.tick,
    remainingBeats: probe.simulation?.remainingBeats,
    progress,
    errors,
    failedRequests,
  }, null, 2));
}
const result = await page.evaluate(() => {
  const snapshot = globalThis.kakiDance.getSnapshot();
  const cells = [...document.querySelectorAll("#judge-grid .judge-score")].map((cell) => ({
    label: cell.querySelector("span")?.textContent,
    score: Number(cell.querySelector("strong")?.textContent),
  }));
  return {
    state: snapshot.state,
    mode: snapshot.mode,
    transport: snapshot.transport,
    score: snapshot.simulation?.frolic?.score,
    resultsKicker: document.getElementById("results-kicker").textContent,
    resultsTitle: document.getElementById("results-title").textContent,
    resultsReason: document.getElementById("results-reason").textContent,
    cells,
    layerVisible: !document.getElementById("results-layer").hidden,
  };
});
assert.equal(result.state, "results");
assert.equal(result.mode, "frolic");
assert.equal(result.layerVisible, true);
assert.deepEqual(result.cells.map((cell) => cell.label), [
  "time", "tune", "flow", "footwork", "spirit",
]);
assert.ok(result.cells.every((cell) => Number.isFinite(cell.score)));
assert.equal(cursor, inputPlan.length);
assert.deepEqual(errors, []);
assert.deepEqual(failedRequests, []);

const screenshot = resolve(outputDir, "frolic-full-chorus-results.png");
await page.screenshot({ path: screenshot, fullPage: true });
const report = {
  capturedAt: new Date().toISOString(),
  sourceUrl: baseUrl,
  realTimeSeconds: (performance.now() - startedAt) / 1000,
  plannedInputs: inputPlan.length,
  deliveredInputs: cursor,
  progress,
  result,
  screenshot: "docs/images/appalachian/final/frolic-full-chorus-results.png",
  errors,
  failedRequests,
};
writeFileSync(
  resolve(outputDir, "frolic-full-chorus-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
} finally {
await browser.close();
}
