import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BEATMAP } from "../js/audio/beatmap.js";
import { TIMING_WINDOWS } from "../js/config.js";
import { MOVE_CATALOG } from "../js/dance/move-catalog.js";
import { DanceSimulation } from "../js/dance/simulation.js";
import { createInputStep } from "../js/input.js";
import { syntheticBeat } from "../js/render/qa-frame.js";

test("replay and gameplay state are deterministic from seed, clock, and inputs", () => {
  const first = runPractice(0x12345678);
  const second = runPractice(0x12345678);
  assert.deepEqual(second.replay, first.replay);
  assert.deepEqual(second.playerScorer.getBreakdown(), first.playerScorer.getBreakdown());
  assert.deepEqual(second.playerSession.getSnapshot(), first.playerSession.getSnapshot());
  assert.equal(first.getHighlightSnapshot()?.performer, "player");
  assert.ok(first.getHighlightSnapshot()?.dancer?.moveId);
});

test("AI obeys the public catalog, stamina, contacts, and scoring path", () => {
  const simulation = new DanceSimulation({
    mode: "battle",
    character: "kitty",
    beatmap: DEFAULT_BEATMAP,
    timingWindows: TIMING_WINDOWS.standard,
    seed: 919,
  });
  simulation.begin(syntheticBeat(0));
  const input = createInputStep();
  for (let index = 0; index < 5_100; index += 1) {
    const beat = index / 120 * DEFAULT_BEATMAP.bpm / 60;
    simulation.update(1 / 120, syntheticBeat(beat), input);
  }
  assert.ok(simulation.opponentScorer.history.length > 0);
  assert.ok(simulation.opponentScorer.history.every((entry) => Object.hasOwn(MOVE_CATALOG, entry.moveId)));
  assert.ok(simulation.opponentSession.stamina >= 0 && simulation.opponentSession.stamina <= 100);
  assert.ok(simulation.opponentSession.getSnapshot().contacts.error <= 0.01);
});

test("battle adds a fair two-turn tiebreak only when the two normal rounds tie", () => {
  const simulation = new DanceSimulation({
    mode: "battle",
    beatmap: DEFAULT_BEATMAP,
    timingWindows: TIMING_WINDOWS.standard,
  });
  simulation.begin(syntheticBeat(0));
  for (const beat of [32, 64, 96, 128]) simulation.advanceMode(syntheticBeat(beat));
  assert.equal(simulation.complete, false);
  assert.equal(simulation.battlePhaseIndex, 4);
  for (const beat of [160, 192]) simulation.advanceMode(syntheticBeat(beat));
  assert.equal(simulation.complete, true);
  assert.equal(simulation.result.winner, "tie");
  assert.equal(simulation.playerRounds.length, 3);
  assert.equal(simulation.opponentRounds.length, 3);
});

function runPractice(seed) {
  const simulation = new DanceSimulation({
    mode: "practice",
    beatmap: DEFAULT_BEATMAP,
    timingWindows: TIMING_WINDOWS.standard,
    seed,
  });
  simulation.begin(syntheticBeat(0));
  for (let index = 0; index < 720; index += 1) {
    const input = createInputStep();
    if ([0, 154, 235].includes(index)) input.actionPressed = true;
    if (index === 154) input.y = 1;
    if (index === 540) input.powerPressed = true;
    const beat = index / 120 * DEFAULT_BEATMAP.bpm / 60;
    simulation.update(1 / 120, syntheticBeat(beat), input);
  }
  return simulation;
}
