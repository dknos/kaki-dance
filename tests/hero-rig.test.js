import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  BIPED_ANCHOR_NAMES,
  kittyProfile,
  soderProfile,
} from "../js/animation/character-profiles.js";
import { validateBipedGeometry } from "../js/animation/kaki-rig.js";
import { mirrorPose } from "../js/animation/pose-timeline.js";
import { characterDefinition } from "../js/dance/character-catalog.js";
import { MOVE_CATALOG } from "../js/dance/move-catalog.js";
import { goldenChainIds } from "../js/dance/move-session.js";
import { buildMoveQaSnapshot } from "../js/render/qa-frame.js";

const root = resolve(import.meta.dirname, "..");
const limbs = ["leftArm", "rightArm", "leftLeg", "rightLeg"];

test("KittyKaki and Soder share the complete biped contract", () => {
  for (const [character, profile] of [
    ["kitty", kittyProfile],
    ["soder", soderProfile],
  ]) {
    const definition = characterDefinition(character);
    const snapshot = buildMoveQaSnapshot({
      character,
      moveId: "basicRock",
      phase: 0.24,
      debugAssertions: true,
    });
    const rig = snapshot.dancer.rig;
    assert.equal(definition.rig, "biped");
    assert.equal(definition.topology, "biped");
    assert.equal(profile.topology, "biped");
    assert.equal(rig.topology, "biped");
    assert.equal(rig.profileId, character);
    for (const anchor of BIPED_ANCHOR_NAMES) {
      assert.ok(rig.anchors[anchor], `${character} missing ${anchor}`);
      assert.ok(Number.isFinite(rig.anchors[anchor].x), `${character}/${anchor}.x`);
      assert.ok(Number.isFinite(rig.anchors[anchor].y), `${character}/${anchor}.y`);
    }
    for (const limb of limbs) assert.ok(rig.limbs[limb], `${character} missing ${limb}`);
    assert.equal(Object.hasOwn(rig, "coil" + "Segments"), false);
  }
});

test("Soder exposes genuine paired hips, knees, ankles, feet, wrists, and hands", () => {
  const rig = buildMoveQaSnapshot({
    character: "soder",
    moveId: "sixStep",
    phase: 0.5,
  }).dancer.rig;
  for (const joint of [
    "leftHip", "rightHip",
    "leftKnee", "rightKnee",
    "leftAnkle", "rightAnkle",
    "leftFoot", "rightFoot",
    "leftWrist", "rightWrist",
    "leftHand", "rightHand",
  ]) {
    assert.ok(rig.anchors[joint], joint);
  }
  assert.notDeepEqual(rig.anchors.leftHip, rig.anchors.rightHip);
  assert.notDeepEqual(rig.anchors.leftKnee, rig.anchors.rightKnee);
  assert.notDeepEqual(rig.anchors.leftFoot, rig.anchors.rightFoot);
});

test("no Soder-specific alternate solver or segmented lower-body render path remains", () => {
  const rigSource = readFileSync(resolve(root, "js/animation/kaki-rig.js"), "utf8");
  const dancerSource = readFileSync(resolve(root, "js/render/dancer.js"), "utf8");
  assert.equal(rigSource.includes("solve" + "SoderRig"), false);
  assert.equal(rigSource.includes("coil" + "Segments"), false);
  assert.equal(dancerSource.includes("coil" + "Segments"), false);
  assert.equal(dancerSource.includes("draw" + "SoderArm"), false);
});

test("all hero bones preserve fixed lengths and joint limits at 101 phases", () => {
  let worstLengthError = 0;
  for (const character of ["kitty", "soder"]) {
    for (const moveId of goldenChainIds()) {
      for (const mirror of [false, true]) {
        let previousRig = null;
        const previousSigns = new Map();
        for (let index = 0; index <= 100; index += 1) {
          const phase = index / 100;
          const snapshot = buildMoveQaSnapshot({
            character,
            moveId,
            phase,
            mirror,
            previousRig,
          });
          const rig = snapshot.dancer.rig;
          const solvedPose = mirror
            ? mirrorPose(snapshot.dancer.pose.pose)
            : snapshot.dancer.pose.pose;
          worstLengthError = Math.max(worstLengthError, rig.maxBoneLengthError);
          assert.deepEqual(validateBipedGeometry(rig), [], `${character}/${moveId}/${mirror}/${phase}`);
          for (const limb of limbs) {
            const solved = rig.limbs[limb];
            assert.ok(solved.interiorAngle >= solved.jointLimits[0] - 1e-8, `${limb} under limit`);
            assert.ok(solved.interiorAngle <= solved.jointLimits[1] + 1e-8, `${limb} over limit`);
            const oldSign = previousSigns.get(limb);
            if (oldSign && oldSign !== solved.bendSign) {
              const flipKey = `${limb}Flip`;
              assert.ok(solvedPose[flipKey] > 0, `${character}/${moveId}/${limb} un-authored flip`);
            }
            previousSigns.set(limb, solved.bendSign);
          }
          previousRig = rig;
        }
      }
    }
  }
  assert.ok(worstLengthError <= 1e-6, `worst length drift ${worstLengthError}`);
});

test("every move emits finite biped geometry for both profiles and mirrors", () => {
  for (const character of ["kitty", "soder"]) {
    for (const move of Object.values(MOVE_CATALOG)) {
      for (const mirror of [false, true]) {
        for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
          const snapshot = buildMoveQaSnapshot({
            character,
            moveId: move.id,
            phase,
            mirror,
          });
          const rig = snapshot.dancer.rig;
          assert.equal(rig.finite, true, `${character}/${move.id}/${mirror}/${phase}`);
          assert.equal(rig.warnings.length, 0, `${character}/${move.id}/${mirror}/${phase}`);
          assert.ok(snapshot.dancer.contacts.measured.largest <= 0.01);
        }
      }
    }
  }
});

test("golden-chain bridges are finite, deterministic, contact-safe, and mirrored", () => {
  const ids = goldenChainIds();
  for (const character of ["kitty", "soder"]) {
    for (const mirror of [false, true]) {
      for (let index = 1; index < ids.length; index += 1) {
        for (let sample = 0; sample <= 10; sample += 1) {
          const options = {
            character,
            moveId: ids[index],
            phase: sample / 100,
            mirror,
            transitionFrom: ids[index - 1],
            transitionProgress: sample / 10,
          };
          const first = buildMoveQaSnapshot(options);
          const second = buildMoveQaSnapshot(options);
          assert.deepEqual(second.dancer.rig, first.dancer.rig);
          assert.equal(first.dancer.rig.finite, true);
          assert.ok(first.dancer.contacts.measured.largest <= 0.01);
        }
      }
    }
  }
});

test("runtime canvases explicitly retain nearest-neighbor presentation", () => {
  const renderer = readFileSync(resolve(root, "js/render/renderer.js"), "utf8");
  const styles = readFileSync(resolve(root, "styles.css"), "utf8");
  const heroStyles = readFileSync(resolve(root, "hero-lab.css"), "utf8");
  assert.match(renderer, /imageSmoothingEnabled\s*=\s*false/);
  assert.match(styles, /image-rendering:\s*pixelated/);
  assert.match(heroStyles, /image-rendering:\s*pixelated/);
});
