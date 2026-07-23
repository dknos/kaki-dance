import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.KAKI_DANCE_URL ?? "http://127.0.0.1:4177";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(projectRoot, "docs/images/qa-browser");
mkdirSync(outputDir, { recursive: true });

const workspaceChromium = "/home/nemoclaw/bin/chromium";
const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync(workspaceChromium) ? workspaceChromium : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
const failedRequests = [];
page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => failedRequests.push(`${request.url()} — ${request.failure()?.errorText}`));

await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "title");
await page.screenshot({ path: resolve(outputDir, "title-kitty.png") });

await page.locator('[data-start-mode="practice"]').click();
await page.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "running");
await page.keyboard.press("Space");
await page.waitForTimeout(900);
await page.keyboard.down("ArrowDown");
await page.waitForTimeout(70);
await page.keyboard.press("Space");
await page.waitForTimeout(70);
await page.keyboard.up("ArrowDown");
await page.waitForTimeout(720);
await page.keyboard.press("Space");
await page.waitForTimeout(1980);
await page.keyboard.press("ShiftLeft");
await page.waitForTimeout(590);
await page.keyboard.down("KeyT");
await page.waitForTimeout(520);
await page.screenshot({ path: resolve(outputDir, "golden-chain-kitty.png") });
const freezeSnapshot = await page.evaluate(() => {
  const snapshot = globalThis.kakiDance.getSnapshot().simulation;
  return {
    move: snapshot?.dancer?.moveId,
    family: snapshot?.dancer?.family,
    stamina: snapshot?.dancer?.stamina,
    contacts: snapshot?.dancer?.contacts?.contacts?.length,
    contactError: snapshot?.dancer?.contacts?.error,
    balance: snapshot?.dancer?.balance,
  };
});
await page.keyboard.up("KeyT");
await page.waitForTimeout(820);
await page.keyboard.down("ArrowUp");
await page.keyboard.press("Space");
await page.waitForTimeout(80);
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(780);
await page.screenshot({ path: resolve(outputDir, "golden-chain-recovery-kitty.png") });

const practiceSnapshot = await page.evaluate(() => {
  const snapshot = globalThis.kakiDance.getSnapshot();
  return {
    state: snapshot.state,
    mode: snapshot.mode,
    move: snapshot.simulation?.dancer?.moveId,
    family: snapshot.simulation?.dancer?.family,
    stamina: snapshot.simulation?.dancer?.stamina,
    contacts: snapshot.simulation?.dancer?.contacts?.contacts?.length,
    contactError: snapshot.simulation?.dancer?.contacts?.error,
    beat: snapshot.simulation?.beat?.beat,
    chainIndex: snapshot.simulation?.practiceChainIndex,
    next: snapshot.simulation?.practiceNext,
  };
});

await page.keyboard.press("Escape");
await page.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "paused");
const pausedBeatA = await page.evaluate(() => globalThis.kakiDance.getSnapshot().simulation?.beat?.beat);
await page.waitForTimeout(320);
const pausedBeatB = await page.evaluate(() => globalThis.kakiDance.getSnapshot().simulation?.beat?.beat);
await page.screenshot({ path: resolve(outputDir, "pause-resume.png") });
await page.locator("#resume-button").click();
await page.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "running");
await page.waitForTimeout(320);
const resumedBeat = await page.evaluate(() => globalThis.kakiDance.getSnapshot().simulation?.beat?.beat);
await page.keyboard.press("Escape");
await page.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "paused");
await page.locator("#quit-button").click();
await page.locator("#settings-button").click();
await page.screenshot({ path: resolve(outputDir, "accessibility-settings.png") });
const settingsVisible = await page.locator("#settings-layer").evaluate((element) => ({
  scrollHeight: element.scrollHeight,
  clientHeight: element.clientHeight,
  crowdControl: Boolean(element.querySelector("#setting-crowd")),
}));
await page.locator("#settings-layer [data-close-layer]").click();
await page.locator("#controls-button").click();
await page.screenshot({ path: resolve(outputDir, "controller-prompts.png") });
await page.locator("#controls-layer [data-close-layer]").click();
await page.locator('[data-character="soder"]').click();
await page.locator('[data-start-mode="practice"]').click();
await page.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "running");
await page.keyboard.press("Space");
await page.waitForTimeout(520);
await page.screenshot({ path: resolve(outputDir, "practice-soder.png") });
const soderSnapshot = await page.evaluate(() => {
  const snapshot = globalThis.kakiDance.getSnapshot().simulation;
  return {
    character: snapshot?.character?.id,
    topology: snapshot?.dancer?.rig?.topology,
    move: snapshot?.dancer?.moveId,
  };
});
await page.evaluate(() => globalThis.kakiDance.restart());
await page.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "running");
const restartSnapshot = await page.evaluate(() => {
  const snapshot = globalThis.kakiDance.getSnapshot();
  return {
    state: snapshot.state,
    character: snapshot.character,
    beat: snapshot.simulation?.beat?.beat,
  };
});
const frameProfile = await page.evaluate(() => new Promise((resolveProfile) => {
  const times = [];
  const sample = (time) => {
    times.push(time);
    if (times.length < 121) {
      requestAnimationFrame(sample);
      return;
    }
    const deltas = times.slice(1).map((value, index) => value - times[index]).sort((a, b) => a - b);
    resolveProfile({
      samples: deltas.length,
      averageMs: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
      p95Ms: deltas[Math.floor(deltas.length * 0.95)],
      maxMs: deltas.at(-1),
    });
  };
  requestAnimationFrame(sample);
}));
const renderProfile = await page.evaluate(async () => {
  const [{ KakiDanceRenderer }, { buildMoveQaSnapshot }] = await Promise.all([
    import("./js/render/renderer.js"),
    import("./js/render/qa-frame.js"),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 216;
  const renderer = new KakiDanceRenderer(canvas, {
    settings: { beatPulse: true, reducedMotion: false, reduceFlashes: true, screenShake: 0 },
  });
  const snapshot = buildMoveQaSnapshot({ character: "soder", moveId: "windmill", phase: 0.48 });
  for (let index = 0; index < 30; index += 1) renderer.render(snapshot);
  const samples = 600;
  const started = performance.now();
  for (let index = 0; index < samples; index += 1) {
    renderer.update(1 / 60, snapshot);
    renderer.render(snapshot);
  }
  const elapsed = performance.now() - started;
  return { samples, elapsedMs: elapsed, averageMs: elapsed / samples };
});

await page.goto(`${baseUrl}/lab.html`, { waitUntil: "networkidle" });
await page.waitForSelector("#lab-canvas");
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(outputDir, "animation-lab.png") });
const labReadout = await page.locator("#lab-readout").textContent();

await page.goto(`${baseUrl}/qa.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".qa-card canvas");
await page.waitForTimeout(800);
const qaCards = await page.locator(".qa-card").count();
await page.goto(`${baseUrl}/qa.html?family=freeze`, { waitUntil: "networkidle" });
await page.waitForSelector(".qa-card canvas");
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(outputDir, "qa-gallery.png"), fullPage: true });
const qaFreezeCards = await page.locator(".qa-card").count();

const touchContext = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});
const touchPage = await touchContext.newPage();
touchPage.on("pageerror", (error) => errors.push(`touch: ${error.stack ?? error.message}`));
touchPage.on("console", (message) => {
  if (message.type() === "error") errors.push(`touch console: ${message.text()}`);
});
touchPage.on("requestfailed", (request) => failedRequests.push(`touch: ${request.url()} — ${request.failure()?.errorText}`));
await touchPage.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
await touchPage.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "title");
await touchPage.locator('[data-start-mode="practice"]').tap();
await touchPage.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().state === "running");
await touchPage.locator('[data-control="action"]').tap();
await touchPage.waitForTimeout(420);
const touchVisible = await touchPage.locator("#touch-controls").evaluate((element) => ({
  display: getComputedStyle(element).display,
  width: element.getBoundingClientRect().width,
  height: element.getBoundingClientRect().height,
}));
await touchPage.screenshot({ path: resolve(outputDir, "touch-layout.png") });
const lifecycleDestroy = await touchPage.evaluate(() => {
  globalThis.kakiDance.destroy();
  return {
    state: globalThis.kakiDance.getSnapshot().state,
    hostChildren: document.getElementById("app").childElementCount,
  };
});
await touchContext.close();

const report = {
  url: baseUrl,
  capturedAt: new Date().toISOString(),
  freezeSnapshot,
  practiceSnapshot,
  pauseResume: {
    pausedBeatA,
    pausedBeatB,
    pausedDriftBeats: Math.abs(pausedBeatB - pausedBeatA),
    resumedAdvanceBeats: resumedBeat - pausedBeatB,
  },
  settingsVisible,
  soderSnapshot,
  restartSnapshot,
  frameProfile,
  renderProfile,
  labReadout,
  qaCards,
  qaFreezeCards,
  touchVisible,
  lifecycleDestroy,
  errors,
  failedRequests,
};
writeFileSync(resolve(outputDir, "smoke-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

await browser.close();
if (errors.length || failedRequests.length) process.exitCode = 1;
