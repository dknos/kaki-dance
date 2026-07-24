import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { validateBeatmap } from "../js/audio/beatmap.js";
import {
  createDefaultSave,
  loadSave,
  migrateSave,
  saveGame,
  SAVE_KEY,
  SAVE_VERSION,
} from "../js/storage.js";

const root = resolve(import.meta.dirname, "..");

test("save migration repairs old, corrupt, and out-of-range values", () => {
  const migrated = migrateSave({
    version: 0,
    selectedCharacter: "soder",
    selectedFrolicStyle: "clog",
    settings: {
      latencyMs: 999,
      audioLatencyMs: -999,
      visualLatencyMs: Number.POSITIVE_INFINITY,
      screenShake: -4,
      musicVolume: 2,
      bindings: { action: "KeyZ" },
    },
    calibration: { samples: [1, Number.NaN, 2] },
  });
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.selectedCharacter, "soder");
  assert.equal(migrated.selectedFrolicStyle, "clog");
  assert.equal(migrated.settings.latencyMs, 200);
  assert.equal(migrated.settings.audioLatencyMs, -200);
  assert.equal(migrated.settings.visualLatencyMs, 0);
  assert.equal(migrated.settings.screenShake, 0);
  assert.equal(migrated.settings.musicVolume, 1);
  assert.equal(migrated.settings.bindings.action, "KeyZ");
  assert.deepEqual(migrated.calibration.samples, [1, 2]);
  assert.equal(migrated.records.frolicBest, 0);
  assert.equal(migrated.records.stepShedComplete, false);
  assert.equal(migrateSave(null).selectedCharacter, "kitty");
});

test("storage round-trip is recoverable and falls back safely", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const save = createDefaultSave();
  save.records.battleWins = 3;
  assert.equal(saveGame(save, storage), true);
  assert.equal(JSON.parse(values.get(SAVE_KEY)).records.battleWins, 3);
  assert.equal(loadSave(storage).records.battleWins, 3);
  values.set(SAVE_KEY, "{broken");
  assert.equal(loadSave(storage).records.battleWins, 0);
});

test("local beatmap and WAV have the authored deterministic dimensions", () => {
  const beatmap = JSON.parse(readFileSync(resolve(root, "assets/audio/moon-block-party.beatmap.json"), "utf8"));
  assert.deepEqual(validateBeatmap(beatmap), []);
  assert.equal(beatmap.bpm, 100);
  assert.equal(beatmap.loopBars, 16);

  const wave = readFileSync(resolve(root, "assets/audio/moon-block-party.wav"));
  assert.equal(wave.toString("ascii", 0, 4), "RIFF");
  assert.equal(wave.toString("ascii", 8, 12), "WAVE");
  assert.equal(wave.readUInt16LE(22), 1);
  assert.equal(wave.readUInt32LE(24), 44_100);
  const duration = wave.readUInt32LE(40) / 2 / wave.readUInt32LE(24);
  assert.ok(Math.abs(duration - 38.4) < 1 / 44_100);
  assert.equal(sha256(wave), "6760298078ccc5fe8002c9f9f084ed1a32d55b6bb1d77f7f82b2e2a9983732e9");
});

test("user-supplied portraits and authored crowd reference retain validated dimensions", () => {
  const kitty = readFileSync(resolve(root, "assets/portraits/kittykaki.webp"));
  const soder = readFileSync(resolve(root, "assets/portraits/soder.png"));
  const crowd = readFileSync(resolve(root, "docs/art-source/kemonokaki-crowd-reference.png"));
  assert.deepEqual(webpDimensions(kitty), { width: 1164, height: 1164 });
  assert.deepEqual(pngDimensions(soder), { width: 409, height: 424 });
  assert.deepEqual(pngDimensions(crowd), { width: 1448, height: 1086 });
  assert.equal(sha256(kitty), "718dfbaeb7074154750bddf0dfad7473bf6ef42491761d1f771082687c4cca66");
  assert.equal(sha256(soder), "ce8f5d387825aa3c1d5b0c1f9b55f0a7f3d63c084d7bda75f388d9b3c3d7eae6");
});

test("offline Blender source uses one shared biped for both golden-chain profiles", () => {
  const proxy = readFileSync(resolve(root, "tools/blender/kaki-hero-biped.blend"));
  const poseBuffer = readFileSync(resolve(root, "tools/blender/exports/kaki-hero-golden-chain.json"));
  const poses = JSON.parse(poseBuffer.toString("utf8"));
  assert.ok(proxy.length > 100_000);
  assert.ok(proxy.length < 500_000);
  assert.ok(poseBuffer.length < 500_000);
  assert.equal(poses.schemaVersion, 2);
  assert.equal(poses.fps, 24);
  assert.equal(poses.topology, "biped");
  assert.deepEqual(poses.profiles, ["kitty", "soder"]);
  assert.ok(poses.anchors.includes("elbow.L"));
  assert.ok(poses.anchors.includes("elbow.R"));
  assert.ok(poses.anchors.includes("knee.L"));
  assert.ok(poses.anchors.includes("knee.R"));
  assert.deepEqual(Object.keys(poses.clips), [
    "basicRock",
    "basicGoDown",
    "sixStep",
    "windmill",
    "babyFreeze",
    "cleanGetUp",
  ]);
  for (const [id, clip] of Object.entries(poses.clips)) {
    assert.equal(clip.frames.length, 5, id);
    assert.deepEqual(clip.frames.map((frame) => frame.phase), [0, 0.25, 0.5, 0.75, 1]);
    for (const profile of poses.profiles) {
      for (const suffix of ["", "-silhouette"]) {
        assert.deepEqual(
          pngDimensions(readFileSync(resolve(
            root,
            `tools/blender/reference/hero-rescue/${profile}-${id}${suffix}.png`,
          ))),
          { width: 384, height: 216 },
        );
      }
    }
  }
});

test("hero rescue approval media stays native-sized and within its compression budget", () => {
  const after = resolve(root, "docs/images/hero-rescue/after");
  for (const character of ["kitty", "soder"]) {
    for (let index = 1; index <= 6; index += 1) {
      assert.deepEqual(
        pngDimensions(readFileSync(resolve(after, `${character}-${index}.png`))),
        { width: 384, height: 216 },
      );
    }
    const gif = readFileSync(resolve(after, `${character}-golden-chain.gif`));
    const mp4 = readFileSync(resolve(after, `${character}-golden-chain.mp4`));
    assert.deepEqual(gifDimensions(gif), { width: 384, height: 216 });
    assert.ok(gif.length < 350_000);
    assert.equal(mp4.toString("ascii", 4, 8), "ftyp");
    assert.ok(mp4.length < 200_000);
  }
  for (const move of [
    "basicRock",
    "basicGoDown",
    "sixStep",
    "windmill",
    "babyFreeze",
    "cleanGetUp",
  ]) {
    assert.deepEqual(
      pngDimensions(readFileSync(resolve(after, `silhouette-${move}.png`))),
      { width: 384, height: 216 },
    );
  }
});

function pngDimensions(buffer) {
  assert.equal(buffer.toString("hex", 0, 8), "89504e470d0a1a0a");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function webpDimensions(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  assert.equal(buffer.toString("ascii", 12, 16), "VP8X");
  return {
    width: buffer.readUIntLE(24, 3) + 1,
    height: buffer.readUIntLE(27, 3) + 1,
  };
}

function gifDimensions(buffer) {
  assert.match(buffer.toString("ascii", 0, 6), /^GIF8[79]a$/);
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
