import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BEATMAP, DEFAULT_MEASURE_PATTERNS } from "../js/audio/beatmap.js";
import { TIMING_WINDOWS } from "../js/config.js";
import { createInputStep } from "../js/input.js";
import { MeasureJudge } from "../js/dance/measure-judge.js";
import {
  MeasureMatchSimulation,
  presentationAtBeat,
} from "../js/dance/measure-match-simulation.js";

const SIMPLE_PATTERN = Object.freeze({
  id: "test",
  targetTicks: [0, 4, 8, 12],
  targetStrengths: [1, 1, 1, 1],
  optionalStyleTicks: [6, 14],
});

test("nearest unmatched target claims one input at most once and blocks spam", () => {
  const judge = new MeasureJudge({
    pattern: SIMPLE_PATTERN,
    responseStartBeat: 8,
    bpm: 100,
    timingWindows: TIMING_WINDOWS.standard,
  });
  const first = judge.judgeInput(8.02);
  const spam = judge.judgeInput(8.025);
  const second = judge.judgeInput(9.01);
  assert.equal(first.type, "target");
  assert.equal(first.index, 0);
  assert.equal(spam.type, "extra");
  assert.equal(second.index, 1);
  assert.equal(judge.getSnapshot().targets.filter((target) => target.status === "hit").length, 2);
});

test("signed timing errors are early/late in audio-clock milliseconds", () => {
  const early = new MeasureJudge({
    pattern: { ...SIMPLE_PATTERN, targetTicks: [4], targetStrengths: [1], optionalStyleTicks: [] },
    responseStartBeat: 8,
    bpm: 100,
    timingWindows: TIMING_WINDOWS.standard,
  }).judgeInput(8.9);
  const late = new MeasureJudge({
    pattern: { ...SIMPLE_PATTERN, targetTicks: [4], targetStrengths: [1], optionalStyleTicks: [] },
    responseStartBeat: 8,
    bpm: 100,
    timingWindows: TIMING_WINDOWS.standard,
  }).judgeInput(9.1);
  assert.equal(early.errorMs, -60);
  assert.equal(early.timing, "early");
  assert.equal(late.errorMs, 60);
  assert.equal(late.timing, "late");
});

test("misses, extras, optional style, completion, and grades are independent", () => {
  const judge = new MeasureJudge({
    pattern: SIMPLE_PATTERN,
    responseStartBeat: 8,
    bpm: 100,
    timingWindows: TIMING_WINDOWS.standard,
  });
  judge.judgeInput(8);
  judge.judgeInput(9.5, { style: true });
  judge.judgeInput(10);
  judge.judgeInput(11.82);
  const result = judge.finalize(12.2);
  assert.equal(result.missedTargets, 2);
  assert.equal(result.extraTaps, 1);
  assert.equal(result.optionalStyleHits, 1);
  assert.equal(result.optionalStyleAccuracy, 0.5);
  assert.equal(result.measureCompletion, false);
  assert.equal(result.grade, "SHAKY");
});

test("optional style cells require the separate Style input", () => {
  const judge = new MeasureJudge({
    pattern: SIMPLE_PATTERN,
    responseStartBeat: 8,
    bpm: 100,
    timingWindows: TIMING_WINDOWS.standard,
  });
  const spaceOnStyleCell = judge.judgeInput(9.5);
  const styleOnStyleCell = judge.judgeInput(11.5, { style: true });
  assert.equal(spaceOnStyleCell.type, "extra");
  assert.equal(styleOnStyleCell.type, "style");
  assert.equal(judge.getSnapshot().optional.filter((event) => event.status === "hit").length, 1);
});

test("judgments and predictive choreography are deterministic", () => {
  const run = () => {
    const judge = new MeasureJudge({
      pattern: DEFAULT_MEASURE_PATTERNS[4],
      responseStartBeat: 40,
      bpm: 100,
      timingWindows: TIMING_WINDOWS.wide,
    });
    for (const beat of [40, 40.75, 41, 42, 42.5, 43, 43.5]) judge.judgeInput(beat);
    return judge.finalize(44.5);
  };
  assert.deepEqual(run(), run());
  const before = presentationAtBeat(41.2, DEFAULT_BEATMAP);
  const afterTap = presentationAtBeat(41.2, DEFAULT_BEATMAP);
  assert.deepEqual(before, afterTap);
  assert.equal(before.clip, "sixStep");
  assert.ok(before.phase > 1 / 3 && before.phase < 0.5);
});

test("one action button completes the interactive opening tutorial", () => {
  const simulation = new MeasureMatchSimulation({
    mode: "practice",
    character: "kitty",
    beatmap: DEFAULT_BEATMAP,
    timingWindows: TIMING_WINDOWS.standard,
  });
  simulation.begin(snapshotAt(0));
  const tapBeats = new Set();
  for (const pattern of DEFAULT_MEASURE_PATTERNS.slice(0, 2)) {
    const start = (pattern.responseBar - 1) * 4;
    for (const tick of pattern.targetTicks) tapBeats.add(roundBeat(start + tick / 4));
  }
  for (let beat = 0; beat <= 20.001; beat += 1 / 40) {
    const rounded = roundBeat(beat);
    const input = createInputStep();
    if (tapBeats.has(rounded)) {
      input.action = true;
      input.actionPressed = true;
      input.device = "keyboard";
    }
    simulation.update(0.015, snapshotAt(rounded), input);
  }
  assert.equal(simulation.complete, true);
  assert.equal(simulation.result.player.measures, 2);
  assert.equal(simulation.result.player.completedMeasures, 2);
  assert.ok(simulation.result.player.total >= 95);
  assert.ok(simulation.replay.every((entry) => !entry.stylePressed));
});

test("audio pre-roll opens on count one instead of wrapping to count four", () => {
  const simulation = new MeasureMatchSimulation({
    mode: "practice",
    character: "kitty",
    beatmap: DEFAULT_BEATMAP,
    timingWindows: TIMING_WINDOWS.standard,
  });
  simulation.begin(snapshotAt(-0.14));
  const snapshot = simulation.getSnapshot(snapshotAt(-0.14));
  assert.equal(snapshot.measureMatch.bar, 1);
  assert.equal(snapshot.measureMatch.tick, 0);
  assert.equal(snapshot.measureMatch.state, "countIn");
});

test("a failed first echo requests an immediate simple-pattern replay", () => {
  const simulation = new MeasureMatchSimulation({
    mode: "practice",
    character: "kitty",
    beatmap: DEFAULT_BEATMAP,
    timingWindows: TIMING_WINDOWS.standard,
  });
  simulation.begin(snapshotAt(0));
  for (let beat = 0; beat <= 12.1; beat += 0.05) {
    simulation.update(0.03, snapshotAt(roundBeat(beat)), createInputStep());
  }
  const events = [];
  simulation.consumeEvents((event) => events.push(event));
  const replay = events.find((event) => event.type === "tutorialReplay");
  assert.equal(replay?.patternId, "pocket-quarters");
  assert.equal(replay?.callBar, 2);
});

test("pausing inside a COPY measure preserves pending targets until audio resumes", () => {
  const judge = new MeasureJudge({
    pattern: SIMPLE_PATTERN,
    responseStartBeat: 8,
    bpm: 100,
    timingWindows: TIMING_WINDOWS.standard,
  });
  judge.advance(8.45);
  const beforePause = judge.getSnapshot();
  for (let index = 0; index < 300; index += 1) judge.advance(8.45);
  assert.deepEqual(judge.getSnapshot(), beforePause);
  const resumed = judge.judgeInput(9);
  assert.equal(resumed.type, "target");
  assert.equal(resumed.index, 1);
  assert.equal(resumed.errorMs, 0);
});

test("a missed cell adds a subtle overlay without interrupting scheduled motion", () => {
  const simulation = new MeasureMatchSimulation({
    mode: "measure",
    character: "kitty",
    beatmap: DEFAULT_BEATMAP,
    timingWindows: TIMING_WINDOWS.standard,
  });
  simulation.begin(snapshotAt(0));
  simulation.update(1 / 120, snapshotAt(8.3), createInputStep());
  const snapshot = simulation.getSnapshot(snapshotAt(8.3));
  const scheduled = presentationAtBeat(8.3);
  assert.equal(snapshot.dancer.presentationClip, scheduled.clip);
  assert.equal(snapshot.dancer.presentationPhase, scheduled.phase);
  assert.equal(snapshot.dancer.missAccent, 1);
});

test("the 16-bar scheduler escalates groove to floor, power, freeze, and resolution", () => {
  assert.equal(presentationAtBeat(8).clip, "basicRock");
  assert.equal(presentationAtBeat(24).clip, "basicGoDown");
  assert.equal(presentationAtBeat(32).clip, "sixStep");
  assert.equal(presentationAtBeat(48).clip, "windmill");
  assert.equal(presentationAtBeat(60).clip, "babyFreeze");
  assert.equal(presentationAtBeat(62.5).clip, "cleanGetUp");
  assert.equal(presentationAtBeat(63.75).clip, "victory");
});

test("known response ticks land on authored choreography accent phases", () => {
  const expected = new Map([
    ["pocket-quarters", [0, 0.25, 0.5, 0.75]],
    ["backbeat-rock", [0, 0.25, 0.5, 0.75]],
    ["break-go-down", [0, 0.18, 0.43, 0.58, 0.78]],
    ["six-step-open", [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6]],
    ["six-step-sync", [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1]],
    ["windmill-scissor", [0, 0.25, 0.5, 0.75, 1]],
  ]);
  for (const pattern of DEFAULT_MEASURE_PATTERNS) {
    if (pattern.id === "power-to-freeze") continue;
    pattern.targetTicks.forEach((tick, index) => {
      const beat = (pattern.responseBar - 1) * 4 + tick / 4;
      assert.ok(
        Math.abs(presentationAtBeat(beat).phase - expected.get(pattern.id)[index]) < 1e-9,
        `${pattern.id} tick ${tick}`,
      );
    });
  }
  const freezePattern = DEFAULT_MEASURE_PATTERNS.at(-1);
  assert.equal(presentationAtBeat((freezePattern.responseBar - 1) * 4 + 12 / 4).clip, "babyFreeze");
  assert.equal(presentationAtBeat((freezePattern.responseBar - 1) * 4 + 14 / 4).phase, 0.2);
});

function snapshotAt(beat) {
  const beatIndex = Math.floor(beat);
  return Object.freeze({
    audioTime: beat * 0.6,
    playbackSeconds: beat * 0.6,
    beat,
    beatIndex,
    beatPhase: ((beat % 1) + 1) % 1,
    beatInBar: ((beatIndex % 4) + 4) % 4,
    barIndex: Math.floor(beat / 4),
    measure: Math.floor(beat / 4) + 1,
    phrase: Math.floor(beat / 16) + 1,
    section: "test",
    intensity: 0.75,
    bpm: 100,
    paused: false,
    running: true,
  });
}

function roundBeat(value) {
  return Math.round(value * 1000) / 1000;
}
