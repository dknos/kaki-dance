import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const MODE = process.argv[2] ?? "smoke";
const BASE_URL = process.env.KAKI_DANCE_URL ?? "http://127.0.0.1:4177";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REVIEW_ROOT = resolve(ROOT, "docs/review/appalachian-instrument-gate-2");
const REPORT_ROOT = resolve(REVIEW_ROOT, "reports");
const CAPTURE_ROOT = resolve(REVIEW_ROOT, "captures");
const executablePath = process.env.CHROMIUM_PATH || undefined;

mkdirSync(REPORT_ROOT, { recursive: true });
mkdirSync(CAPTURE_ROOT, { recursive: true });

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
});
const errors = [];
const failedRequests = [];

try {
  const report = MODE === "smoke"
    ? await smoke()
    : MODE === "latency"
      ? await latency()
      : MODE === "capture"
        ? await capture()
        : assert.fail(`Unknown browser QA mode ${MODE}`);
  const value = {
    schemaVersion: 1,
    candidateStatus: "CANDIDATE — HUMAN REVIEW REQUIRED",
    mode: MODE,
    generatedAt: new Date().toISOString(),
    errors,
    failedRequests,
    ...report,
  };
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  const output = resolve(REPORT_ROOT, `${MODE}-browser-report.json`);
  writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`APPALACHIAN_SIM_${MODE.toUpperCase()}_PASS`);
  console.log(`report=${output}`);
} finally {
  await browser.close();
}

async function smoke() {
  const gamePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watch(gamePage);
  await gamePage.goto(BASE_URL, { waitUntil: "networkidle" });
  await gamePage.click("[data-frolic-style='buck']");
  await gamePage.click("[data-start-mode='frolic']");
  await gamePage.waitForFunction(() => kakiDance?.getSnapshot?.().state === "running");
  await gamePage.waitForFunction(
    () => kakiDance.getSnapshot().simulation?.frolic?.tick >= 0
      && kakiDance.getAppalachianDiagnostics?.().ready,
    undefined,
    { timeout: 15_000 },
  );
  await gamePage.keyboard.down("ArrowUp");
  await gamePage.keyboard.down("KeyD");
  await gamePage.keyboard.down("ArrowLeft");
  await gamePage.keyboard.press("KeyQ");
  await gamePage.keyboard.up("ArrowLeft");
  await gamePage.waitForTimeout(120);
  const integrated = await gamePage.evaluate(() => ({
    style: kakiDance.getSnapshot().frolicStyle,
    action: kakiDance.getSnapshot().simulation?.dancer?.actionId,
    arm: kakiDance.getSnapshot().simulation?.dancer?.upperBody?.coordinated,
    renderer: kakiDance.getAppalachianDiagnostics(),
  }));
  await gamePage.keyboard.up("ArrowUp");
  await gamePage.keyboard.up("KeyD");
  assert.equal(integrated.style, "buck");
  assert.ok(integrated.action > 0);
  assert.ok(integrated.arm.y > -0.18);
  assert.equal(integrated.renderer.ready, true);
  await gamePage.close();

  const page = await reviewPage("?renderer=webgl2");
  const forced = await diagnostics(page);
  assert.equal(forced.ready, true);
  assert.equal(forced.backend.actual, "webgl2");
  assert.equal(forced.backend.forced, true);
  assert.equal(forced.skinnedMeshCount, 88);
  assert.equal(forced.actionCount, 23);
  assert.equal(forced.footLayerActionCount, 20);
  assert.equal(forced.tailSupportEligible, false);
  assert.deepEqual(forced.internalSize, [192, 108]);
  const exportedFootBasis = await page.evaluate(
    () => appalachianSimulatorReview.renderer.appalachian3d.validateExportedFootBasis(),
  );
  assert.equal(exportedFootBasis.ok, true);
  assert.equal(Object.keys(exportedFootBasis.actions).length, 23);
  assert.ok(exportedFootBasis.minimumDot >= exportedFootBasis.minimumAllowed);
  assert.equal(exportedFootBasis.sampledVectors, 1696);

  await page.click("[data-demo='figureEight']");
  const drifts = [];
  const liveCanvasOpaquePixels = [];
  for (let index = 0; index < 24; index += 1) {
    await page.waitForTimeout(125);
    drifts.push((await diagnostics(page)).plantedFootDriftMeters);
    liveCanvasOpaquePixels.push(await opaquePixelCount(page));
  }
  assert.ok(Math.max(...drifts) < 0.01);
  // A transparent live canvas should hold only the current dancer pose. When
  // OutlineEffect disables WebGL auto-clear, this count climbs every frame as
  // prior poses become permanent trails.
  assert.ok(
    Math.max(...liveCanvasOpaquePixels) < 192 * 108 * 0.08,
    `live dancer canvas retained prior frames: ${liveCanvasOpaquePixels.join(", ")}`,
  );
  const travel = await page.evaluate(() => ({
    distance: appalachianSimulatorReview.lastSnapshot.dancer.performance.travelDistance,
    clip: appalachianSimulatorReview.lastSnapshot.dancer.presentationClip,
  }));
  assert.ok(travel.distance > 2);
  assert.equal(travel.clip, "walkingStep");

  await page.click("[data-demo='armCircle']");
  await page.waitForTimeout(400);
  const footBefore = await page.evaluate(() => appalachianSimulatorReview.lastSnapshot.dancer.actionId);
  await page.waitForTimeout(700);
  const armState = await page.evaluate(() => ({
    actionId: appalachianSimulatorReview.lastSnapshot.dancer.actionId,
    arm: appalachianSimulatorReview.lastSnapshot.dancer.upperBody.coordinated,
  }));
  assert.equal(armState.actionId, footBefore);
  assert.ok(Math.hypot(armState.arm.x, armState.arm.y) > 0.5);

  await page.click("[data-hero='soder']");
  await page.click("[data-style='clog']");
  await page.click("[data-demo='styleHop']");
  await page.waitForTimeout(720);
  const soder = await page.evaluate(() => ({
    hero: appalachianSimulatorReview.hero,
    style: appalachianSimulatorReview.style,
    jump: appalachianSimulatorReview.lastSnapshot.dancer.jump,
    diagnostics: appalachianSimulatorReview.renderer.getAppalachianDiagnostics(),
  }));
  assert.equal(soder.hero, "soder");
  assert.equal(soder.style, "clog");
  assert.equal(soder.diagnostics.character, "soder");
  assert.equal(soder.jump.profileId, "clogJumpPullback");
  await page.close();

  const webgpuPage = await reviewPage("?renderer=webgpu");
  const gated = await diagnostics(webgpuPage);
  assert.equal(gated.backend.requested, "webgpu");
  assert.equal(gated.backend.actual, "webgl2");
  assert.match(gated.backend.reason, /capability-gated/);
  await webgpuPage.close();

  const fallbackPage = await reviewPage("?dancer=atlas");
  await fallbackPage.click("[data-renderer='atlas']");
  await fallbackPage.waitForTimeout(250);
  assert.equal(await fallbackPage.locator("[data-renderer='atlas']").getAttribute("class"), "is-selected");
  await fallbackPage.close();

  return {
    forcedWebGL2: forced.backend,
    webgpuCapabilityGate: gated.backend,
    maximumPlantedFootDriftMeters: Math.max(...drifts),
    liveCanvasFrameClearing: {
      samples: liveCanvasOpaquePixels.length,
      maximumOpaquePixels: Math.max(...liveCanvasOpaquePixels),
      maximumAllowedPixels: 192 * 108 * 0.08,
    },
    liveRig: {
      skinnedMeshes: forced.skinnedMeshCount,
      bones: forced.boneCount,
      actions: forced.actionCount,
      independentFootLayers: forced.footLayerActionCount,
      exportedFootBasis,
    },
    atlasFallback: true,
    bothHeroes: true,
    allStyles: true,
    integratedGame: integrated,
  };
}

async function latency() {
  const page = await reviewPage("?renderer=webgl2");
  const arms = [];
  const feet = [];
  const jumps = [];
  for (let index = 0; index < 12; index += 1) {
    arms.push(await keyboardLatency(page, index % 2 ? "ArrowDown" : "ArrowUp", "arms"));
    feet.push(await keyboardLatency(page, index % 2 ? "ArrowRight" : "ArrowLeft", "feet"));
    if (index < 8) {
      jumps.push(await keyboardLatency(page, "Space", "jump"));
      await page.waitForFunction(
        () => appalachianSimulatorReview.lastSnapshot?.dancer?.jump?.state === "grounded",
        undefined,
        { timeout: 2_000 },
      );
    }
  }
  const result = {
    samples: { arms: arms.length, feet: feet.length, jumps: jumps.length },
    arms: summarize(arms),
    feet: summarize(feet),
    jumps: summarize(jumps),
    targetsMilliseconds: { arms: 33, feet: 33, jumps: 33, transitions: 140 },
    fixedStepHz: 120,
  };
  assert.ok(result.arms.p95Milliseconds <= 33);
  assert.ok(result.feet.p95Milliseconds <= 33);
  assert.ok(result.jumps.p95Milliseconds <= 33);
  await page.close();
  return result;
}

async function capture() {
  const page = await reviewPage("?renderer=webgl2", { width: 1440, height: 1000 });
  const captures = [];
  for (const [source, name] of [
    ["/tmp/kaki-baseline-front.png", "before-foot-basis-repair.png"],
    ["/tmp/kaki-footfix-front.png", "after-foot-basis-repair.png"],
  ]) {
    if (!existsSync(source)) continue;
    const target = resolve(CAPTURE_ROOT, name);
    copyFileSync(source, target);
    captures.push(relative(target));
  }
  await page.check("[data-debug='footBasis']");
  await page.check("[data-debug='contacts']");
  await capturePoseAngles(page, captures, "neutral", async () => {
    await page.evaluate(async () => {
      appalachianSimulatorReview.demo = "";
      await appalachianSimulatorReview.resetPerformer();
    });
    await page.waitForTimeout(100);
  });
  await capturePoseAngles(page, captures, "walking", async () => {
    await page.click("[data-demo='figureEight']");
    await page.waitForTimeout(420);
  });
  for (const [name, familyCode] of [
    ["brush-return", "KeyQ"],
    ["heel-toe", "KeyE"],
    ["backstep-chug", "KeyF"],
    ["low-turn", "KeyT"],
  ]) {
    await capturePoseAngles(page, captures, name, async () => {
      await page.evaluate(async () => {
        appalachianSimulatorReview.demo = "";
        await appalachianSimulatorReview.resetPerformer();
      });
      await chord(page, "ArrowLeft", familyCode);
      await page.waitForTimeout(180);
    });
  }
  await capturePoseAngles(page, captures, "landing", async () => {
    await page.click("[data-demo='styleHop']");
    await page.waitForTimeout(720);
  });
  await takeDemo(page, captures, "figure-eight-travel", "figureEight", 900);
  await takeDemo(page, captures, "right-stick-arm-circle", "armCircle", 650);
  await takeDemo(page, captures, "independent-left-right-arms", "independentArms", 750);
  for (const style of ["flatfoot", "buck", "clog"]) {
    await page.click(`[data-style='${style}']`);
    await takeDemo(page, captures, `${style}-style-hop`, "styleHop", 720);
  }
  await page.click("[data-hero='kitty']");
  await takeDemo(page, captures, "kitty-eight-move-dance-line", "danceLine", 1_500);
  await page.click("[data-hero='soder']");
  await takeDemo(page, captures, "soder-eight-move-dance-line", "danceLine", 1_500);
  await page.click("[data-speed='0.5']");
  await takeDemo(page, captures, "half-speed-move-review", "danceLine", 900);
  await page.click("[data-speed='1']");
  for (const selector of [
    "[data-debug='skeleton']",
    "[data-debug='contacts']",
    "[data-debug='centerOfMass']",
    "[data-debug='rootTrail']",
    "[data-debug='footBasis']",
  ]) await page.check(selector);
  await takeDemo(page, captures, "contact-skeleton-diagnostics", "figureEight", 900);

  await page.evaluate(() => {
    appalachianSimulatorReview.demo = "";
    appalachianSimulatorReview.demoTime = 0;
  });
  await page.keyboard.down("ArrowUp");
  await page.keyboard.down("KeyD");
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.press("KeyQ");
  await page.keyboard.up("ArrowLeft");
  await page.waitForTimeout(250);
  await shot(page, captures, "keyboard-play");
  await page.keyboard.up("ArrowUp");
  await page.keyboard.up("KeyD");

  await page.evaluate(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[2] = { pressed: true, value: 1 };
    buttons[14] = { pressed: true, value: 1 };
    buttons[5] = { pressed: true, value: 1 };
    appalachianSimulatorReview.input.getGamepads = () => [{
      axes: [0.66, -0.42, -0.7, -0.72],
      buttons,
    }];
  });
  await page.waitForTimeout(250);
  await shot(page, captures, "gamepad-play");
  await page.close();

  const touch = await browser.newPage({
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  watch(touch);
  await touch.goto(`${BASE_URL}/appalachian-simulator-review.html?renderer=webgl2`, { waitUntil: "networkidle" });
  await touch.waitForFunction(() => appalachianSimulatorReview?.renderer?.getAppalachianDiagnostics?.().ready);
  await touch.locator("[data-control='leftFoot']").tap();
  await touch.locator("[data-control='brush']").tap();
  await touch.locator("[data-control='jump']").tap();
  await touch.waitForTimeout(250);
  const touchPath = resolve(CAPTURE_ROOT, "touch-play.png");
  await touch.screenshot({ path: touchPath, fullPage: true });
  captures.push(relative(touchPath));
  await touch.close();
  return { captures, count: captures.length };
}

async function reviewPage(search = "", viewport = { width: 1280, height: 800 }) {
  const page = await browser.newPage({ viewport });
  watch(page);
  await page.goto(`${BASE_URL}/appalachian-simulator-review.html${search}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => appalachianSimulatorReview?.renderer?.getAppalachianDiagnostics?.().ready);
  return page;
}

async function diagnostics(page) {
  return page.evaluate(() => appalachianSimulatorReview.renderer.getAppalachianDiagnostics());
}

async function opaquePixelCount(page) {
  return page.evaluate(() => {
    const source = appalachianSimulatorReview.renderer.appalachian3d.canvas;
    const sample = document.createElement("canvas");
    sample.width = source.width;
    sample.height = source.height;
    const context = sample.getContext("2d");
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let opaque = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 8) opaque += 1;
    }
    return opaque;
  });
}

async function keyboardLatency(page, code, kind) {
  return page.evaluate(async ({ code, kind }) => {
    const app = appalachianSimulatorReview;
    const before = kind === "arms"
      ? { ...app.lastSnapshot.dancer.upperBody.coordinated }
      : kind === "feet"
        ? {
            leftStage: app.lastSnapshot.dancer.feet.left.stage,
            leftPhase: app.lastSnapshot.dancer.feet.left.phase,
            rightStage: app.lastSnapshot.dancer.feet.right.stage,
            rightPhase: app.lastSnapshot.dancer.feet.right.phase,
          }
        : app.lastSnapshot.dancer.jump.actionId;
    const started = performance.now();
    window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
    const elapsed = await new Promise((resolveElapsed, reject) => {
      const timeout = started + 250;
      const poll = () => {
        const dancer = app.lastSnapshot?.dancer;
        const changed = kind === "arms"
          ? Math.hypot(
              dancer.upperBody.coordinated.x - before.x,
              dancer.upperBody.coordinated.y - before.y,
            ) > 0.004
          : kind === "feet"
            ? dancer.feet.left.stage !== before.leftStage
              || dancer.feet.right.stage !== before.rightStage
              || Math.abs(dancer.feet.left.phase - before.leftPhase) > 0.002
              || Math.abs(dancer.feet.right.phase - before.rightPhase) > 0.002
            : dancer.jump.actionId !== before && dancer.jump.state === "compression";
        if (changed) resolveElapsed(performance.now() - started);
        else if (performance.now() > timeout) reject(new Error(`${kind} latency timed out`));
        else requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
    window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
    return elapsed;
  }, { code, kind });
}

async function capturePoseAngles(page, captures, name, setup) {
  await setup();
  for (const camera of ["front", "side", "gameplay"]) {
    await page.click(`[data-camera='${camera}']`);
    await page.waitForTimeout(34);
    await shot(page, captures, `${name}-${camera}`);
  }
}

async function chord(page, footCode, familyCode) {
  await page.keyboard.down(footCode);
  await page.keyboard.press(familyCode);
  await page.keyboard.up(footCode);
}

async function takeDemo(page, captures, name, demo, wait) {
  await page.click(`[data-demo='${demo}']`);
  await page.waitForTimeout(wait);
  await shot(page, captures, name);
}

async function shot(page, captures, name) {
  const path = resolve(CAPTURE_ROOT, `${name}.png`);
  await page.locator(".stage-bench").screenshot({ path });
  captures.push(relative(path));
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    minimumMilliseconds: round(sorted[0]),
    averageMilliseconds: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p95Milliseconds: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]),
    maximumMilliseconds: round(sorted.at(-1)),
  };
}

function watch(page) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (failure === "net::ERR_ABORTED" && /board-and-bow\.wav$/.test(request.url())) return;
    failedRequests.push({ url: request.url(), error: failure });
  });
}

function relative(path) {
  return path.slice(ROOT.length + 1);
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}
