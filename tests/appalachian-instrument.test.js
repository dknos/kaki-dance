import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  AppalachianAnimationController,
  deriveBodyDynamics,
} from "../js/appalachian/animation-controller.js";
import {
  GOLDEN_FOOT_GESTURES,
  resolveFootGesture,
  validateGoldenFootGestures,
} from "../js/appalachian/foot-gesture-deck.js";
import {
  APPALACHIAN_INTENT_WINDOW_TICKS,
  AppalachianIntentBuffer,
} from "../js/appalachian/performance-intent.js";
import { AppalachianJamSimulation } from "../js/appalachian/simulation.js";
import {
  AppalachianPerformanceState,
  PERFORMANCE_STATES,
} from "../js/appalachian/performance-state.js";
import { InputManager } from "../js/input.js";

const ROOT = resolve(import.meta.dirname, "..");
const DT = 1 / 120;

test("Left Arrow and Right Arrow produce only their anatomical foot edges", () => {
  const input = new InputManager({ target: null, profile: "appalachian" });
  input.bufferCode("ArrowLeft", true, edgeMeta(1));
  let step = input.consumeStep();
  assert.deepEqual(step.performanceEdges.map((edge) => edge.action), ["leftFoot"]);
  assert.equal(step.rightFootPressed, false);
  input.bufferCode("ArrowLeft", false, edgeMeta(2));
  input.bufferCode("ArrowRight", true, edgeMeta(3));
  step = input.consumeStep();
  assert.deepEqual(step.performanceEdges.map((edge) => edge.action), ["rightFoot"]);
  assert.equal(step.leftFootPressed, false);
  input.destroy();
});

test("rapid 16 Hz alternation retains every edge and preserves order", () => {
  const buffer = new AppalachianIntentBuffer();
  const resolved = [];
  const count = 32;
  for (let index = 0; index < count; index += 1) {
    const tick = index * 12;
    resolved.push(...buffer.advance(tick, { freeFoot: index % 2 ? "right" : "left" }));
    const foot = index % 2 ? "rightFoot" : "leftFoot";
    const result = buffer.accept(performanceEdge(foot, index), tick);
    resolved.push(...result.intents);
  }
  resolved.push(...buffer.advance(
    count * 12 + APPALACHIAN_INTENT_WINDOW_TICKS + 1,
    { freeFoot: "left" },
  ));
  assert.equal(resolved.length, count);
  assert.deepEqual(
    resolved.map((intent) => intent.foot),
    Array.from({ length: count }, (_, index) => index % 2 ? "right" : "left"),
  );
});

test("same-frame left and right strikes remain two independent contacts", () => {
  const buffer = new AppalachianIntentBuffer();
  const resolved = [
    ...buffer.accept(performanceEdge("leftFoot", 1, { articulationModifier: "heel" }), 96).intents,
    ...buffer.accept(performanceEdge("rightFoot", 2, { articulationModifier: "toe" }), 96).intents,
  ];
  assert.deepEqual(resolved.map((intent) => intent.foot), ["left", "right"]);
  assert.deepEqual(resolved.map((intent) => intent.modifiers.articulation), ["heel", "toe"]);
  assert.equal(new Set(resolved.map((intent) => intent.id)).size, 2);
});

test("same-foot doubles retrigger after release and operating-system repeat is ignored", () => {
  const target = new FakeEventTarget();
  const input = new InputManager({ target, profile: "appalachian" });
  target.dispatch("keydown", keyboardEvent("ArrowLeft", { timeStamp: 1 }));
  target.dispatch("keydown", keyboardEvent("ArrowLeft", { timeStamp: 2, repeat: true }));
  target.dispatch("keyup", keyboardEvent("ArrowLeft", { timeStamp: 3 }));
  target.dispatch("keydown", keyboardEvent("ArrowLeft", { timeStamp: 4 }));
  const step = input.consumeStep();
  assert.deepEqual(step.performanceEdges.map((edge) => edge.action), ["leftFoot", "leftFoot"]);
  input.destroy();
});

test("Q E F T chords coalesce in either order without a duplicate basic tap", () => {
  for (const family of ["brush", "articulation", "drive", "turn"]) {
    for (const order of ["foot-first", "family-first"]) {
      const buffer = new AppalachianIntentBuffer();
      const first = order === "foot-first" ? "leftFoot" : family;
      const second = order === "foot-first" ? family : "leftFoot";
      assert.equal(buffer.accept(performanceEdge(first, 1), 100).intents.length, 0);
      const result = buffer.accept(performanceEdge(second, 2), 108);
      assert.equal(result.intents.length, 1);
      assert.equal(result.intents[0].family, family);
      assert.equal(result.intents[0].foot, "left");
      assert.equal(buffer.advance(200, { freeFoot: "right" }).length, 0);
    }
  }
});

test("a family key alone resolves deterministically onto the legal free foot", () => {
  for (const family of ["brush", "articulation", "drive", "turn"]) {
    const buffer = new AppalachianIntentBuffer();
    buffer.accept(performanceEdge(family, 1), 100);
    const resolved = buffer.advance(100 + APPALACHIAN_INTENT_WINDOW_TICKS + 1, {
      freeFoot: "right",
    });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].family, family);
    assert.equal(resolved[0].foot, "right");
  }
});

test("modifier state is captured from the original keydown", () => {
  const buffer = new AppalachianIntentBuffer();
  buffer.accept(performanceEdge("leftFoot", 1, { committed: true }), 0);
  const result = buffer.accept(performanceEdge("brush", 2, { committed: false }), 8);
  assert.equal(result.intents[0].modifiers.committed, true);
  assert.equal(result.intents[0].originalModifiersFrom, "foot");

  const reverse = new AppalachianIntentBuffer();
  reverse.accept(performanceEdge("articulation", 3, { grounded: true }), 0);
  const reverseResult = reverse.accept(
    performanceEdge("rightFoot", 4, { grounded: false }),
    8,
  );
  assert.equal(reverseResult.intents[0].modifiers.grounded, true);
  assert.equal(reverseResult.intents[0].originalModifiersFrom, "family");
});

test("Shift brush, Control heel, and Z toe resolve immediately per foot", () => {
  const expected = {
    brush: { family: "brush", contacts: 3, articulation: "brush" },
    heel: { family: "articulation", contacts: 1, articulation: "heel" },
    toe: { family: "articulation", contacts: 1, articulation: "toe" },
  };
  for (const [modifier, contract] of Object.entries(expected)) {
    const buffer = new AppalachianIntentBuffer();
    const accepted = buffer.accept(
      performanceEdge("leftFoot", 1, { articulationModifier: modifier }),
      100,
    );
    assert.equal(accepted.intents.length, 1);
    assert.equal(accepted.intents[0].resolvedTick, 100);
    assert.equal(accepted.intents[0].family, contract.family);
    const gesture = resolveFootGesture(accepted.intents[0], {
      style: "flatfoot",
      supportingFoot: "right",
    });
    assert.equal(gesture.ok, true);
    assert.equal(gesture.contacts.length, contract.contacts);
    assert.equal(gesture.contacts[0].articulation, contract.articulation);
  }
});

test("Appalachian bindings are remappable while mandatory arrows stay playable", () => {
  const input = new InputManager({
    target: null,
    profile: "appalachian",
    bindings: {
      leftFoot: ["KeyJ"],
      brushModifier: ["KeyU"],
      jump: ["KeyN"],
    },
  });
  input.keys.add("KeyU");
  input.bufferCode("KeyJ", true, edgeMeta(1));
  input.bufferCode("ArrowRight", true, edgeMeta(2));
  input.bufferCode("KeyN", true, edgeMeta(3));
  input.update(DT);
  const step = input.consumeStep();
  assert.deepEqual(step.performanceEdges.map((edge) => edge.action), ["leftFoot", "rightFoot"]);
  assert.equal(step.performanceEdges[0].articulationModifier, "brush");
  assert.equal(step.jumpPressed, true);
  input.destroy();
});

test("gamepad parity maps feet, families, arms, modifiers, jump, and pause", () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 9, 11, 14, 15]) {
    buttons[index] = { pressed: true, value: 1 };
  }
  const input = new InputManager({
    target: null,
    profile: "appalachian",
    getGamepads: () => [{ axes: [0.55, -0.45, 0.6, -0.75], buttons }],
  });
  input.update(DT);
  const step = input.consumeStep();
  assert.deepEqual(
    step.performanceEdges.map((edge) => edge.action),
    ["leftFoot", "rightFoot", "brush", "articulation", "drive", "turn"],
  );
  assert.equal(step.performanceEdges.every((edge) => edge.articulationModifier === "brush"), true);
  assert.ok(step.travelX > 0 && step.travelY < 0);
  assert.ok(step.armX > 0 && step.armY > 0);
  assert.equal(step.brushModifier, true);
  assert.equal(step.heelModifier, true);
  assert.equal(step.toeModifier, true);
  assert.equal(step.jumpPressed, true);
  assert.equal(step.pausePressed, true);
  input.destroy();
});

test("controller disconnect clears held feet and modifiers before reconnect", () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[4] = { pressed: true, value: 1 };
  buttons[14] = { pressed: true, value: 1 };
  let pads = [{ axes: [0, 0, 0, 0], buttons }];
  const input = new InputManager({
    target: null,
    profile: "appalachian",
    getGamepads: () => pads,
  });
  input.update(DT);
  let step = input.consumeStep();
  assert.equal(step.leftFootPressed, true);
  assert.equal(step.brushModifier, true);

  pads = [];
  input.update(DT);
  step = input.consumeStep();
  assert.equal(step.leftFoot, false);
  assert.equal(step.leftFootReleased, true);
  assert.equal(step.brushModifier, false);

  pads = [{ axes: [0, 0, 0, 0], buttons }];
  input.update(DT);
  step = input.consumeStep();
  assert.equal(step.leftFootPressed, true);
  input.destroy();
});

test("persistent arm height and isolation never restart active feet", () => {
  const controller = new AppalachianAnimationController({ style: "buck" });
  const started = controller.requestFootGesture({
    id: 1,
    foot: "left",
    family: "basic",
    modifiers: { grounded: false, committed: false },
    rawTimeStamp: 0,
    sourceCodes: ["ArrowLeft"],
  }, { tick: 0 });
  assert.equal(started.ok, true);
  const actionId = controller.getSnapshot(0).actionId;
  for (let tick = 1; tick <= 24; tick += 1) {
    controller.update(tick, {
      dt: DT,
      input: {
        armY: 1,
        armActive: true,
        armInputMode: "rate",
        leftArmModifier: true,
      },
    });
    assert.equal(controller.getSnapshot(tick).actionId, actionId);
  }
  const raised = controller.getSnapshot(24).upperBody.left.y;
  for (let tick = 25; tick <= 48; tick += 1) {
    controller.update(tick, { dt: DT, input: { armInputMode: "rate" } });
  }
  const held = controller.getSnapshot(48);
  assert.ok(raised > -0.18);
  assert.ok(Math.abs(held.upperBody.left.y - raised) < 0.02);
  assert.equal(held.upperBody.leftOverride, true);
});

test("travel, independent feet, arms, and modifiers coexist in one fixed step", () => {
  const simulation = new AppalachianJamSimulation({ style: "flatfoot" });
  simulation.begin(beatSnapshot(0));
  simulation.update(DT, beatSnapshot(0), {
    travelX: 1,
    travelY: -1,
    armY: 1,
    armActive: true,
    armInputMode: "rate",
    groundModifier: true,
    performanceEdges: [performanceEdge("leftFoot", 1, { grounded: true })],
    device: "test",
  });
  const first = simulation.getSnapshot(beatSnapshot(0));
  assert.equal(first.dancer.feet.left.stage, "anticipation");
  simulation.update(DT, beatSnapshot(16), {
    travelX: 1,
    travelY: -1,
    armInputMode: "rate",
    device: "test",
  });
  const second = simulation.getSnapshot(beatSnapshot(16));
  assert.ok(Math.hypot(second.dancer.rootVelocity.x, second.dancer.rootVelocity.z) > 0);
  assert.ok(second.dancer.upperBody.coordinated.y > -0.18);
  assert.notEqual(second.dancer.feet.left.stage, "planted");
});

test("supporting-foot gestures insert weight transfer and no grounded frame loses both supports", () => {
  const controller = new AppalachianAnimationController({ style: "flatfoot" });
  const support = controller.supportingFoot();
  const result = controller.requestFootGesture({
    id: 1,
    foot: support,
    family: "basic",
    modifiers: { grounded: false, committed: true },
    rawTimeStamp: 0,
    sourceCodes: [support === "left" ? "ArrowLeft" : "ArrowRight"],
  }, { tick: 0 });
  assert.equal(result.ok, true);
  assert.ok(result.gesture.weightTransferTicks > 0);
  for (let tick = 0; tick <= 80; tick += 1) {
    controller.update(tick, { dt: DT, input: {} });
    const snapshot = controller.getSnapshot(tick);
    assert.notEqual(snapshot.supportingFoot, "none");
    assert.ok(Math.abs(
      snapshot.weightDistribution.left + snapshot.weightDistribution.right - 1,
    ) < 1e-9);
  }
});

test("T plus direction applies a deterministic low-pivot facing change", () => {
  const controller = new AppalachianAnimationController({ style: "flatfoot" });
  const result = controller.requestFootGesture({
    id: 1,
    foot: "left",
    family: "turn",
    modifiers: { grounded: true, committed: false },
    rawTimeStamp: 0,
    sourceCodes: ["KeyT", "KeyA"],
  }, { tick: 0, direction: "turn-left" });
  assert.equal(result.ok, true);
  for (let tick = 0; tick <= 64; tick += 1) {
    controller.update(tick, {
      dt: DT,
      input: { travelX: -0.25, travelY: -0.2 },
    });
  }
  const snapshot = controller.getSnapshot(64);
  assert.ok(snapshot.facing < -0.2);
  assert.ok(Math.hypot(snapshot.rootVelocity.x, snapshot.rootVelocity.z) > 0);
});

test("golden gesture contacts are authored, footwear-mapped, and transition validated", () => {
  assert.deepEqual(validateGoldenFootGestures(), []);
  assert.deepEqual(Object.keys(GOLDEN_FOOT_GESTURES), [
    "basic", "brush", "articulation", "drive", "turn",
  ]);
  const simulation = new AppalachianJamSimulation({ style: "clog" });
  simulation.begin(beatSnapshot(0));
  simulation.update(DT, beatSnapshot(0), {
    performanceEdges: [
      performanceEdge("rightFoot", 1),
      performanceEdge("articulation", 2),
    ],
    device: "test",
  });
  for (let tick = 1; tick <= 100; tick += 1) {
    simulation.update(DT, beatSnapshot(tick), { device: "test" });
  }
  const contacts = simulation.events.filter((event) => event.type === "footContact");
  assert.ok(contacts.length >= 2);
  assert.ok(contacts.every((contact) => contact.foot === "right"));
  assert.ok(contacts.every((contact) => contact.transitionValidated === true));
  assert.deepEqual(contacts.slice(0, 2).map((contact) => contact.sampleGroup), ["heel", "toeBall"]);
});

test("incompatible foot families retain their articulation over a legal base handoff", () => {
  const controller = new AppalachianAnimationController({ style: "flatfoot" });
  const intent = (id, foot, family) => ({
    id,
    foot,
    family,
    modifiers: { grounded: false, committed: false },
    rawTimeStamp: id,
    sourceCodes: [foot === "left" ? "ArrowLeft" : "ArrowRight"],
  });
  assert.equal(
    controller.requestFootGesture(intent(1, "left", "turn"), { tick: 0 }).ok,
    true,
  );
  controller.update(48, { dt: DT, input: {} });
  const articulation = controller.requestFootGesture(
    intent(2, "right", "articulation"),
    { tick: 48 },
  );
  assert.equal(articulation.ok, true);
  assert.ok(articulation.contextualFallback);
  assert.notEqual(articulation.transition?.recovery, true);
  assert.equal(articulation.gesture.family, "articulation");
  assert.equal(controller.getSnapshot(48).performance.recoveries, 0);
});

test("exported foot basis, mirrored shoes, shared heroes, and support exclusions are explicit", () => {
  const manifest = JSON.parse(readFileSync(
    resolve(ROOT, "assets/models/appalachian/simulator-manifest.json"),
    "utf8",
  ));
  assert.deepEqual(manifest.characters, ["kitty", "soder"]);
  assert.deepEqual(manifest.supportCapableBones, ["foot.L", "foot.R"]);
  assert.ok(manifest.excludedSupportBones.includes("costume.tail"));
  assert.equal(manifest.gateCounts.actions, 23);
  assert.equal(manifest.gateCounts.goldenPairedGestures, 10);
  assert.equal(manifest.footBasis.localForwardAxis, "+Y");
  assert.deepEqual(manifest.footBasis.gltfDancerForward, [0, 0, 1]);
  assert.ok(
    manifest.footBasis.validation.minimumDot
      >= manifest.footBasis.plantedToeForwardDotMin,
  );
  assert.match(manifest.footBasis.shoeMirroring, /reversed winding/);
  for (const action of Object.values(manifest.actions)) {
    assert.ok(Array.isArray(action.toeForwardExemptions));
    assert.ok(action.movementProvenance);
  }
});

test("two-foot instrument replay is deterministic", () => {
  const run = () => {
    const simulation = new AppalachianJamSimulation({ style: "buck", seed: 42 });
    simulation.begin(beatSnapshot(0));
    for (let tick = 0; tick <= 220; tick += 2) {
      const performanceEdges = [];
      if (tick % 24 === 0) {
        performanceEdges.push(performanceEdge(tick % 48 ? "rightFoot" : "leftFoot", tick));
      }
      if (tick % 72 === 0) performanceEdges.push(performanceEdge("brush", tick + 1));
      simulation.update(DT, beatSnapshot(tick), {
        travelX: Math.sin(tick / 40),
        armY: tick < 90 ? 1 : 0,
        armActive: tick < 90,
        armInputMode: "rate",
        performanceEdges,
        device: "replay-test",
      });
    }
    const snapshot = simulation.getSnapshot(beatSnapshot(220));
    const dancer = structuredClone(snapshot.dancer);
    // Wall-clock latency telemetry is deliberately excluded from replay-state
    // equality. It is measured separately and never participates in decisions.
    delete dancer.response;
    return JSON.stringify({
      replay: simulation.replay,
      dancer,
      score: snapshot.playerScore,
    });
  };
  assert.equal(run(), run());
});

test("support, contact, and landing drive bounded body dynamics without moving the stage", () => {
  const base = {
    tick: 96,
    style: "flatfoot",
    feet: {
      left: { stage: "contact", phase: 0.48 },
      right: { stage: "planted", phase: 0 },
    },
    weightDistribution: { left: 0.82, right: 0.18 },
    jump: { state: "grounded" },
    bodyLean: { forward: 0.25, lateral: -0.2, turn: 0.1 },
    angularVelocity: 0.4,
    expression: { id: "in-the-pocket", intensity: 0.72 },
  };
  const first = deriveBodyDynamics(base);
  const second = deriveBodyDynamics(base);
  assert.deepEqual(first, second);
  assert.ok(first.pelvisVerticalMeters < -0.01);
  assert.ok(first.leftLeg.kneeCompressionDegrees > first.rightLeg.kneeCompressionDegrees);
  assert.ok(Math.abs(first.pelvisVerticalMeters) <= 0.09);
  const landing = deriveBodyDynamics({
    ...base,
    jump: { state: "landing", landingAge: 0 },
  });
  assert.ok(landing.pelvisVerticalMeters < first.pelvisVerticalMeters);
  assert.ok(landing.landingCompression > 0.9);
});

test("musical variety reaches cooking while dense one-foot mashing scrambles", () => {
  const skilled = new AppalachianPerformanceState();
  const articulations = ["flat", "brush", "heel", "toe"];
  const moves = ["walkingStep", "shuffle", "heelToeChange", "backstep", "rockStep"];
  for (let index = 0; index < 11; index += 1) {
    skilled.recordContact({
      tick: index * 36,
      foot: index % 2 ? "right" : "left",
      articulation: articulations[index % articulations.length],
      moveId: moves[index % moves.length],
      timingOffsetTicks: index % 2 ? 3 : -2,
    });
  }
  assert.equal(
    skilled.update(384, { averageTransitionScore: 0.92 }).id,
    PERFORMANCE_STATES.COOKING,
  );

  const mash = new AppalachianPerformanceState();
  for (let index = 0; index < 20; index += 1) {
    mash.recordContact({
      tick: index * 12,
      foot: "left",
      articulation: "flat",
      moveId: "walkingStep",
      timingOffsetTicks: 0,
    });
  }
  assert.equal(
    mash.update(240, { averageTransitionScore: 0.8 }).id,
    PERFORMANCE_STATES.SCRAMBLING,
  );
});

test("authored multi-contact brushes count as one intentional foot action", () => {
  const performance = new AppalachianPerformanceState();
  for (let actionId = 1; actionId <= 10; actionId += 1) {
    const foot = actionId % 2 ? "left" : "right";
    for (let contact = 0; contact < 3; contact += 1) {
      performance.recordContact({
        actionId,
        tick: actionId * 36 + contact * 8,
        foot,
        articulation: contact < 2 ? "brush" : "toe",
        moveId: "shuffle",
        timingOffsetTicks: contact - 1,
      });
    }
  }
  const state = performance.update(384, { averageTransitionScore: 0.88 });
  assert.equal(state.actionCount, 10);
  assert.equal(state.repeatedFootRuns, 0);
  assert.equal(state.mash, false);
  assert.notEqual(state.id, PERFORMANCE_STATES.SCRAMBLING);
});

test("travel facing changes are responsive without snapping", () => {
  const controller = new AppalachianAnimationController({ style: "flatfoot" });
  controller.update(1, { dt: DT, input: { travelX: 1, travelY: 0 } });
  const snapshot = controller.getSnapshot(1);
  assert.ok(Math.abs(snapshot.angularVelocity) <= 5.01);
  assert.ok(snapshot.facing > 0);
  assert.ok(snapshot.facing < Math.PI / 2);
});

test("travel and a low pivot share one bounded facing-rate budget", () => {
  const controller = new AppalachianAnimationController({ style: "flatfoot" });
  const turn = controller.requestFootGesture({
    id: 1,
    foot: "right",
    family: "turn",
    modifiers: { grounded: false, committed: false },
    rawTimeStamp: 1,
    sourceCodes: ["KeyT", "ArrowRight"],
  }, {
    tick: 0,
    direction: "turn-right",
  });
  assert.equal(turn.ok, true);
  let previousFacing = controller.getSnapshot(0).facing;
  for (let step = 1; step <= 48; step += 1) {
    const tick = step * 192 / 120;
    controller.update(tick, { dt: DT, input: { travelX: 1, travelY: 0 } });
    const snapshot = controller.getSnapshot(tick);
    const delta = Math.atan2(
      Math.sin(snapshot.facing - previousFacing),
      Math.cos(snapshot.facing - previousFacing),
    );
    assert.ok(Math.abs(delta / DT) <= 5.01);
    assert.ok(Math.abs(snapshot.angularVelocity) <= 5.01);
    previousFacing = snapshot.facing;
  }
  assert.ok(previousFacing > 0.5);
});

function edgeMeta(value) {
  return {
    device: "test",
    rawTimeStamp: value,
    receivedTimeStamp: value,
    code: "",
  };
}

function performanceEdge(action, sequence, modifiers = {}) {
  return Object.freeze({
    action,
    rawTimeStamp: sequence,
    receivedTimeStamp: sequence,
    device: "test",
    code: action,
    grounded: Boolean(modifiers.grounded),
    committed: Boolean(modifiers.committed),
    articulationModifier: modifiers.articulationModifier ?? "",
  });
}

function beatSnapshot(tick) {
  return Object.freeze({
    audioTime: tick / 192,
    playbackSeconds: tick / 192,
    beat: tick / 96,
    beatIndex: Math.floor(tick / 96),
    beatPhase: (tick % 96) / 96,
    beatInBar: Math.floor(tick / 96) % 4,
    barIndex: Math.floor(tick / 384),
    measure: Math.floor(tick / 384) + 1,
    phrase: 1,
    section: "test",
    intensity: 0.7,
    bpm: 120,
    paused: false,
    running: true,
  });
}

function keyboardEvent(code, {
  timeStamp = 0,
  repeat = false,
  shiftKey = false,
  ctrlKey = false,
} = {}) {
  return {
    code,
    timeStamp,
    repeat,
    shiftKey,
    ctrlKey,
    target: null,
    preventDefault() {},
  };
}

class FakeEventTarget {
  constructor() {
    this.handlers = new Map();
  }

  addEventListener(type, callback) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(callback);
  }

  dispatch(type, event) {
    for (const callback of this.handlers.get(type) ?? []) callback(event);
  }
}
