import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.KAKI_DANCE_URL ?? "http://127.0.0.1:4177";
const REVIEW_ROOT = resolve(ROOT, "docs/review/appalachian-instrument-gate-2");
const REPORT_PATH = resolve(REVIEW_ROOT, "reports/flow-endurance-report.json");
const CAPTURE_ROOT = resolve(REVIEW_ROOT, "captures");
const TICKS_PER_SECOND = 192;
const RUN_SECONDS = 30;
const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync("/home/nemoclaw/bin/chromium") ? "/home/nemoclaw/bin/chromium" : undefined);

mkdirSync(CAPTURE_ROOT, { recursive: true });
const server = await ensureServer();
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
watch(page);

try {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.click("[data-start-mode='frolic']");
  await page.waitForFunction(
    () => kakiDance?.getSnapshot?.().state === "running"
      && kakiDance.getSnapshot().simulation?.frolic?.tick >= 0
      && kakiDance.getAppalachianDiagnostics?.().ready,
    undefined,
    { timeout: 15_000 },
  );

  const initial = await readFrame(page);
  const startTick = initial.tick;
  const endTick = startTick + RUN_SECONDS * TICKS_PER_SECOND;
  let nextInputTick = startTick + 12;
  let nextSampleTick = startTick;
  let nextCaptureTick = startTick + 5 * TICKS_PER_SECOND;
  let activeTravel = "";
  let activeArms = "";
  let inputIndex = 0;
  let expectedFootInputs = 0;
  const samples = [];
  const captures = [];
  const wallDeadline = Date.now() + 45_000;

  while ((await currentTick(page)) < endTick) {
    if (Date.now() > wallDeadline) {
      throw new Error(JSON.stringify({
        message: "Flow endurance musical clock stalled.",
        tick: await currentTick(page),
        endTick,
        state: await page.evaluate(() => kakiDance.getSnapshot()),
      }));
    }
    const tick = await currentTick(page);
    const elapsedSeconds = (tick - startTick) / TICKS_PER_SECOND;
    const travel = ["KeyD", "KeyW", "KeyA", "KeyS"][Math.floor(elapsedSeconds / 4) % 4];
    const arms = Math.floor(elapsedSeconds / 3) % 2 ? "ArrowDown" : "ArrowUp";
    if (travel !== activeTravel) {
      if (activeTravel) await page.keyboard.up(activeTravel);
      await page.keyboard.down(travel);
      activeTravel = travel;
    }
    if (arms !== activeArms) {
      if (activeArms) await page.keyboard.up(activeArms);
      await page.keyboard.down(arms);
      activeArms = arms;
    }

    while (nextInputTick <= tick) {
      const result = await playPhraseInput(page, inputIndex);
      expectedFootInputs += result.footInputs;
      inputIndex += 1;
      nextInputTick += result.spacingTicks;
    }

    if (tick >= nextSampleTick) {
      samples.push(await readFrame(page));
      nextSampleTick += 24;
    }
    if (tick >= nextCaptureTick && captures.length < 3) {
      const name = `flow-endurance-${String(captures.length + 1).padStart(2, "0")}.png`;
      const path = resolve(CAPTURE_ROOT, name);
      await page.locator("#game-host").screenshot({ path });
      captures.push(`docs/review/appalachian-instrument-gate-2/captures/${name}`);
      nextCaptureTick += 10 * TICKS_PER_SECOND;
    }
    await page.waitForTimeout(8);
  }

  if (activeTravel) await page.keyboard.up(activeTravel);
  if (activeArms) await page.keyboard.up(activeArms);
  await page.waitForTimeout(350);
  samples.push(await readFrame(page));

  const final = await page.evaluate(() => ({
    snapshot: kakiDance.getSnapshot(),
    diagnostics: kakiDance.getAppalachianDiagnostics(),
    latency: kakiDance.getFrolicLatencyRecords(),
  }));
  const report = buildReport({
    samples,
    captures,
    final,
    startTick,
    endTick,
    expectedFootInputs,
    inputIndex,
  });
  const { failureContext, ...evidence } = report;
  writeFileSync(REPORT_PATH, `${JSON.stringify({
    schemaVersion: 1,
    candidateStatus: "CANDIDATE — HUMAN REVIEW REQUIRED",
    generatedAt: new Date().toISOString(),
    url: BASE_URL,
    errors,
    failedRequests,
    ...evidence,
  }, null, 2)}\n`);

  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  assert.ok(report.contacts.completed >= expectedFootInputs * 0.9, report.failureContext);
  assert.ok(report.motion.travelDistanceMeters >= 5, report.failureContext);
  assert.ok(report.motion.armInputDistance >= 1.5, report.failureContext);
  assert.ok(report.motion.jumps >= 1, report.failureContext);
  assert.ok(report.motion.cleanLandings >= 1, report.failureContext);
  assert.ok(report.motion.maximumBoardSpeedMetersPerSecond <= 2.25, failureContext);
  assert.ok(report.motion.maximumFacingSpeedRadiansPerSecond <= 5.01, failureContext);
  assert.ok(report.motion.maximumObservedFacingSpeedRadiansPerSecond <= 8, failureContext);
  assert.ok(report.motion.maximumPelvisDeltaMeters <= 0.16, report.failureContext);
  assert.ok(report.motion.maximumAbsoluteX <= 4.26, report.failureContext);
  assert.ok(report.motion.maximumAbsoluteZ <= 2.66, report.failureContext);
  assert.ok(report.contacts.airborneWeightBearingFrames === 0, report.failureContext);
  assert.ok(report.stage.boardTopRangePixels <= 1, report.failureContext);
  assert.ok(report.performance.statesSeen.includes("in-the-pocket"), report.failureContext);
  assert.ok(report.performance.scramblingShare < 0.24, report.failureContext);
  assert.ok(report.performance.score >= 45, report.failureContext);
  assert.ok(report.renderer.p95Milliseconds < 10, report.failureContext);

  console.log("FROLIC_FLOW_ENDURANCE_PASS");
  console.log(`report=${REPORT_PATH}`);
} finally {
  await page.close();
  await browser.close();
  server?.kill();
}

async function playPhraseInput(page, index) {
  if (index > 0 && index % 48 === 0) {
    await page.keyboard.press("Space");
    return { footInputs: 0, spacingTicks: 96 };
  }
  const foot = index % 2 ? "ArrowRight" : "ArrowLeft";
  const pattern = index % 16;
  if (pattern === 2) {
    await modifiedFoot(page, "ShiftLeft", foot);
    return { footInputs: 1, spacingTicks: 48 };
  }
  if (pattern === 6) {
    await modifiedFoot(page, "ControlLeft", foot);
    return { footInputs: 1, spacingTicks: 48 };
  }
  if (pattern === 10) {
    await modifiedFoot(page, "KeyZ", foot);
    return { footInputs: 1, spacingTicks: 48 };
  }
  if ([4, 8, 12].includes(pattern)) {
    const family = { 4: "KeyQ", 8: "KeyE", 12: "KeyF" }[pattern];
    await familyFoot(page, family, foot);
    return { footInputs: 1, spacingTicks: 48 };
  }
  if (pattern === 15 && index % 32 === 15) {
    await simultaneousFeet(page);
    return { footInputs: 2, spacingTicks: 48 };
  }
  if (pattern === 15) {
    await familyFoot(page, "KeyT", foot);
    return { footInputs: 1, spacingTicks: 48 };
  }
  await page.keyboard.press(foot);
  return { footInputs: 1, spacingTicks: 48 };
}

async function modifiedFoot(page, modifier, foot) {
  await page.keyboard.down(modifier);
  await page.keyboard.press(foot);
  await page.keyboard.up(modifier);
}

async function familyFoot(page, family, foot) {
  await page.keyboard.down(family);
  await page.keyboard.press(foot);
  await page.keyboard.up(family);
}

async function simultaneousFeet(page) {
  await page.evaluate(() => {
    for (const code of ["ArrowLeft", "ArrowRight"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
    }
    for (const code of ["ArrowLeft", "ArrowRight"]) {
      window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true }));
    }
  });
}

async function currentTick(page) {
  return page.evaluate(() => kakiDance.getSnapshot().simulation?.frolic?.tick ?? -1);
}

async function readFrame(page) {
  return page.evaluate(() => {
    const snapshot = kakiDance.getSnapshot().simulation;
    const dancer = snapshot.dancer;
    const context = document.getElementById("game-canvas").getContext("2d");
    const pixels = context.getImageData(0, 130, 384, 62).data;
    let boardTop = null;
    for (let localY = 0; localY < 62 && boardTop === null; localY += 1) {
      let matches = 0;
      for (let x = 80; x < 304; x += 1) {
        const offset = (localY * 384 + x) * 4;
        if (
          pixels[offset] === 185
          && pixels[offset + 1] === 116
          && pixels[offset + 2] === 67
        ) matches += 1;
      }
      if (matches >= 32) boardTop = localY + 130;
    }
    return {
      wallTimeMilliseconds: performance.now(),
      tick: snapshot.frolic.tick,
      world: dancer.worldPosition,
      rootVelocity: dancer.rootVelocity,
      facing: dancer.facing,
      angularVelocity: dancer.angularVelocity,
      pelvis: dancer.bodyDynamics.pelvisVerticalMeters,
      support: dancer.supportingFoot,
      leftWeightBearing: dancer.feet.left.weightBearing,
      rightWeightBearing: dancer.feet.right.weightBearing,
      jumpState: dancer.jump.state,
      performanceState: snapshot.frolic.performanceState.id,
      score: snapshot.playerScore.total,
      boardTop,
    };
  });
}

function buildReport({
  samples,
  captures,
  final,
  startTick,
  endTick,
  expectedFootInputs,
  inputIndex,
}) {
  let maximumBoardSpeedMetersPerSecond = 0;
  let maximumFacingSpeedRadiansPerSecond = 0;
  let maximumObservedBoardSpeedMetersPerSecond = 0;
  let maximumObservedFacingSpeedRadiansPerSecond = 0;
  let maximumPelvisDeltaMeters = 0;
  let maximumBoardSpeedSegment = null;
  let maximumFacingSpeedSegment = null;
  let airborneWeightBearingFrames = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const seconds = Math.max(
      1 / 120,
      (current.wallTimeMilliseconds - previous.wallTimeMilliseconds) / 1000,
    );
    const observedBoardSpeed = Math.hypot(
      current.world.x - previous.world.x,
      current.world.z - previous.world.z,
    ) / seconds;
    if (observedBoardSpeed > maximumObservedBoardSpeedMetersPerSecond) {
      maximumObservedBoardSpeedMetersPerSecond = observedBoardSpeed;
      maximumBoardSpeedSegment = { seconds, previous, current };
    }
    const observedFacingSpeed = Math.abs(shortestAngle(current.facing - previous.facing)) / seconds;
    if (observedFacingSpeed > maximumObservedFacingSpeedRadiansPerSecond) {
      maximumObservedFacingSpeedRadiansPerSecond = observedFacingSpeed;
      maximumFacingSpeedSegment = { seconds, previous, current };
    }
    maximumBoardSpeedMetersPerSecond = Math.max(
      maximumBoardSpeedMetersPerSecond,
      Math.hypot(current.rootVelocity.x, current.rootVelocity.z),
    );
    maximumFacingSpeedRadiansPerSecond = Math.max(
      maximumFacingSpeedRadiansPerSecond,
      Math.abs(current.angularVelocity),
    );
    maximumPelvisDeltaMeters = Math.max(
      maximumPelvisDeltaMeters,
      Math.abs(current.pelvis - previous.pelvis),
    );
  }
  for (const sample of samples) {
    if (
      sample.jumpState === "airborne"
      && (sample.leftWeightBearing || sample.rightWeightBearing)
    ) airborneWeightBearingFrames += 1;
  }
  const boardTops = samples.map((sample) => sample.boardTop).filter(Number.isFinite);
  const states = samples.map((sample) => sample.performanceState);
  const completedContacts = final.latency.filter(
    (record) => Number.isFinite(record.contactEmissionTimestamp)
      && Number.isFinite(record.audioSchedulingTimestamp),
  );
  const dancer = final.snapshot.simulation.dancer;
  const score = final.snapshot.simulation.playerScore.total;
  const report = {
    durationSeconds: (samples.at(-1).tick - startTick) / TICKS_PER_SECOND,
    tickRange: [startTick, endTick],
    phraseInputs: inputIndex,
    expectedFootInputs,
    contacts: {
      records: final.latency.length,
      completed: completedContacts.length,
      completionShare: completedContacts.length / Math.max(1, expectedFootInputs),
      airborneWeightBearingFrames,
    },
    motion: {
      travelDistanceMeters: dancer.performance.travelDistance,
      armInputDistance: dancer.performance.armInputDistance,
      jumps: dancer.performance.jumps,
      cleanLandings: dancer.performance.cleanLandings,
      recoveries: dancer.performance.recoveries,
      transitions: dancer.performance.transitionCount,
      averageTransitionScore: dancer.performance.averageTransitionScore,
      maximumBoardSpeedMetersPerSecond,
      maximumObservedBoardSpeedMetersPerSecond,
      maximumBoardSpeedSegment,
      maximumFacingSpeedRadiansPerSecond,
      maximumObservedFacingSpeedRadiansPerSecond,
      maximumFacingSpeedSegment,
      maximumPelvisDeltaMeters,
      maximumAbsoluteX: Math.max(...samples.map((sample) => Math.abs(sample.world.x))),
      maximumAbsoluteZ: Math.max(...samples.map((sample) => Math.abs(sample.world.z))),
    },
    stage: {
      boardTopSamples: boardTops.length,
      boardTopRangePixels: boardTops.length
        ? Math.max(...boardTops) - Math.min(...boardTops)
        : null,
    },
    performance: {
      score,
      statesSeen: [...new Set(states)],
      stateSamples: Object.fromEntries(
        [...new Set(states)].map((state) => [state, states.filter((value) => value === state).length]),
      ),
      scramblingShare: states.filter((state) => state === "scrambling").length / states.length,
      finalState: final.snapshot.simulation.frolic.performanceState.id,
    },
    renderer: {
      ...final.diagnostics.backend,
      p95Milliseconds: final.diagnostics.renderP95Milliseconds,
      plantedFootDriftMeters: final.diagnostics.plantedFootDriftMeters,
    },
    captures,
  };
  return {
    ...report,
    failureContext: JSON.stringify(report),
  };
}

function shortestAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function watch(target) {
  target.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  target.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  target.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (failure === "net::ERR_ABORTED" && /board-and-bow\.(?:wav|mp3)$/.test(request.url())) return;
    failedRequests.push({ url: request.url(), error: failure });
  });
}

async function ensureServer() {
  try {
    const response = await fetch(`${BASE_URL}/index.html`);
    if (response.ok) return null;
  } catch {
    // Start a local static server below.
  }
  const url = new URL(BASE_URL);
  const child = spawn("python3", ["-m", "http.server", url.port || "80", "--bind", url.hostname], {
    cwd: ROOT,
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    try {
      const response = await fetch(`${BASE_URL}/index.html`);
      if (response.ok) return child;
    } catch {
      // Continue waiting for the child server.
    }
  }
  child.kill();
  throw new Error(`Could not start Frolic flow QA server at ${BASE_URL}`);
}
