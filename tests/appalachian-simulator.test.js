import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  ARM_POSE_POINTS,
  blendAuthoredPose,
  bodyLineFromInput,
  poseFieldWeights,
  validateAuthoredPose,
} from "../js/appalachian/arm-pose-field.js";
import { AppalachianAnimationController } from "../js/appalachian/animation-controller.js";
import { BoardLineTracker, BOARD_BOUNDS, boardRegion } from "../js/appalachian/board-lines.js";
import {
  FOOTWORK_CATALOG,
  FROLIC_JUMP_PROFILES,
  validateFootworkCatalog,
} from "../js/appalachian/footwork-catalog.js";
import {
  AppalachianPhraseJudge,
  restraintFactor,
} from "../js/appalachian/phrase-judge.js";
import { PRACTICE_LESSONS } from "../js/appalachian/simulation.js";
import { FootworkTransitionGraph } from "../js/appalachian/transition-graph.js";
import {
  PERFORMANCE_TRANSITIONS,
  validatePerformanceTransitions,
} from "../js/appalachian/transition-recipes.js";
import {
  applyRadialDeadZone,
  InputManager,
  pollGamepad,
} from "../js/input.js";
import {
  CONTACT_SAMPLE_MAP,
  resolveFootSampleGroup,
} from "../js/audio/foot-percussion-player.js";
import { selectAppalachianRendererBackend } from "../js/render/appalachian-three-renderer.js";

const ROOT = resolve(import.meta.dirname, "..");
const DT = 1 / 120;

test("both gamepad sticks use independent radial dead zones and semantic buttons", () => {
  const pad = {
    axes: [0.72, -0.35, -0.58, 0.84],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
  pad.buttons[0].pressed = true;
  pad.buttons[4].pressed = true;
  pad.buttons[7].pressed = true;
  const value = pollGamepad(() => [pad]);
  const travel = applyRadialDeadZone(0.72, -0.35);
  const arms = applyRadialDeadZone(-0.58, 0.84);
  assert.deepEqual({ x: value.x, y: value.y }, travel);
  assert.deepEqual({ x: value.armX, y: value.armY }, { x: arms.x, y: -arms.y });
  assert.equal(value.jump, true);
  assert.equal(value.brushModifier, true);
  assert.equal(value.toeModifier, true);
  assert.notDeepEqual([value.x, value.y], [value.armX, value.armY]);
});

test("keyboard travel, anatomical foot, persistent arms, and family chord survive rollover", () => {
  const input = new InputManager({ target: null, profile: "appalachian" });
  for (const code of ["KeyW", "KeyD", "ArrowUp", "ArrowLeft", "KeyQ", "ShiftLeft"]) {
    input.keys.add(code);
  }
  input.bufferCode("ArrowLeft", true, {
    device: "keyboard",
    rawTimeStamp: 1,
    receivedTimeStamp: 1,
    committed: true,
  });
  input.bufferCode("KeyQ", true, {
    device: "keyboard",
    rawTimeStamp: 2,
    receivedTimeStamp: 2,
    committed: true,
  });
  input.update(DT);
  const value = input.consumeStep();
  assert.deepEqual([value.travelX, value.travelY], [1, -1]);
  assert.deepEqual([value.armX, value.armY], [0, 1]);
  assert.equal(value.brushModifier, true);
  assert.deepEqual(value.performanceEdges.map((edge) => edge.action), ["leftFoot", "brush"]);
  assert.equal(value.performanceEdges[0].articulationModifier, "brush");
  input.destroy();
});

test("authored radial pose field blends continuously inside conservative anatomy limits", () => {
  const manifest = manifestValue();
  assert.equal(ARM_POSE_POINTS.length, 9);
  const weights = poseFieldWeights(0.36, 0.74);
  assert.equal(weights.length, 4);
  assert.ok(Math.abs(weights.reduce((sum, value) => sum + value.weight, 0) - 1) < 1e-9);
  for (const style of ["flatfoot", "buck", "clog"]) {
    for (const [x, y] of [[0, -1], [-1, 0], [1, 0], [0, 1], [0.42, 0.68]]) {
      const pose = blendAuthoredPose(manifest.armPoseField, x, y, style);
      assert.deepEqual(validateAuthoredPose(pose, style), []);
    }
    const line = bodyLineFromInput(1, -1, style);
    assert.ok(line.balance >= 0.72);
  }
});

test("arm and body-line input never restarts or replaces the active foot action", () => {
  const controller = new AppalachianAnimationController({ style: "flatfoot" });
  const started = controller.request("walkingStep", { tick: 0, entryFoot: "left" });
  assert.equal(started.ok, true);
  const actionId = controller.getSnapshot(0).actionId;
  for (let tick = 1; tick <= 40; tick += 1) {
    controller.update(tick, {
      dt: DT,
      input: {
        armX: Math.sin(tick / 8),
        armY: Math.cos(tick / 9),
        leftArmModifier: tick < 14,
        rightArmModifier: tick >= 14 && tick < 28,
        bodyModifier: tick >= 28,
      },
    });
    assert.equal(controller.getSnapshot(tick).actionId, actionId);
  }
  const snapshot = controller.getSnapshot(40);
  assert.equal(snapshot.layers.bodyLine, 1);
  assert.ok(snapshot.performance.armInputDistance > 1);
});

test("jump compression starts immediately and each style has a distinct authored cap", () => {
  const observed = {};
  for (const style of ["flatfoot", "buck", "clog"]) {
    const controller = new AppalachianAnimationController({ style });
    controller.update(0, { dt: DT, input: { jump: true, jumpPressed: true } });
    assert.equal(controller.getSnapshot(0).jump.state, "compression");
    assert.equal(controller.getSnapshot(0).presentationClip, FROLIC_JUMP_PROFILES[style].clip);
    let tick = 1;
    for (; tick < 40; tick += 1) {
      controller.update(tick, { dt: DT, input: { jump: true, commitModifier: true } });
    }
    controller.update(tick, {
      dt: DT,
      input: { jumpReleased: true, commitModifier: true },
    });
    tick += 1;
    controller.update(tick, { dt: DT, input: { stylePressed: true } });
    let snapshot = controller.getSnapshot(tick);
    assert.equal(snapshot.jump.state, "airborne");
    assert.equal(snapshot.jump.variation, FROLIC_JUMP_PROFILES[style].allowedFollowUps[1]);
    observed[style] = snapshot.jump.maxHeight;
    while (snapshot.jump.state !== "grounded" && tick < 180) {
      tick += 1;
      controller.update(tick, { dt: DT, input: {} });
      snapshot = controller.getSnapshot(tick);
    }
    assert.equal(snapshot.jump.state, "grounded");
    const contacts = [];
    controller.consumeContacts((contact) => contacts.push(contact));
    assert.ok(contacts.some((contact) => contact.jumpEvent === "launch"));
    assert.ok(contacts.some((contact) => contact.jumpEvent === "landing"));
  }
  assert.ok(observed.flatfoot < observed.buck);
  assert.ok(observed.buck < observed.clog);
  assert.ok(observed.clog <= FROLIC_JUMP_PROFILES.clog.heightMeters[1]);
});

test("twenty-four authored transitions resolve inside the short handoff and root-warp bounds", () => {
  assert.equal(PERFORMANCE_TRANSITIONS.length, 24);
  assert.deepEqual(validatePerformanceTransitions(), []);
  const graph = new FootworkTransitionGraph({ style: "flatfoot" });
  const ranked = graph.rankCandidates({
    fromId: "walkingStep",
    candidates: ["shuffle"],
    entryFoot: "left",
    phrasePhase: 0.5,
    currentState: {
      phase: 0.62,
      rootVelocity: { x: 0.8, z: 0.4 },
      facing: 0.7,
      angularVelocity: 0.5,
      supportingFoot: "right",
      centerOfMassOffset: 0.1,
      bodyLevel: "mid",
    },
  });
  assert.ok(ranked.length >= 4);
  assert.notEqual(ranked[0].entryPhase, 0);
  assert.ok(ranked[0].rootWarpLimitMeters <= 0.18);
  assert.equal(ranked[0].resolved, true);
});

test("catalog carries complete transition/contact provenance metadata", () => {
  assert.deepEqual(validateFootworkCatalog(), []);
  assert.ok(Object.keys(FOOTWORK_CATALOG).length >= 8);
  for (const move of Object.values(FOOTWORK_CATALOG)) {
    assert.ok(move.entryFrames.length >= 1, move.id);
    assert.ok(move.sourceReferences.length >= 1, move.id);
    assert.ok(move.validSuccessors.length >= 1, move.id);
    assert.ok(move.cancelWindows.length >= 1, move.id);
    assert.ok(Array.isArray(move.beatContactTimeline), move.id);
  }
});

test("free travel remains bounded and can trace a figure-eight candidate", () => {
  const controller = new AppalachianAnimationController({ style: "flatfoot" });
  for (let tick = 0; tick < 1_800; tick += 1) {
    controller.update(tick, {
      dt: DT,
      input: {
        travelX: Math.sin(tick * DT * 1.15),
        travelY: Math.sin(tick * DT * 2.3) * 0.76,
      },
    });
  }
  const position = controller.getSnapshot(1_799).worldPosition;
  assert.ok(position.x >= BOARD_BOUNDS.minX && position.x <= BOARD_BOUNDS.maxX);
  assert.ok(position.z >= BOARD_BOUNDS.minZ && position.z <= BOARD_BOUNDS.maxZ);
  assert.ok(controller.getSnapshot(1_799).performance.travelDistance > 8);

  const tracker = new BoardLineTracker();
  for (let index = 0; index < 160; index += 1) {
    const t = index / 159 * Math.PI * 4;
    tracker.update({ x: Math.sin(t) * 3.4, z: Math.sin(t * 2) * 1.8 });
  }
  assert.equal(tracker.getSnapshot().figureEightCandidate, true);
  assert.equal(boardRegion({ x: 0, z: 0 }).id, "center");
});

test("repeat decay and intentional performance metrics keep subtle footwork competitive", () => {
  const repeated = Array.from({ length: 32 }, (_, index) => ({
    tick: index * 24,
    moveId: "clogJumpPullback",
    articulation: "tap",
    intensity: 0.95,
    timingOffsetTicks: 0,
    style: "clog",
    foot: index % 2 ? "left" : "right",
  }));
  const varied = Array.from({ length: 24 }, (_, index) => ({
    tick: index * 48,
    moveId: ["walkingStep", "shuffle", "heelToeChange", "backstep", "chug", "rockStep"][index % 6],
    articulation: ["flat", "brush", "heel", "toe", "chug", "flat"][index % 6],
    intensity: 0.55 + index % 3 * 0.08,
    timingOffsetTicks: index % 2 ? 4 : 0,
    style: "flatfoot",
    foot: index % 2 ? "left" : "right",
  }));
  assert.ok(restraintFactor(repeated) < restraintFactor(varied));
  const flatfoot = new AppalachianPhraseJudge({ style: "flatfoot" });
  varied.forEach((event) => flatfoot.recordInput(event));
  flatfoot.setPerformanceMetrics({
    travelDistance: 11,
    directionChanges: 8,
    armInputDistance: 7,
    boardLines: 2,
    bankedLines: 1,
  });
  const clog = new AppalachianPhraseJudge({ style: "clog" });
  repeated.forEach((event) => clog.recordInput(event));
  assert.ok(flatfoot.getResult().total > clog.getResult().total);
});

test("all required contact families resolve to local genuine-Foley groups", () => {
  const manifest = JSON.parse(readFileSync(
    resolve(ROOT, "assets/audio/frolic/feet/manifest.json"),
    "utf8",
  ));
  assert.equal(manifest.provenance.noSynthesis, true);
  for (const family of [
    "softSole", "flatContact", "heel", "toeBall", "brush", "skuff",
    "drag", "slide", "chug", "doubleTap", "metalHeelTap", "metalToeTap",
    "hopLaunch", "landing", "boardResonance",
  ]) {
    assert.ok(CONTACT_SAMPLE_MAP[family], family);
    assert.ok(manifest.groups[resolveFootSampleGroup(family, "flatfoot")], family);
  }
  assert.equal(resolveFootSampleGroup("heel", "clog"), "tapHeel");
  assert.equal(resolveFootSampleGroup("toeBall", "clog"), "tapToe");
});

test("shared GLB includes both heroes while costume parts remain non-support", () => {
  const glb = readFileSync(resolve(
    ROOT,
    "assets/models/appalachian/kaki-appalachian-simulator.glb",
  ));
  const manifest = manifestValue();
  assert.equal(glb.toString("ascii", 0, 4), "glTF");
  assert.ok(glb.length > 500_000);
  assert.deepEqual(manifest.characters, ["kitty", "soder"]);
  assert.deepEqual(manifest.supportCapableBones, ["foot.L", "foot.R"]);
  assert.ok(manifest.excludedSupportBones.includes("costume.tail"));
  assert.ok(manifest.excludedSupportBones.includes("costume.hood"));
  assert.equal(Object.keys(manifest.actions).length, 23);
  assert.equal(manifest.gateCounts.goldenPairedGestures, 10);
  assert.equal(manifest.armPoseField.length, 9);
  assert.equal(manifest.candidateStatus, "CANDIDATE — HUMAN REVIEW REQUIRED");
});

test("WebGPU remains capability-gated, forced WebGL2 is deterministic, and atlas fallback remains present", () => {
  assert.equal(selectAppalachianRendererBackend({
    requested: "webgpu",
    hasWebGPU: true,
    webGPUStable: false,
  }).actual, "webgl2");
  const forced = selectAppalachianRendererBackend({
    requested: "auto",
    forceWebGL2: true,
    hasWebGPU: true,
  });
  assert.equal(forced.actual, "webgl2");
  assert.equal(forced.forced, true);
  const renderer = readFileSync(resolve(ROOT, "js/render/renderer.js"), "utf8");
  assert.match(renderer, /appalachianRenderMode/);
  assert.match(renderer, /FrolicAtlasRenderer/);
});

test("review surface and Pages-safe runtime paths expose all required control families", () => {
  const page = readFileSync(resolve(ROOT, "appalachian-simulator-review.html"), "utf8");
  for (const token of [
    "data-hero", "data-style", "data-renderer", "data-speed",
    "data-touch-stick=\"travel\"", "data-touch-stick=\"arms\"",
    "data-control=\"leftFoot\"", "data-control=\"rightFoot\"",
    "data-control=\"brush\"", "data-control=\"articulation\"",
    "data-control=\"drive\"", "data-control=\"turn\"", "data-control=\"jump\"",
    "data-debug=\"skeleton\"", "data-debug=\"contacts\"", "data-debug=\"footBasis\"",
  ]) {
    assert.match(page, new RegExp(token));
  }
  assert.deepEqual(PRACTICE_LESSONS.map((lesson) => lesson.id), [
    "pulse", "articulations", "travel", "arms", "small-hop", "beat-one", "answer",
  ]);
  const runtime = readFileSync(resolve(ROOT, "js/render/appalachian-three-renderer.js"), "utf8");
  assert.ok(runtime.includes('new URL("../../assets/models/appalachian/'));
  assert.doesNotMatch(runtime, /https?:\/\//);
});

test("shipping title exposes only the Appalachian vertical slice", () => {
  const page = readFileSync(resolve(ROOT, "index.html"), "utf8");
  assert.match(page, /data-start-mode="frolic"/);
  assert.match(page, /data-start-mode="tradeLicks"/);
  assert.match(page, /data-start-mode="stepShed"/);
  for (const retired of ["measure", "practice", "freestyle", "battle"]) {
    assert.doesNotMatch(page, new RegExp(`data-start-mode="${retired}"`));
  }
  assert.match(page, /Two feet join the band/);
  assert.doesNotMatch(page, /headspin|floorwork|breaking/i);
});

function manifestValue() {
  return JSON.parse(readFileSync(
    resolve(ROOT, "assets/models/appalachian/simulator-manifest.json"),
    "utf8",
  ));
}
