import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  FOOTWORK_CATALOG,
  FROLIC_STYLE_IDS,
} from "../js/appalachian/footwork-catalog.js";
import { APPALACHIAN_TUNE_MAP } from "../js/appalachian/tune-map.js";
import {
  FrolicAtlasLibrary,
  validateFrolicAtlasMetadata,
} from "../js/render/frolic-atlas.js";

const ROOT = resolve(import.meta.dirname, "..");
const HEROES = ["kitty", "soder"];

test("all six lazy Frolic packs are indexed complete bipeds within one-page active memory", () => {
  for (const character of HEROES) {
    for (const style of FROLIC_STYLE_IDS) {
      const root = resolve(ROOT, `assets/heroes/${character}/frolic/${style}`);
      const metadata = JSON.parse(readFileSync(resolve(root, "atlas.json"), "utf8"));
      assert.deepEqual(validateFrolicAtlasMetadata(metadata, { character, style }), []);
      assert.equal(metadata.topology, "biped");
      assert.deepEqual(metadata.pages, ["atlas-0.png"]);
      const page = readFileSync(resolve(root, "atlas-0.png"));
      assert.equal(page.toString("hex", 0, 8), "89504e470d0a1a0a");
      assert.equal(page.readUInt32BE(16), 1024);
      assert.equal(page.readUInt32BE(20), 1024);
      assert.equal(page[25], 3, `${character}/${style} must be indexed color`);
      assert.equal(1024 * 1024 * 4, 4_194_304);
      for (const move of Object.values(FOOTWORK_CATALOG).filter((value) => value.styles.includes(style))) {
        assert.ok(metadata.clips[move.id], `${character}/${style}/${move.id}`);
      }
      for (const clip of Object.values(metadata.clips)) {
        for (const frame of clip.frames) {
          assert.ok(frame.semanticAnchors.leftHand);
          assert.ok(frame.semanticAnchors.rightHand);
          assert.ok(frame.semanticAnchors.leftFoot);
          assert.ok(frame.semanticAnchors.rightFoot);
          assert.equal(Object.keys(frame.segmentDepth).length, 12);
        }
      }
    }
  }
});

test("animation lint certifies fixed plants, bounded joints, and distinct crossing feet", () => {
  const report = JSON.parse(readFileSync(
    resolve(ROOT, "docs/images/appalachian/frolic-atlas-report.json"),
    "utf8",
  ));
  assert.equal(report.activePackPolicy, "one selected hero/style pack");
  for (const [key, pack] of Object.entries(report.packs)) {
    assert.equal(pack.pages, 1, key);
    assert.equal(pack.drawings, 164, key);
    assert.equal(pack.estimatedDecodedTextureBytes, 4_194_304, key);
    assert.equal(pack.lint.worstPlantedFootDisplacementPx, 0, key);
    assert.ok(pack.lint.worstJointFrameJumpPx < 12, key);
    assert.deepEqual(pack.lint.warnings, [], key);
  }
});

test("foot contacts agree with animation accents and every sample group is local", () => {
  const manifest = JSON.parse(readFileSync(
    resolve(ROOT, "assets/audio/frolic/feet/manifest.json"),
    "utf8",
  ));
  assert.equal(manifest.roundRobin, 3);
  for (const move of Object.values(FOOTWORK_CATALOG)) {
    for (const contact of move.contacts) {
      const phase = contact.tick / move.durationTicks;
      for (const character of HEROES) {
        for (const style of move.styles) {
          const atlas = JSON.parse(readFileSync(
            resolve(ROOT, `assets/heroes/${character}/frolic/${style}/atlas.json`),
            "utf8",
          ));
          const accents = atlas.clips[move.id].accentPhases;
          assert.ok(
            accents.some((accent) => Math.abs(accent - phase) <= 0.045),
            `${character}/${style}/${move.id} contact ${contact.tick}`,
          );
        }
      }
      assert.ok(manifest.groups[contact.sampleGroup], `${move.id}/${contact.sampleGroup}`);
    }
  }
  for (const [group, definition] of Object.entries(manifest.groups)) {
    assert.equal(definition.files.length, 3, group);
    for (const file of definition.files) {
      assert.doesNotMatch(file, /^https?:/);
      const wave = readFileSync(resolve(ROOT, "assets/audio/frolic/feet", file));
      assertWave(wave, { channels: 1, sampleRate: 22_050 });
    }
  }
});

test("Board & Bow master and responsive stems have exact original AABB dimensions", () => {
  const master = readFileSync(resolve(ROOT, "assets/audio/frolic/board-and-bow.wav"));
  const dimensions = assertWave(master, { channels: 2, sampleRate: 22_050 });
  assert.ok(Math.abs(dimensions.duration - 68) < 1 / 22_050);
  assert.equal(APPALACHIAN_TUNE_MAP.bpm, 120);
  assert.equal(APPALACHIAN_TUNE_MAP.form, "AABB");
  assert.equal(APPALACHIAN_TUNE_MAP.offsetSeconds, 4);
  for (const instrument of ["fiddle", "banjo", "guitar", "bass"]) {
    const stem = readFileSync(resolve(
      ROOT,
      `assets/audio/frolic/stems/board-and-bow-${instrument}.wav`,
    ));
    const stemDimensions = assertWave(stem, { channels: 1, sampleRate: 22_050 });
    assert.ok(Math.abs(stemDimensions.duration - 68) < 1 / 22_050);
  }
});

test("one shared Blender biped carries every profile, style, movement, and foot control", () => {
  const blend = readFileSync(resolve(ROOT, "tools/blender/kaki-appalachian-frolic.blend"));
  const exportValue = JSON.parse(readFileSync(
    resolve(ROOT, "tools/blender/exports/kaki-appalachian-frolic-rig.json"),
    "utf8",
  ));
  assert.ok(blend.length > 500_000 && blend.length < 2_000_000);
  assert.equal(exportValue.topology, "biped");
  assert.equal(exportValue.sharedArmature, "KakiFrolicSharedBiped");
  assert.deepEqual(exportValue.profiles, HEROES);
  assert.deepEqual(exportValue.styles, FROLIC_STYLE_IDS);
  for (const name of [
    "upperArm.L", "upperArm.R", "forearm.L", "forearm.R", "hand.L", "hand.R",
    "thigh.L", "thigh.R", "shin.L", "shin.R", "ankle.L", "ankle.R",
    "heel.L", "heel.R", "toe.L", "toe.R", "footIK.L", "footIK.R",
    "kneePole.L", "kneePole.R", "costume.hood", "costume.fabric",
  ]) {
    assert.ok(exportValue.bones.includes(name), name);
  }
  for (const style of FROLIC_STYLE_IDS) {
    assert.deepEqual(
      Object.keys(exportValue.actions[style]),
      Object.keys(JSON.parse(readFileSync(
        resolve(ROOT, `assets/heroes/kitty/frolic/${style}/atlas.json`),
        "utf8",
      )).clips),
    );
  }
});

test("lazy library releases inactive hero/style packs", async () => {
  const metadata = JSON.parse(readFileSync(
    resolve(ROOT, "assets/heroes/kitty/frolic/flatfoot/atlas.json"),
    "utf8",
  ));
  const imageFactory = () => ({
    naturalWidth: 1024,
    naturalHeight: 1024,
    set src(_value) {
      queueMicrotask(() => this.onload?.());
    },
  });
  const library = new FrolicAtlasLibrary({
    fetchImpl: async () => ({ ok: true, json: async () => metadata }),
    imageFactory,
  });
  await library.preload("kitty", "flatfoot");
  library.records.set("soder:buck", { status: "ready", promise: Promise.resolve() });
  assert.equal(library.activeKeys().length, 2);
  library.releaseExcept("kitty", "flatfoot");
  assert.deepEqual(library.activeKeys(), ["kitty:flatfoot"]);
});

test("Frolic runtime assets declare no remote dependency", () => {
  for (const path of [
    "js/appalachian/simulation.js",
    "js/appalachian/tune-map.js",
    "js/render/frolic-atlas.js",
    "js/audio/foot-percussion-player.js",
  ]) {
    const source = readFileSync(resolve(ROOT, path), "utf8");
    assert.doesNotMatch(source, /https?:\/\//, path);
  }
  assert.doesNotMatch(APPALACHIAN_TUNE_MAP.trackUrl, /^https?:/);
  for (const path of Object.values(APPALACHIAN_TUNE_MAP.stemManifest)) {
    assert.doesNotMatch(path, /^https?:/);
  }
});

test("approval media covers every hero/profile on stage, neutral, diagnostic, and loop views", () => {
  const report = JSON.parse(readFileSync(
    resolve(ROOT, "docs/images/appalachian/final/frolic-capture-report.json"),
    "utf8",
  ));
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failedRequests, []);
  assert.equal(report.approvals.length, 6);
  assert.equal(report.loops.length, 6);
  for (const approval of report.approvals) {
    assertPngSize(approval.native, 1_920, 432);
    assertPngSize(approval.enlarged, 7_680, 1_728);
    assertPngSize(approval.diagnostic, 1_920, 432);
    assertPngSize(approval.neutral, 1_920, 432);
    assertPngSize(approval.neutralEnlarged, 7_680, 1_728);
    assert.deepEqual(approval.activePacks, [`${approval.hero}:${approval.style}`]);
  }
  for (const loop of report.loops) {
    const gif = readFileSync(resolve(ROOT, loop.gif));
    assert.match(gif.toString("ascii", 0, 6), /^GIF8[79]a$/);
    assert.equal(gif.readUInt16LE(6), 384);
    assert.equal(gif.readUInt16LE(8), 216);
    const mp4 = readFileSync(resolve(ROOT, loop.mp4));
    assert.equal(mp4.toString("ascii", 4, 8), "ftyp");
    assert.equal(loop.frames, 96);
    assert.equal(loop.durationSeconds, 8);
  }
});

test("a real-time browser chorus reaches five-category results without errors", () => {
  const report = JSON.parse(readFileSync(
    resolve(ROOT, "docs/images/appalachian/final/frolic-full-chorus-report.json"),
    "utf8",
  ));
  assert.ok(report.realTimeSeconds >= 64 && report.realTimeSeconds < 72);
  assert.equal(report.deliveredInputs, report.plannedInputs);
  assert.equal(report.result.state, "results");
  assert.equal(report.result.mode, "frolic");
  assert.equal(report.result.layerVisible, true);
  assert.deepEqual(
    report.result.cells.map((cell) => cell.label),
    ["time", "tune", "flow", "footwork", "spirit"],
  );
  assert.ok(report.result.cells.every((cell) => Number.isFinite(cell.score)));
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failedRequests, []);
  assertPngSize(report.screenshot, 1_280, 800);
});

function assertWave(buffer, expected) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  assert.equal(channels, expected.channels);
  assert.equal(sampleRate, expected.sampleRate);
  assert.equal(bitsPerSample, 16);
  const dataBytes = buffer.readUInt32LE(40);
  return {
    channels,
    sampleRate,
    duration: dataBytes / (channels * bitsPerSample / 8) / sampleRate,
  };
}

function assertPngSize(path, width, height) {
  const png = readFileSync(resolve(ROOT, path));
  assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a", path);
  assert.equal(png.readUInt32BE(16), width, path);
  assert.equal(png.readUInt32BE(20), height, path);
}
