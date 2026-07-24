import assert from "node:assert/strict";
import test from "node:test";

import {
  CORE_FOOTWORK_IDS,
  FOOTWORK_CATALOG,
  getFootwork,
  resolveExitFoot,
  validateFootworkCatalog,
} from "../js/appalachian/footwork-catalog.js";
import {
  evaluateCallResponse,
  motifRepetitionValue,
  scoreAppalachianRoutine,
} from "../js/appalachian/phrase-judge.js";
import {
  FootworkTransitionGraph,
  validateTransitionGraph,
} from "../js/appalachian/transition-graph.js";
import {
  AppalachianJamSimulation,
  simulateFrolicInputs,
} from "../js/appalachian/simulation.js";
import {
  APPALACHIAN_TUNE_MAP,
  FROLIC_RUN_TICKS,
  FROLIC_STATES,
  FROLIC_TICKS_PER_BAR,
  frolicStateAtTick,
  validateAppalachianTuneMap,
} from "../js/appalachian/tune-map.js";

test("Board & Bow is an exact 32-bar AABB tune with two-bar count-in", () => {
  assert.deepEqual(validateAppalachianTuneMap(APPALACHIAN_TUNE_MAP), []);
  assert.equal(APPALACHIAN_TUNE_MAP.form, "AABB");
  assert.equal(APPALACHIAN_TUNE_MAP.strains.length, 4);
  assert.equal(APPALACHIAN_TUNE_MAP.strains.reduce((sum, strain) => sum + strain.bars, 0), 32);
  assert.equal(APPALACHIAN_TUNE_MAP.offsetSeconds, 4);
  assert.equal(FROLIC_RUN_TICKS, 32 * 4 * 96);
});

test("Frolic state changes land on authored phrase boundaries", () => {
  assert.equal(frolicStateAtTick(-1), FROLIC_STATES.COUNT_IN);
  assert.equal(frolicStateAtTick(0), FROLIC_STATES.OPEN_JAM);
  assert.equal(frolicStateAtTick(8 * FROLIC_TICKS_PER_BAR), FROLIC_STATES.TRADE_CALL);
  assert.equal(frolicStateAtTick(9 * FROLIC_TICKS_PER_BAR), FROLIC_STATES.TRADE_RESPONSE);
  assert.equal(frolicStateAtTick(16 * FROLIC_TICKS_PER_BAR), FROLIC_STATES.OPEN_JAM);
  assert.equal(frolicStateAtTick(24 * FROLIC_TICKS_PER_BAR), FROLIC_STATES.TRADE_CALL);
  assert.equal(frolicStateAtTick(30 * FROLIC_TICKS_PER_BAR), FROLIC_STATES.BREAKDOWN);
  assert.equal(frolicStateAtTick(31 * FROLIC_TICKS_PER_BAR), FROLIC_STATES.FINISH);
  assert.equal(frolicStateAtTick(FROLIC_RUN_TICKS), FROLIC_STATES.RESULTS);
});

test("twelve core families carry complete, in-bounds contact metadata", () => {
  assert.equal(CORE_FOOTWORK_IDS.length, 12);
  assert.deepEqual(validateFootworkCatalog(), []);
  for (const move of Object.values(FOOTWORK_CATALOG)) {
    assert.ok(move.contacts.length);
    assert.ok(move.contacts.every((contact) => contact.tick < move.durationTicks));
    assert.ok(move.audioSampleIds.length);
    assert.ok(move.sourceNotes.length);
  }
});

test("all three style graphs have useful authored successors and no impossible edges", () => {
  for (const style of ["flatfoot", "buck", "clog"]) {
    assert.deepEqual(validateTransitionGraph(style), []);
  }
  const graph = new FootworkTransitionGraph({ style: "flatfoot" });
  const legal = graph.resolve({
    fromId: "walkingStep",
    toId: "crisscross",
    entryFoot: "left",
    direction: "cross",
    landingTick: 96,
  });
  assert.equal(legal.ok, true);
  const unavailable = graph.resolve({
    fromId: "walkingStep",
    toId: "tripleStep",
    entryFoot: "left",
    direction: "neutral",
    landingTick: 96,
  });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reason, "style-unavailable");
});

test("foundation entry and exit feet alternate deterministically", () => {
  const walking = getFootwork("walkingStep");
  const firstExit = resolveExitFoot(walking, "left");
  const secondExit = resolveExitFoot(walking, firstExit);
  assert.equal(firstExit, "right");
  assert.equal(secondExit, "left");
});

test("easy exact echoes, advanced variations, and wrong anchors are distinguished", () => {
  const call = APPALACHIAN_TUNE_MAP.calls[0];
  const responseStart = (call.responseBar - 1) * FROLIC_TICKS_PER_BAR;
  const exact = evaluateCallResponse(
    call,
    call.rhythmTicks.map((tick) => ({ tick: responseStart + tick })),
    { difficulty: "easy" },
  );
  assert.equal(exact.accepted, true);
  assert.equal(exact.type, "exact");
  const variationTicks = [...call.anchorTicks, 48, 216, 336];
  const variation = evaluateCallResponse(
    call,
    variationTicks.map((tick) => ({ tick: responseStart + tick })),
    { difficulty: "advanced" },
  );
  assert.equal(variation.accepted, true);
  assert.equal(variation.type, "variation");
  assert.ok(variation.score > exact.score);
  const incorrect = evaluateCallResponse(
    call,
    [48, 144, 216, 336].map((tick) => ({ tick: responseStart + tick })),
    { difficulty: "advanced" },
  );
  assert.equal(incorrect.accepted, false);
  assert.ok(incorrect.anchorAccuracy < 2 / 3);
});

test("high-frequency repeated input scores well below a clean varied routine", () => {
  const clean = [];
  const cleanMoves = ["walkingStep", "shuffle", "backstep", "heelToeChange", "rockStep", "crisscross"];
  for (let index = 0; index < 64; index += 1) {
    clean.push(event(index * 48, cleanMoves[index % cleanMoves.length], index % 3 ? 0.62 : 0.84));
  }
  const spam = [];
  for (let tick = 0; tick < 64 * 48; tick += 8) spam.push(event(tick, "doubleStep", 1));
  const cleanScore = scoreAppalachianRoutine(clean);
  const spamScore = scoreAppalachianRoutine(spam);
  assert.ok(cleanScore.total >= spamScore.total + 20, `${cleanScore.total} vs ${spamScore.total}`);
  assert.ok(spamScore.restraint < 0.5);
});

test("intentional A/B motif returns are rewarded rather than classified as spam", () => {
  const events = [];
  for (const bar of [1, 9, 17, 25]) {
    const start = (bar - 1) * FROLIC_TICKS_PER_BAR;
    for (const [index, tick] of [0, 96, 192, 288].entries()) {
      events.push(event(start + tick, index % 2 ? "shuffle" : "walkingStep", 0.62));
    }
  }
  assert.ok(motifRepetitionValue(events) >= 0.9);
  const result = scoreAppalachianRoutine(events);
  assert.ok(result.restraint > 0.8);
  assert.ok(result.reasons.some((reason) => reason.includes("motif")));
});

test("semantic STEP inputs alternate the foundation foot and emit immediate contacts", () => {
  const simulation = new AppalachianJamSimulation({ style: "flatfoot" });
  simulation.begin(snapshotAtTick(-768));
  const feet = [];
  for (const tick of [0, 96, 192, 288]) {
    const input = frolicInput("step");
    simulation.update(0.05, snapshotAtTick(tick), input);
    simulation.consumeEvents((value) => {
      if (value.type === "footContact" && value.immediate) feet.push(value.foot);
    });
  }
  assert.deepEqual(feet, ["left", "right", "left", "right"]);
});

test("valid rhythm still sounds immediately while the authored body queue is full", () => {
  const simulation = new AppalachianJamSimulation({ style: "buck" });
  simulation.begin(snapshotAtTick(-768));
  simulation.update(0.05, snapshotAtTick(0), frolicInput("step"));
  simulation.update(0.05, snapshotAtTick(12), frolicInput("brush"));
  simulation.update(0.05, snapshotAtTick(24), frolicInput("drive"));
  const events = [];
  simulation.consumeEvents((value) => events.push(value));
  const driveContact = events.find((value) => (
    value.type === "footContact"
    && value.immediate
    && value.inputKind === "drive"
  ));
  const driveInput = events.find((value) => (
    value.type === "frolicInput"
    && value.inputKind === "drive"
  ));
  assert.ok(driveContact);
  assert.equal(driveInput?.rhythmOnly, true);
  assert.equal(
    events.some((value) => value.type === "frolicInputRejected" && value.inputKind === "drive"),
    false,
  );
});

test("trade calls emit on their exact authored ticks", () => {
  const simulation = new AppalachianJamSimulation({ style: "buck" });
  const call = APPALACHIAN_TUNE_MAP.calls[0];
  const start = (call.callBar - 1) * FROLIC_TICKS_PER_BAR;
  simulation.begin(snapshotAtTick(start - 12));
  simulation.update(0.1, snapshotAtTick(start + 12), frolicInput());
  const values = [];
  simulation.consumeEvents((value) => values.push(value));
  const event = values.find((value) => value.type === "tradeCall");
  assert.equal(event?.tick, start);
  assert.equal(event?.anchor, true);
});

test("live trade-response scoring refreshes after a complete anchor-preserving variation", () => {
  const simulation = new AppalachianJamSimulation({ style: "buck", difficulty: "advanced" });
  const call = APPALACHIAN_TUNE_MAP.calls[0];
  const responseStart = (call.responseBar - 1) * FROLIC_TICKS_PER_BAR;
  simulation.begin(snapshotAtTick(responseStart - 12));
  for (const [index, localTick] of [0, 48, 96, 240, 336].entries()) {
    simulation.update(
      0.05,
      snapshotAtTick(responseStart + localTick),
      frolicInput(index % 2 ? "brush" : "step"),
    );
  }
  const live = simulation.getSnapshot(snapshotAtTick(responseStart + 336)).frolic.score;
  assert.equal(live.callResponses[0].accepted, true);
  assert.equal(live.callResponses[0].type, "variation");
  assert.equal(live.callResponses[0].anchorAccuracy, 1);
});

test("turnaround credit is recorded only inside the final beat window", () => {
  const simulation = new AppalachianJamSimulation({ style: "clog" });
  simulation.begin(snapshotAtTick(-768));
  simulation.update(0.1, snapshotAtTick(2 * 96), frolicInput("lick"));
  simulation.update(0.1, snapshotAtTick(7 * FROLIC_TICKS_PER_BAR + 3 * 96), frolicInput("lick"));
  const result = simulation.judge.getResult();
  assert.equal(result.validTurnarounds, 1);
});

test("Step Shed completes five learn-by-doing lessons without a glossary gate", () => {
  const simulation = new AppalachianJamSimulation({ mode: "stepShed", style: "flatfoot" });
  simulation.begin(snapshotAtTick(-768));
  const lessonInputs = [
    [0, "step"], [96, "step"], [192, "step"], [288, "step"],
    [432, "brush"], [528, "brush"],
    [624, "drive"], [720, "drive"],
    [768, "step"], [864, "brush"], [1008, "step"],
    [1488, "lick"],
  ];
  for (const [tick, kind] of lessonInputs) {
    simulation.update(0.05, snapshotAtTick(tick), frolicInput(kind));
  }
  assert.equal(simulation.complete, true);
  assert.ok(simulation.result.player.eventCount >= lessonInputs.length);
});

test("seeded Frolic simulation is deterministic and STEP alone is not elite", () => {
  const inputs = [];
  for (let tick = 0; tick < FROLIC_RUN_TICKS; tick += 96) {
    inputs.push({ tick, kind: "step" });
  }
  const first = simulateFrolicInputs(inputs);
  const second = simulateFrolicInputs(inputs);
  assert.deepEqual(first.result, second.result);
  assert.deepEqual(first.replay, second.replay);
  assert.ok(first.result.player.total < 90);
  assert.equal(first.result.player.uniqueMoves, 1);
});

function event(tick, moveId, intensity) {
  return {
    tick,
    moveId,
    articulation: moveId === "shuffle" ? "brush" : "flat",
    intensity,
    timingOffsetTicks: 0,
    style: "flatfoot",
    foot: tick % 96 ? "right" : "left",
  };
}

function frolicInput(kind = "") {
  return {
    x: 0,
    y: 0,
    action: kind === "step",
    actionPressed: kind === "step",
    style: kind === "brush",
    stylePressed: kind === "brush",
    power: kind === "drive",
    powerPressed: kind === "drive",
    freeze: kind === "lick",
    freezePressed: kind === "lick",
    device: "keyboard",
  };
}

function snapshotAtTick(tick) {
  const beat = tick / 96;
  const beatIndex = Math.floor(beat);
  return {
    audioTime: (beat + 8) * 0.5,
    playbackSeconds: (beat + 8) * 0.5,
    beat,
    beatIndex,
    beatPhase: ((beat % 1) + 1) % 1,
    beatInBar: ((beatIndex % 4) + 4) % 4,
    barIndex: Math.floor(beat / 4),
    measure: Math.floor(beat / 4) + 1,
    phrase: Math.floor(beat / 32) + 1,
    section: "test",
    intensity: 0.7,
    bpm: 120,
    paused: false,
    running: true,
  };
}
