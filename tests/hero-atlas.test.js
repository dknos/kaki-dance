import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  resolveAtlasClip,
  selectAtlasFrame,
  validateAtlasMetadata,
} from "../js/render/hero-atlas.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function atlas(character) {
  return JSON.parse(await readFile(resolve(ROOT, `assets/heroes/${character}/atlas.json`), "utf8"));
}

test("production hero atlases are indexed, bounded, and metadata-valid", async () => {
  for (const character of ["kitty", "soder"]) {
    const metadata = await atlas(character);
    assert.deepEqual(validateAtlasMetadata(metadata), []);
    assert.equal(metadata.topology, "biped");
    assert.deepEqual(metadata.clips.basicGoDown.accentPhases, [0, 0.18, 0.43, 0.58, 0.78]);
    assert.deepEqual(
      metadata.clips.sixStep.accentPhases,
      [0, 1 / 6, 2 / 6, 0.5, 2 / 3, 5 / 6, 1],
    );
    assert.deepEqual(metadata.clips.windmill.accentPhases, [0, 0.25, 0.5, 0.75, 1]);
    assert.ok(metadata.pages.length >= 1 && metadata.pages.length <= 2);
    for (const page of metadata.pages) {
      const png = await readFile(resolve(ROOT, `assets/heroes/${character}/${page}`));
      assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
      assert.equal(png.readUInt32BE(16), 1024);
      assert.equal(png.readUInt32BE(20), 1024);
      assert.equal(png[25], 3, `${character}/${page} must be indexed-color PNG`);
    }
  }
});

test("every atlas frame has stable pivots, semantic anchors, contacts, and segment depth", async () => {
  for (const character of ["kitty", "soder"]) {
    const metadata = await atlas(character);
    for (const [clipId, clip] of Object.entries(metadata.clips)) {
      assert.ok(clip.durationBeats > 0);
      assert.ok(clip.frameCount >= 15);
      assert.equal(clip.frames.length, clip.frameCount);
      for (const [index, frame] of clip.frames.entries()) {
        assert.ok(Number.isFinite(frame.pivot[0]) && Number.isFinite(frame.pivot[1]));
        assert.ok(frame.pivot[0] > -8 && frame.pivot[0] < frame.w + 8);
        assert.ok(frame.pivot[1] > -8 && frame.pivot[1] < frame.h + 8);
        assert.equal(Object.keys(frame.semanticAnchors).length, 21, `${clipId}[${index}] anchors`);
        assert.equal(Object.keys(frame.segmentDepth).length, 12, `${clipId}[${index}] depth`);
        for (const anchor of Object.values(frame.semanticAnchors)) {
          assert.ok(anchor.every(Number.isFinite));
        }
        for (const [contact, anchor] of Object.entries(frame.contacts)) {
          assert.deepEqual(anchor, frame.semanticAnchors[contact]);
        }
      }
    }
    assert.ok(metadata.clips.basicGoDown.frames.some((frame) => frame.contacts.leftHand));
    assert.ok(metadata.clips.babyFreeze.frames.some((frame) => (
      frame.contacts.leftHand && frame.contacts.rightHand
    )));
  }
});

test("atlas playback selection is deterministic and does not restart for rhythm taps", async () => {
  const metadata = await atlas("kitty");
  const dancer = { presentationClip: "sixStep", presentationPhase: 0.625, moveId: "sixStep" };
  const first = selectAtlasFrame(metadata, dancer);
  const second = selectAtlasFrame(metadata, { ...dancer, accentQuality: 1, lastHit: { errorMs: 0 } });
  assert.equal(first.clipId, "sixStep");
  assert.equal(first.frameIndex, second.frameIndex);
  assert.deepEqual(first.frame, second.frame);
  assert.equal(resolveAtlasClip({ family: "power", moveId: "flare" }), "windmill");
  assert.equal(resolveAtlasClip({ family: "recovery" }), "missRecovery");
});

test("public renderer never calls the rejected procedural tapered-limb renderer", async () => {
  const renderer = await readFile(resolve(ROOT, "js/render/renderer.js"), "utf8");
  assert.doesNotMatch(renderer, /from\s+["']\.\/dancer\.js["']/);
  assert.doesNotMatch(renderer, /\bdrawDancer\s*\(/);
  assert.doesNotMatch(renderer, /\bdrawTaperedVolume\s*\(/);
  assert.match(renderer, /AtlasHeroRenderer/);
});

test("offline production source uses one Blender armature and twelve independent segment depths", async () => {
  const blend = await readFile(resolve(ROOT, "tools/blender/kaki-measure-match-production.blend"));
  const exportValue = JSON.parse(await readFile(
    resolve(ROOT, "tools/blender/exports/kaki-measure-match-camera-depth.json"),
    "utf8",
  ));
  assert.ok(blend.length > 500_000);
  assert.equal(exportValue.topology, "biped");
  assert.equal(exportValue.sharedArmature, "KakiDanceProductionBiped");
  assert.deepEqual(exportValue.profiles, ["kitty", "soder"]);
  assert.equal(exportValue.fps, 12);
  for (const [clipId, clip] of Object.entries(exportValue.clips)) {
    assert.ok(clip.frames.length >= 15, clipId);
    for (const frame of clip.frames) {
      assert.equal(Object.keys(frame.segmentDepth).length, 12);
      assert.equal(Object.keys(frame.anchors).length, 21);
    }
  }
});
