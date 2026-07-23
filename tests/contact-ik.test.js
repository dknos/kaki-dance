import assert from "node:assert/strict";
import test from "node:test";

import { solveTwoBone } from "../js/animation/ik.js";
import { createBalanceState, projectedBalancePosition, updateFreezeBalance } from "../js/dance/balance.js";
import { ContactSolver, supportRegion } from "../js/dance/contact-solver.js";
import { MOVE_CATALOG } from "../js/dance/move-catalog.js";
import { buildMoveQaSnapshot } from "../js/render/qa-frame.js";

test("two-bone IK respects authored bounds and reports unreachable targets", () => {
  const exact = solveTwoBone({ x: 0, y: 0 }, { x: 6, y: 8 }, 6, 6);
  assert.ok(exact.error < 1e-8);
  assert.equal(exact.clamped, false);
  const clamped = solveTwoBone({ x: 0, y: 0 }, { x: 40, y: 0 }, 5, 5);
  assert.ok(clamped.end.x < 10.001);
  assert.ok(clamped.error > 29.9);
  assert.equal(clamped.clamped, true);
});

test("every declared KittyKaki and Soder contact stays planted across the full timeline", () => {
  let worst = { error: 0, move: "", character: "", phase: 0 };
  for (const character of ["kitty", "soder"]) {
    for (const move of Object.values(MOVE_CATALOG)) {
      for (let index = 0; index <= 100; index += 1) {
        const phase = index / 100;
        const snapshot = buildMoveQaSnapshot({ character, moveId: move.id, phase });
        const error = snapshot.dancer.contacts.measured.largest;
        if (error > worst.error) worst = { error, move: move.id, character, phase };
      }
    }
  }
  assert.ok(
    worst.error <= 0.01,
    `${worst.character}/${worst.move}@${worst.phase} contact error ${worst.error.toFixed(4)} px`,
  );
});

test("mirrored contact truth swaps limbs and floor anchors exactly", () => {
  const solver = new ContactSolver();
  const normal = solver.resolve(MOVE_CATALOG.sixStep, 0.1);
  solver.reset();
  const mirrored = solver.resolve(MOVE_CATALOG.sixStep, 0.1, { mirror: true });
  const leftPaw = normal.contacts.find((entry) => entry.limb === "leftPaw");
  const rightPaw = mirrored.contacts.find((entry) => entry.limb === "rightPaw");
  assert.ok(leftPaw && rightPaw);
  assert.equal(rightPaw.anchor.x, -leftPaw.anchor.x);
  assert.equal(rightPaw.anchor.y, leftPaw.anchor.y);
});

test("support regions and freeze balance expose stable and failing states", () => {
  const support = supportRegion([
    { anchor: { x: -10, y: 0 } },
    { anchor: { x: 8, y: 0 } },
  ]);
  assert.deepEqual(support, { min: -10, max: 8, center: -1, width: 18, count: 2 });
  const stable = createBalanceState();
  for (let index = 0; index < 120; index += 1) {
    updateFreezeBalance(stable, {
      dt: 1 / 120,
      beatDelta: 1 / 72,
      inputX: Math.sign(stable.offset),
      difficulty: 0.38,
      demand: 0.3,
      staminaRatio: 0.8,
      phase: index / 120,
      supportWidth: support.width,
    });
  }
  assert.equal(stable.failed, false);
  assert.ok(stable.stableBeats > 0);
  assert.ok(Number.isFinite(projectedBalancePosition(support, stable)));

  const failing = createBalanceState();
  failing.offset = 3;
  updateFreezeBalance(failing, { dt: 1 / 120, difficulty: 1, demand: 1, supportWidth: 2 });
  assert.equal(failing.failed, true);
  assert.ok(failing.wobble >= 1);
});

test("deterministic phase capture returns byte-for-byte equivalent rig data", () => {
  const first = buildMoveQaSnapshot({ character: "soder", moveId: "windmill", phase: 0.48, mirror: true });
  const second = buildMoveQaSnapshot({ character: "soder", moveId: "windmill", phase: 0.48, mirror: true });
  assert.deepEqual(second.dancer.rig, first.dancer.rig);
  assert.equal(first.dancer.rig.topology, "soder");
});
