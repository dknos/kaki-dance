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

const errors = [];
const failedRequests = [];
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
watch(page, errors, failedRequests);

await page.goto(baseUrl, { waitUntil: "networkidle" });
assert.equal(await page.locator("[data-start-mode='frolic']").isVisible(), true);
assert.equal(await page.locator("[data-start-mode='measure']").isVisible(), true);
assert.equal(await page.locator("[data-start-mode='stepShed']").isVisible(), true);
assert.equal(await page.locator("[data-frolic-style]").count(), 3);
await page.click("[data-start-mode='frolic']");
await page.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "running");
await page.waitForFunction(
  () => globalThis.kakiDance.getSnapshot().simulation?.frolic?.tick >= 0,
  undefined,
  { timeout: 15_000 },
);
await page.keyboard.press("Space");
await page.waitForTimeout(18);
const immediate = await page.evaluate(() => {
  const value = globalThis.kakiDance.getSnapshot();
  return {
    mode: value.mode,
    style: value.frolicStyle,
    input: value.simulation?.frolic?.lastInput,
    microResponse: value.simulation?.dancer?.microResponse,
    topology: value.simulation?.character?.topology,
    practice: value.simulation?.frolic?.practice,
  };
});
assert.equal(immediate.mode, "frolic");
assert.equal(immediate.style, "flatfoot");
assert.equal(immediate.input.kind, "step");
assert.ok(immediate.microResponse > 0);
assert.equal(immediate.topology, "biped");
assert.equal(immediate.practice, null);

for (const code of ["KeyF", "ShiftLeft", "Space"]) {
  await page.keyboard.press(code);
  await page.waitForTimeout(260);
}
const runtime = await page.evaluate(() => ({
  snapshot: globalThis.kakiDance.getSnapshot(),
  resources: performance.getEntriesByType("resource").map((entry) => entry.name),
}));
runtime.frameProfile = await page.evaluate(() => new Promise((resolveProfile) => {
    const times = [];
    let previous = performance.now();
    function next(now) {
      times.push(now - previous);
      previous = now;
      if (times.length < 120) requestAnimationFrame(next);
      else {
        const ordered = times.slice(4).sort((left, right) => left - right);
        resolveProfile({
          samples: ordered.length,
          averageMs: ordered.reduce((sum, value) => sum + value, 0) / ordered.length,
          p95Ms: ordered[Math.floor(ordered.length * 0.95)],
          maxMs: ordered.at(-1),
        });
      }
    }
    requestAnimationFrame(next);
  }));
const frolicAtlases = runtime.resources.filter((url) => /\/heroes\/.+\/frolic\/.+\/atlas\.json$/.test(url));
const frolicPages = runtime.resources.filter((url) => /\/heroes\/.+\/frolic\/.+\/atlas-\d+\.png$/.test(url));
assert.equal(frolicAtlases.length, 1);
assert.equal(frolicPages.length, 1);
assert.match(frolicAtlases[0], /kitty\/frolic\/flatfoot/);
assert.ok(runtime.resources.some((url) => url.endsWith("/assets/audio/frolic/board-and-bow.wav")));
assert.ok(runtime.resources.some((url) => url.endsWith("/assets/audio/frolic/feet/manifest.json")));
assert.ok(runtime.frameProfile.p95Ms < 24);

await page.goto(`${baseUrl}/frolic-lab.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => globalThis.frolicLab?.getState?.().activePacks?.length === 1);
await page.check("#frolic-skeleton");
await page.check("#frolic-contacts");
await page.check("#frolic-com");
await page.selectOption("#frolic-hero", "soder");
await page.selectOption("#frolic-style", "clog");
await page.selectOption("#frolic-move", "crisscross");
await page.waitForFunction(() => globalThis.frolicLab?.getState?.().activePacks?.[0] === "soder:clog");
const lab = await page.evaluate(() => ({
  state: globalThis.frolicLab.getState(),
  nativeSize: [globalThis.frolicLab.canvas.width, globalThis.frolicLab.canvas.height],
  neutralSize: [globalThis.frolicLab.neutralCanvas.width, globalThis.frolicLab.neutralCanvas.height],
  imageRendering: getComputedStyle(globalThis.frolicLab.canvas).imageRendering,
  readout: document.getElementById("frolic-data").textContent,
  atlas: document.getElementById("frolic-atlas-page").naturalWidth,
}));
lab.renderProfile = await page.evaluate(() => {
  const samples = 600;
  const startedAt = performance.now();
  for (let index = 0; index < samples; index += 1) globalThis.frolicLab.render();
  const elapsedMs = performance.now() - startedAt;
  return {
    samples,
    elapsedMs,
    averageMs: elapsedMs / samples,
  };
});
assert.deepEqual(lab.state.activePacks, ["soder:clog"]);
assert.deepEqual(lab.nativeSize, [384, 216]);
assert.deepEqual(lab.neutralSize, [384, 216]);
assert.match(lab.imageRendering, /pixelated|crisp-edges/);
assert.match(lab.readout, /TOPOLOGY\s+biped/);
assert.match(lab.readout, /LEFT FOOT/);
assert.match(lab.readout, /RIGHT FOOT/);
assert.equal(lab.atlas, 1024);

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.click("[data-character='soder']");
await page.click("[data-frolic-style='clog']");
await page.click("[data-start-mode='frolic']");
await page.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "running");
const soder = await page.evaluate(() => ({
  state: globalThis.kakiDance.getSnapshot(),
  resources: performance.getEntriesByType("resource").map((entry) => entry.name),
}));
assert.equal(soder.state.character, "soder");
assert.equal(soder.state.frolicStyle, "clog");
assert.equal(soder.state.simulation.character.topology, "biped");
assert.ok(soder.resources.some((url) => /soder\/frolic\/clog\/atlas\.json$/.test(url)));

const touchContext = await browser.newContext({
  viewport: { width: 844, height: 390 },
  screen: { width: 844, height: 390 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});
const touchPage = await touchContext.newPage();
watch(touchPage, errors, failedRequests);
await touchPage.goto(baseUrl, { waitUntil: "networkidle" });
await touchPage.click("[data-start-mode='frolic']");
await touchPage.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "running");
await touchPage.waitForFunction(
  () => globalThis.kakiDance.getSnapshot().simulation?.frolic?.tick >= 0,
  undefined,
  { timeout: 15_000 },
);
await touchPage.locator("[data-control='action']").tap();
await touchPage.waitForTimeout(32);
const touchInput = await touchPage.evaluate(() => {
  const snapshot = globalThis.kakiDance.getSnapshot();
  return {
    lastInput: snapshot.simulation?.frolic?.lastInput,
    microResponse: snapshot.simulation?.dancer?.microResponse,
  };
});
assert.equal(touchInput.lastInput.kind, "step");
assert.equal(touchInput.lastInput.device, "touch");
assert.ok(touchInput.microResponse > 0);
const touch = await touchPage.evaluate(() => {
  const canvas = document.getElementById("game-canvas").getBoundingClientRect();
  const buttons = [...document.querySelectorAll("#touch-controls .touch-buttons button")].map((button) => {
    const rect = button.getBoundingClientRect();
    return {
      label: button.textContent,
      control: button.dataset.control,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      right: rect.right,
    };
  });
  return {
    mode: document.getElementById("app").dataset.mode,
    buttons,
    canvas: { left: canvas.left, width: canvas.width },
  };
});
assert.equal(touch.mode, "frolic");
assert.deepEqual(
  Object.fromEntries(touch.buttons.map((button) => [button.control, button.label])),
  { style: "BRUSH", power: "DRIVE", freeze: "LICK", action: "STEP" },
);
assert.ok(touch.buttons.every((button) => button.width >= 65 && button.height >= 39));
const heroFootRight = touch.canvas.left + touch.canvas.width * 0.64;
assert.ok(touch.buttons.every((button) => button.left > heroFootRight));
await touchPage.screenshot({
  path: resolve(outputDir, "frolic-touch-controls.png"),
  fullPage: true,
});
await touchContext.close();

for (const resource of [...runtime.resources, ...soder.resources]) {
  const url = new URL(resource);
  assert.equal(url.origin, new URL(baseUrl).origin, resource);
}
assert.deepEqual(errors, []);
assert.deepEqual(failedRequests, []);

const report = {
  capturedAt: new Date().toISOString(),
  url: baseUrl,
  immediate,
  selectedPackResources: {
    metadata: frolicAtlases.map(localPath),
    pages: frolicPages.map(localPath),
  },
  frameProfile: runtime.frameProfile,
  lab,
  soder: {
    topology: soder.state.simulation.character.topology,
    style: soder.state.frolicStyle,
  },
  touch,
  touchInput,
  errors,
  failedRequests,
};
writeFileSync(
  resolve(outputDir, "frolic-browser-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
await browser.close();

function watch(target, pageErrors, requestErrors) {
  target.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  target.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(`console: ${message.text()}`);
  });
  target.on("requestfailed", (request) => {
    requestErrors.push(`${request.url()} — ${request.failure()?.errorText}`);
  });
}

function localPath(value) {
  return value.replace(new URL(baseUrl).origin, "");
}
