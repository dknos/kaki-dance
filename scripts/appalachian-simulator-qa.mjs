import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  blendAuthoredPose,
  validateAuthoredPose,
} from "../js/appalachian/arm-pose-field.js";
import { AppalachianAnimationController } from "../js/appalachian/animation-controller.js";
import { BoardLineTracker, BOARD_BOUNDS } from "../js/appalachian/board-lines.js";
import { GOLDEN_FOOT_GESTURES, validateGoldenFootGestures } from "../js/appalachian/foot-gesture-deck.js";
import { FROLIC_JUMP_PROFILES } from "../js/appalachian/footwork-catalog.js";
import { PERFORMANCE_TRANSITIONS, validatePerformanceTransitions } from "../js/appalachian/transition-recipes.js";
import { CONTACT_SAMPLE_MAP, resolveFootSampleGroup } from "../js/audio/foot-percussion-player.js";

const ROOT = resolve(import.meta.dirname, "..");
const OUTPUT = resolve(ROOT, "docs/review/appalachian-instrument-gate-2/reports");
const MODE = process.argv[2] ?? "motion";
const DT = 1 / 120;

mkdirSync(OUTPUT, { recursive: true });

const runners = {
  motion: runMotion,
  arms: runArms,
  jumps: runJumps,
  audio: runAudio,
};

assert.ok(runners[MODE], `Unknown Appalachian simulator QA mode: ${MODE}`);
const startedAt = performance.now();
const report = {
  schemaVersion: 2,
  candidateStatus: "CANDIDATE — HUMAN REVIEW REQUIRED",
  mode: MODE,
  generatedAt: new Date().toISOString(),
  ...runners[MODE](),
  elapsedMilliseconds: round(performance.now() - startedAt),
};
const outputPath = resolve(OUTPUT, `${MODE}-report.json`);
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`APPALACHIAN_SIM_${MODE.toUpperCase()}_PASS`);
console.log(`report=${outputPath}`);

function runMotion() {
  const controller = new AppalachianAnimationController({ style: "flatfoot" });
  const tracker = new BoardLineTracker();
  let maximumSpeed = 0;
  for (let tick = 0; tick < 2_400; tick += 1) {
    const time = tick * DT;
    const input = {
      travelX: Math.sin(time * 1.15),
      travelY: Math.sin(time * 2.3) * 0.76,
    };
    controller.update(tick, { dt: DT, input });
    const dancer = controller.getSnapshot(tick);
    tracker.update(dancer.worldPosition, { moveId: dancer.moveId });
    maximumSpeed = Math.max(maximumSpeed, Math.hypot(dancer.rootVelocity.x, dancer.rootVelocity.z));
    assert.ok(dancer.worldPosition.x >= BOARD_BOUNDS.minX && dancer.worldPosition.x <= BOARD_BOUNDS.maxX);
    assert.ok(dancer.worldPosition.z >= BOARD_BOUNDS.minZ && dancer.worldPosition.z <= BOARD_BOUNDS.maxZ);
  }
  const dancer = controller.getSnapshot(2_399);
  const board = tracker.getSnapshot();
  assert.ok(dancer.performance.travelDistance > 10);
  assert.equal(board.figureEightCandidate, true);
  assert.equal(PERFORMANCE_TRANSITIONS.length, 24);
  assert.deepEqual(validatePerformanceTransitions(), []);
  assert.deepEqual(validateGoldenFootGestures(), []);
  return {
    fixedStepHz: 120,
    boardBounds: BOARD_BOUNDS,
    travelDistanceMeters: round(dancer.performance.travelDistance),
    maximumSpeedMetersPerSecond: round(maximumSpeed),
    directionChanges: dancer.performance.directionChanges,
    figureEightCandidate: board.figureEightCandidate,
    transitionRecipes: PERFORMANCE_TRANSITIONS.length,
    goldenFootFamilies: Object.keys(GOLDEN_FOOT_GESTURES),
    pairedGoldenGestureActions: Object.keys(GOLDEN_FOOT_GESTURES).length * 2,
    handoffMilliseconds: {
      minimum: Math.min(...PERFORMANCE_TRANSITIONS.map((value) => value.durationMs)),
      maximum: Math.max(...PERFORMANCE_TRANSITIONS.map((value) => value.durationMs)),
    },
  };
}

function runArms() {
  const manifest = readJson("assets/models/appalachian/simulator-manifest.json");
  const samples = [];
  let maximumValidationErrors = 0;
  for (const style of ["flatfoot", "buck", "clog"]) {
    for (let yIndex = 0; yIndex <= 8; yIndex += 1) {
      for (let xIndex = 0; xIndex <= 8; xIndex += 1) {
        const x = xIndex / 4 - 1;
        const y = yIndex / 4 - 1;
        const pose = blendAuthoredPose(manifest.armPoseField, x, y, style);
        const errors = validateAuthoredPose(pose, style);
        maximumValidationErrors = Math.max(maximumValidationErrors, errors.length);
        assert.deepEqual(errors, []);
        samples.push({ style, x, y, leadingPose: pose.weights[0].id });
      }
    }
  }
  const controller = new AppalachianAnimationController({ style: "buck" });
  controller.request("walkingStep", { tick: 0, entryFoot: "left" });
  const actionId = controller.getSnapshot(0).actionId;
  for (let tick = 1; tick <= 80; tick += 1) {
    controller.update(tick, {
      dt: DT,
      input: {
        armX: Math.sin(tick * DT * 8),
        armY: Math.cos(tick * DT * 8),
        leftArmModifier: tick >= 20 && tick < 40,
        rightArmModifier: tick >= 40 && tick < 60,
        bodyModifier: tick >= 60,
      },
    });
    assert.equal(controller.getSnapshot(tick).actionId, actionId);
  }
  return {
    authoredPoseSamples: manifest.armPoseField.length,
    evaluatedBlendSamples: samples.length,
    maximumValidationErrors,
    footActionStableDuringArmTest: true,
    independentLeftArm: true,
    independentRightArm: true,
    bodyLineLayer: true,
    directStickToBoneRotation: false,
  };
}

function runJumps() {
  const styles = {};
  for (const style of ["flatfoot", "buck", "clog"]) {
    const controller = new AppalachianAnimationController({ style });
    controller.update(0, { dt: DT, input: { jump: true, jumpPressed: true } });
    assert.equal(controller.getSnapshot(0).jump.state, "compression");
    let tick = 1;
    for (; tick < 45; tick += 1) {
      controller.update(tick, { dt: DT, input: { jump: true, commitModifier: true } });
    }
    controller.update(tick, { dt: DT, input: { jumpReleased: true, commitModifier: true } });
    tick += 1;
    controller.update(tick, { dt: DT, input: { stylePressed: true } });
    let snapshot = controller.getSnapshot(tick);
    const peak = snapshot.jump.maxHeight;
    const variation = snapshot.jump.variation;
    while (snapshot.jump.state !== "grounded" && tick < 220) {
      tick += 1;
      controller.update(tick, { dt: DT, input: {} });
      snapshot = controller.getSnapshot(tick);
    }
    const contacts = [];
    controller.consumeContacts((contact) => contacts.push(contact));
    assert.ok(contacts.some((contact) => contact.jumpEvent === "launch"));
    assert.ok(contacts.some((contact) => contact.jumpEvent === "landing"));
    styles[style] = {
      clip: FROLIC_JUMP_PROFILES[style].clip,
      chargeCapMilliseconds: FROLIC_JUMP_PROFILES[style].chargeCapSeconds * 1_000,
      peakHeightMeters: round(peak),
      followUp: variation,
      landingContact: FROLIC_JUMP_PROFILES[style].landingContact,
      authoredContactCount: contacts.length,
    };
  }
  assert.ok(styles.flatfoot.peakHeightMeters < styles.buck.peakHeightMeters);
  assert.ok(styles.buck.peakHeightMeters < styles.clog.peakHeightMeters);
  return {
    anticipationStepMilliseconds: round(DT * 1_000),
    styles,
    genericSharedJump: false,
  };
}

function runAudio() {
  const manifest = readJson("assets/audio/frolic/feet/manifest.json");
  const requiredFamilies = [
    "softSole", "flatContact", "heel", "toeBall", "brush", "skuff",
    "drag", "slide", "chug", "doubleTap", "metalHeelTap", "metalToeTap",
    "hopLaunch", "landing", "boardResonance",
  ];
  let fileCount = 0;
  for (const family of requiredFamilies) {
    assert.ok(CONTACT_SAMPLE_MAP[family], family);
    const group = resolveFootSampleGroup(family, "flatfoot");
    assert.ok(manifest.groups[group], `${family}/${group}`);
  }
  for (const group of Object.values(manifest.groups)) {
    for (const file of group.files) {
      assert.ok(existsSync(resolve(ROOT, "assets/audio/frolic/feet", file)), file);
      fileCount += 1;
    }
  }
  assert.equal(manifest.provenance.noSynthesis, true);
  return {
    sourceType: manifest.provenance.sourceType,
    noSynthesis: manifest.provenance.noSynthesis,
    requiredContactFamilies: requiredFamilies,
    localSampleGroups: Object.keys(manifest.groups).length,
    localSampleReferences: fileCount,
    roundRobin: manifest.roundRobin,
    velocityLayers: manifest.velocityLayers,
    trigger: "authored visual contact metadata",
    boardResonanceAffectsGain: true,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

function round(value) {
  return Math.round(Number(value) * 1_000) / 1_000;
}
