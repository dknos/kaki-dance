import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BEATMAP } from "../js/audio/beatmap.js";
import { TIMING_WINDOWS } from "../js/config.js";
import { characterDefinition } from "../js/dance/character-catalog.js";
import { MOVE_CATALOG } from "../js/dance/move-catalog.js";
import { MoveSession } from "../js/dance/move-session.js";
import { RoundScorer, SCORE_CATEGORIES, timingJudgment } from "../js/dance/scoring.js";
import { spendStamina, updateStamina } from "../js/dance/stamina.js";

test("timing bands and accent detection use milliseconds at the current BPM", () => {
  assert.equal(timingJudgment(8, 100, TIMING_WINDOWS.standard, DEFAULT_BEATMAP).label, "perfect");
  assert.equal(timingJudgment(8.12, 100, TIMING_WINDOWS.standard, DEFAULT_BEATMAP).label, "clean");
  assert.equal(timingJudgment(8.22, 100, TIMING_WINDOWS.standard, DEFAULT_BEATMAP).label, "accepted");
  assert.equal(timingJudgment(8.32, 100, TIMING_WINDOWS.standard, DEFAULT_BEATMAP).label, "late");
  assert.equal(timingJudgment(8.02, 100, TIMING_WINDOWS.standard, DEFAULT_BEATMAP).accentHit, true);
  assert.ok(timingJudgment(8.9, 100, TIMING_WINDOWS.standard).deltaSeconds < 0);
});

test("repeat decay makes power spam inferior to deliberate vocabulary", () => {
  const spam = new RoundScorer();
  const decays = [];
  for (let index = 0; index < 5; index += 1) {
    decays.push(spam.recordMove(MOVE_CATALOG.windmill, {
      timing: perfect(),
      direction: 1,
      transitionFrom: "footwork",
      contactError: 0,
    }).decay);
  }
  assert.equal(decays[0], 1);
  assert.ok(decays[4] <= 0.2);

  const varied = new RoundScorer();
  for (const move of [
    MOVE_CATALOG.basicRock,
    MOVE_CATALOG.basicGoDown,
    MOVE_CATALOG.sixStep,
    MOVE_CATALOG.windmill,
    MOVE_CATALOG.babyFreeze,
  ]) {
    varied.recordMove(move, {
      timing: perfect(),
      direction: varied.history.length % 2 ? -1 : 1,
      transitionFrom: varied.history.at(-1)?.family ?? "idle",
      contactError: 0,
      balanceQuality: 1,
    });
  }
  assert.ok(varied.getBreakdown().originality > spam.getBreakdown().originality);
  assert.equal(varied.getBreakdown().families, 5);
});

test("all five categories are finite and explainable after a round", () => {
  const scorer = new RoundScorer({ targetPerCategory: 180 });
  scorer.recordMove(MOVE_CATALOG.babyFreeze, {
    timing: perfect(),
    transitionFrom: "power",
    contactError: 0.004,
    balanceQuality: 0.95,
  });
  const result = scorer.getBreakdown();
  for (const category of SCORE_CATEGORIES) {
    assert.ok(Number.isFinite(result[category]));
    assert.ok(result[category] >= 0 && result[category] <= 100);
  }
  assert.equal(result.cleanFreezes, 1);
  assert.ok(result.reasons.some((reason) => reason.includes("controlled freeze")));
});

test("stamina drains for power, recovers in pocket, and never blocks input globally", () => {
  assert.equal(spendStamina(10, MOVE_CATALOG.windmill), 0);
  const drained = updateStamina(80, MOVE_CATALOG.windmill, 1, { intensity: 1 });
  assert.ok(drained < 72);
  const fastDrained = updateStamina(80, MOVE_CATALOG.windmill, 1, { intensity: 1, bpm: 120 });
  assert.ok(fastDrained < drained);
  const recovered = updateStamina(40, MOVE_CATALOG.basicRock, 1, { deliberateRest: true });
  assert.ok(recovered > 40);
});

test("players control power-loop and freeze extensions through the shared session rules", () => {
  const power = floorSession();
  assert.equal(power.requestMove("windmill", { beat: 0, timing: perfect() }).eligible, true);
  const powerEnd = power.current.endBeat;
  const stamina = power.stamina;
  assert.equal(power.extendCurrent("power", { beat: 1, accented: true }), true);
  assert.equal(power.current.endBeat, powerEnd + MOVE_CATALOG.windmill.loopLength);
  assert.ok(power.stamina < stamina);

  const freeze = floorSession();
  assert.equal(freeze.requestMove("babyFreeze", { beat: 0, timing: perfect() }).eligible, true);
  const freezeEnd = freeze.current.endBeat;
  assert.equal(freeze.extendCurrent("freeze", { beat: 1, accented: true }), true);
  assert.equal(freeze.current.endBeat, freezeEnd + MOVE_CATALOG.babyFreeze.loopLength);
});

function floorSession() {
  const session = new MoveSession({
    character: characterDefinition("kitty"),
    scorer: new RoundScorer(),
    beatmap: DEFAULT_BEATMAP,
    timingWindows: TIMING_WINDOWS.standard,
  });
  session.tags = new Set(["floor", "twoHandsAvailable", "powerReady", "freezeReady"]);
  session.precedingFamily = "footwork";
  return session;
}

function perfect() {
  return { label: "perfect", factor: 1, accentHit: true, accentStrength: 1, accentLabel: "downbeat" };
}
