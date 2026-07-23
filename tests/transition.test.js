import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BEATMAP } from "../js/audio/beatmap.js";
import { TIMING_WINDOWS } from "../js/config.js";
import { characterDefinition } from "../js/dance/character-catalog.js";
import { MOVE_CATALOG, movesByFamily } from "../js/dance/move-catalog.js";
import { goldenChainIds, MoveSession } from "../js/dance/move-session.js";
import { RoundScorer } from "../js/dance/scoring.js";
import { moveEligibility, validateTransitionGraph } from "../js/dance/transition-graph.js";
import { syntheticBeat } from "../js/render/qa-frame.js";

test("catalog is complete, renderer-independent, and graph-valid", () => {
  assert.equal(Object.keys(MOVE_CATALOG).length, 25);
  assert.equal(movesByFamily("toprock").length, 5);
  assert.equal(movesByFamily("transition").length, 4);
  assert.equal(movesByFamily("recovery").length, 1);
  assert.equal(movesByFamily("footwork").length, 6);
  assert.equal(movesByFamily("power").length, 5);
  assert.equal(movesByFamily("freeze").length, 4);
  assert.deepEqual(validateTransitionGraph(MOVE_CATALOG), []);
  for (const move of Object.values(MOVE_CATALOG)) {
    assert.ok(move.animationClip);
    assert.ok(move.entryTags.length);
    assert.ok(move.exitTags.length);
    assert.ok(Array.isArray(move.contacts));
    assert.ok(Object.isFrozen(move));
  }
});

test("golden chain composes without pose-incompatible teleports", () => {
  const session = makeSession();
  let beat = 0;
  for (const id of goldenChainIds()) {
    const result = session.requestMove(id, { beat, timing: perfect() });
    assert.equal(result.eligible, true, `${id}: ${result.reason}`);
    assert.equal(session.current.move.id, id);
    beat = session.current.endBeat;
    session.finishMove(beat);
  }
  assert.deepEqual([...session.tags], ["standing", "goDownReady"]);
  assert.equal(session.precedingFamily, "recovery");
});

test("early compatible transition requests buffer into the next legal window", () => {
  const session = makeSession();
  session.tags = new Set(["floor", "twoHandsAvailable", "powerReady", "freezeReady"]);
  session.precedingFamily = "footwork";
  assert.equal(session.requestMove("sixStep", { beat: 0, timing: perfect() }).eligible, true);
  const buffered = session.requestMove("windmill", { beat: 2.96, timing: perfect() });
  assert.equal(buffered.buffered, true);
  assert.equal(session.getSnapshot().queuedMove, "windmill");
  session.update(syntheticBeat(3.14), 1 / 120);
  assert.equal(session.current.move.id, "windmill");
  assert.equal(session.queued, null);
});

test("invalid transitions explain the actual missing condition", () => {
  const windmillStanding = moveEligibility(MOVE_CATALOG.windmill, {
    tags: ["standing"],
    precedingFamily: "idle",
    stamina: 100,
  });
  assert.equal(windmillStanding.eligible, false);
  assert.equal(windmillStanding.reason, "NEED FLOOR");
  const tired = moveEligibility(MOVE_CATALOG.headspin, {
    tags: ["floor", "powerReady"],
    precedingFamily: "footwork",
    stamina: 2,
  });
  assert.equal(tired.reason, "LOW STAMINA");
});

test("move entries blend from the previous drawing while new contacts stay exact", () => {
  const session = makeSession();
  session.update(syntheticBeat(0), 1 / 120);
  session.requestMove("basicRock", { beat: 0, timing: perfect() });
  session.update(syntheticBeat(1.5), 1 / 120);
  const previousPose = session.poseSnapshot.pose;
  assert.equal(session.requestMove("basicGoDown", { beat: 1.5, timing: perfect() }).eligible, true);
  session.update(syntheticBeat(1.5), 1 / 120);
  assert.deepEqual(session.poseSnapshot.pose, previousPose);
  session.update(syntheticBeat(1.61), 1 / 120);
  assert.match(session.poseSnapshot.label, /blend$/);
  assert.ok(session.contactSolver.contactError <= 0.01);
  session.update(syntheticBeat(1.73), 1 / 120);
  assert.doesNotMatch(session.poseSnapshot.label, /blend$/);
});

function makeSession() {
  return new MoveSession({
    character: characterDefinition("kitty"),
    scorer: new RoundScorer(),
    beatmap: DEFAULT_BEATMAP,
    timingWindows: TIMING_WINDOWS.standard,
  });
}

function perfect() {
  return { label: "perfect", factor: 1, accentHit: true, accentStrength: 1, accentLabel: "downbeat" };
}
