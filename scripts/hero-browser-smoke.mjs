import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.KAKI_DANCE_URL ?? "http://127.0.0.1:4177";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(projectRoot, "docs/images/hero-rescue/after");
mkdirSync(outputDir, { recursive: true });
const workspaceChromium = "/home/nemoclaw/bin/chromium";
const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync(workspaceChromium) ? workspaceChromium : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
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

await page.goto(`${baseUrl}/hero-lab.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => globalThis.heroLab?.getState?.().snapshots?.soder);
await page.selectOption("#hero-speed", "0");
await page.fill("#hero-stamina", "18");
await page.fill("#hero-balance", "0.84");
const moves = [
  ["basicRock", 0.24],
  ["basicGoDown", 0.62],
  ["sixStep", 1 / 3],
  ["windmill", 0.5],
  ["babyFreeze", 0.55],
  ["cleanGetUp", 0.55],
];
const samples = [];
for (const mirror of [false, true]) {
  for (const [moveId, nextPhase] of moves) {
    samples.push(await page.evaluate(({ moveId: id, nextPhase: phase, mirror: mirrored }) => {
      globalThis.heroLab.setState({
        moveId: id,
        nextPhase: phase,
        mirror: mirrored,
        chain: false,
        speed: 0,
      });
      const state = globalThis.heroLab.getState();
      return Object.fromEntries(["kitty", "soder"].map((character) => {
        const snapshot = state.snapshots[character];
        return [character, {
          topology: snapshot.dancer.rig.topology,
          finite: snapshot.dancer.rig.finite,
          boneError: snapshot.dancer.rig.maxBoneLengthError,
          contactError: snapshot.dancer.contacts.measured.largest,
          anchors: Object.keys(snapshot.dancer.rig.anchors).length,
        }];
      }));
    }, { moveId, nextPhase, mirror }));
  }
}
const lab = await page.evaluate(() => ({
  contactCards: document.querySelectorAll(".contact-card").length,
  nativeSize: [
    globalThis.heroLab.canvas.width,
    globalThis.heroLab.canvas.height,
  ],
  imageRendering: getComputedStyle(globalThis.heroLab.canvas).imageRendering,
  kittyStatus: document.getElementById("kitty-bone-status").textContent,
  soderStatus: document.getElementById("soder-bone-status").textContent,
  forcedStamina: Number(document.getElementById("hero-stamina").value),
  forcedBalance: Number(document.getElementById("hero-balance").value),
  zoom2: [
    document.getElementById("hero-lab-2x").width,
    document.getElementById("hero-lab-2x").height,
  ],
  zoom4: [
    document.getElementById("hero-lab-4x").width,
    document.getElementById("hero-lab-4x").height,
  ],
}));
await page.check("#hero-silhouette");
await page.click("#hero-next-frame");
await page.check("#hero-mirror");
await page.uncheck("#hero-silhouette");

await page.goto(`${baseUrl}/hero-rescue.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".comparison-card");
const reviewBoard = await page.evaluate(() => ({
  comparisons: document.querySelectorAll(".comparison-card").length,
  videos: document.querySelectorAll(".motion-grid video").length,
  silhouettes: document.querySelectorAll(".silhouette-grid figure").length,
  brokenImages: [...document.images]
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .map((image) => image.src),
  nativeProofImages: [...document.querySelectorAll(".frame-pair img")].every(
    (image) => image.naturalWidth === 384 && image.naturalHeight === 216,
  ),
}));
await page.screenshot({
  path: resolve(outputDir, "review-board.png"),
  fullPage: false,
});

assert.deepEqual(lab.nativeSize, [384, 216]);
assert.deepEqual(lab.zoom2, [384, 216]);
assert.deepEqual(lab.zoom4, [384, 216]);
assert.match(lab.imageRendering, /pixelated|crisp-edges/);
assert.equal(lab.contactCards, 28);
assert.match(lab.kittyStatus, /BIPED/);
assert.match(lab.soderStatus, /BIPED/);
assert.equal(lab.forcedStamina, 18);
assert.equal(lab.forcedBalance, 0.84);
for (const sample of samples) {
  for (const character of ["kitty", "soder"]) {
    assert.equal(sample[character].topology, "biped");
    assert.equal(sample[character].finite, true);
    assert.ok(sample[character].anchors >= 28);
    assert.ok(sample[character].boneError <= 1e-6);
    assert.ok(sample[character].contactError <= 0.01);
  }
}
assert.equal(reviewBoard.comparisons, 12);
assert.equal(reviewBoard.videos, 2);
assert.equal(reviewBoard.silhouettes, 6);
assert.deepEqual(reviewBoard.brokenImages, []);
assert.equal(reviewBoard.nativeProofImages, true);
assert.deepEqual(errors, []);
assert.deepEqual(failedRequests, []);

const report = {
  url: baseUrl,
  capturedAt: new Date().toISOString(),
  lab,
  sampledStates: samples.length * 2,
  worstBoneError: Math.max(...samples.flatMap(
    (sample) => ["kitty", "soder"].map((character) => sample[character].boneError),
  )),
  worstContactError: Math.max(...samples.flatMap(
    (sample) => ["kitty", "soder"].map((character) => sample[character].contactError),
  )),
  reviewBoard,
  errors,
  failedRequests,
};
writeFileSync(
  resolve(outputDir, "hero-browser-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
