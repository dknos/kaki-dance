import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  FOOTWORK_CATALOG,
} from "../js/appalachian/footwork-catalog.js";
import { APPALACHIAN_TUNE_MAP } from "../js/appalachian/tune-map.js";
import {
  FrolicAtlasLibrary,
  validateFrolicAtlasMetadata,
} from "../js/render/frolic-atlas.js";

const ROOT = resolve(import.meta.dirname, "..");
const HEROES = ["kitty", "soder"];

test("both Flatfoot candidate packs are Blender-sourced complete bipeds with bounded two-page memory", () => {
  const pilotClips = [
    "groove", "walkingStep", "shuffle", "heelToeChange",
    "backstep", "chug", "recovery", "turnaround",
  ];
  for (const character of HEROES) {
    for (const style of ["flatfoot"]) {
      const root = resolve(ROOT, `assets/heroes/${character}/frolic/flatfoot`);
      const metadata = JSON.parse(readFileSync(resolve(root, "atlas.json"), "utf8"));
      assert.deepEqual(validateFrolicAtlasMetadata(metadata, { character, style }), []);
      assert.equal(metadata.topology, "biped");
      assert.equal(metadata.candidateStatus, "human-review-required");
      assert.equal(metadata.productionSource.sourceFPS, 30);
      assert.match(metadata.productionSource.blenderScene, /\.blend$/);
      assert.deepEqual(metadata.pages, ["atlas-0.png", "atlas-1.png"]);
      for (const filename of metadata.pages) {
        const page = readFileSync(resolve(root, filename));
        assert.equal(page.toString("hex", 0, 8), "89504e470d0a1a0a");
        assert.equal(page.readUInt32BE(16), 1024);
        assert.equal(page.readUInt32BE(20), 1024);
        assert.equal(page[25], 3, `${character}/${style}/${filename} must be indexed color`);
      }
      assert.equal(metadata.pages.length * 1024 * 1024 * 4, 8_388_608);
      assert.deepEqual(Object.keys(metadata.clips).sort(), pilotClips.sort());
      for (const clip of Object.values(metadata.clips)) {
        assert.equal(clip.fps, 30);
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

test("candidate motion QA bounds plants and joints without claiming aesthetic approval", () => {
  const report = JSON.parse(readFileSync(
    resolve(ROOT, "docs/review/frolic-rescue-candidate-1/reports/motion-report.json"),
    "utf8",
  ));
  assert.equal(report.candidateStatus, "human-review-required");
  assert.equal(report.sourceFPS, 30);
  assert.equal(report.renderedFrameCount, 362);
  assert.equal(report.checks.automatedApproval.pass, false);
  for (const [key, hero] of Object.entries(report.heroReports)) {
    assert.ok(hero.plantedFootMaxDriftLogicalPixels <= 2, key);
    assert.ok(hero.maximumConsecutiveSegmentLengthChangeSourcePixels < 18, key);
    assert.ok(hero.minimumFootSeparationLogicalPixels >= 6, key);
    assert.ok(hero.handAttachmentDistanceLogicalPixels.maximum <= 8, key);
  }
});

test("foot contacts agree with animation accents and every sample group is local", () => {
  const manifest = JSON.parse(readFileSync(
    resolve(ROOT, "assets/audio/frolic/feet/manifest.json"),
    "utf8",
  ));
  assert.equal(manifest.roundRobin, 6);
  assert.equal(manifest.sampleRate, 48_000);
  assert.equal(manifest.provenance.noSynthesis, true);
  for (const character of HEROES) {
    const atlas = JSON.parse(readFileSync(
      resolve(ROOT, `assets/heroes/${character}/frolic/flatfoot/atlas.json`),
      "utf8",
    ));
    for (const [clipId, clip] of Object.entries(atlas.clips)) {
      for (const contact of clip.contacts) {
        const frame = clip.frames.find((value) => value.sourceFrame === contact.frame);
        assert.ok(frame, `${character}/${clipId} contact frame ${contact.frame}`);
        assert.ok(
          frame.markers.includes(contact.contact.toUpperCase().replaceAll("-", "_")),
          `${character}/${clipId}/${contact.contact}`,
        );
      }
    }
  }
  for (const move of Object.values(FOOTWORK_CATALOG)) {
    for (const contact of move.contacts) {
      assert.ok(manifest.groups[contact.sampleGroup], `${move.id}/${contact.sampleGroup}`);
    }
  }
  for (const [group, definition] of Object.entries(manifest.groups)) {
    assert.equal(definition.files.length, 6, group);
    for (const layer of ["soft", "medium", "strong"]) {
      assert.equal(definition.layers[layer].length, 2, `${group}/${layer}`);
    }
    for (const file of definition.files) {
      assert.doesNotMatch(file, /^https?:/);
      const wave = readFileSync(resolve(ROOT, "assets/audio/frolic/feet", file));
      assertWave(wave, { channels: 1, sampleRate: 48_000, bitsPerSample: 24 });
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

test("production Blender source models and weights both candidate heroes on one controlled biped", () => {
  const blend = readFileSync(resolve(ROOT, "tools/blender/kaki-appalachian-frolic.blend"));
  const exportValue = JSON.parse(readFileSync(
    resolve(ROOT, "tools/blender/exports/kaki-appalachian-frolic-production.json"),
    "utf8",
  ));
  assert.ok(blend.length > 300_000);
  const atlas = JSON.parse(readFileSync(
    resolve(ROOT, "assets/heroes/kitty/frolic/flatfoot/atlas.json"),
    "utf8",
  ));
  assert.equal(
    createHash("sha256").update(blend).digest("hex"),
    atlas.productionSource.blenderSceneSha256,
  );
  assert.equal(exportValue.topology, "weighted-biped");
  assert.equal(exportValue.publicSpriteSource, "actual Blender rendered character");
  assert.equal(exportValue.sharedArmature, "KakiFrolicProductionBiped");
  assert.deepEqual(exportValue.characters, HEROES);
  assert.equal(exportValue.sourceFPS, 30);
  assert.equal(exportValue.cameraType, "orthographic-three-quarter-front");
  assert.ok(exportValue.meshSummary["Hero.KittyKaki"].weightedMeshObjects >= 40);
  assert.ok(exportValue.meshSummary["Hero.Soter"].weightedMeshObjects >= 48);
  for (const name of [
    "upperArm.L", "upperArm.R", "forearm.L", "forearm.R", "hand.L", "hand.R",
    "thigh.L", "thigh.R", "shin.L", "shin.R", "foot.L", "foot.R",
    "toe.L", "toe.R",
  ]) {
    assert.ok(exportValue.deformBones.includes(name), name);
  }
  for (const name of [
    "CTRL.root", "CTRL.pelvis", "CTRL.chest",
    "footIK.L", "footIK.R", "kneePole.L", "kneePole.R",
    "heelPivot.L", "heelPivot.R", "ballPivot.L", "ballPivot.R",
    "toePivot.L", "toePivot.R", "costume.hood", "costume.tail",
  ]) {
    assert.ok(exportValue.controls.includes(name), name);
  }
  assert.equal(Object.keys(exportValue.actions).length, 8);
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
  let offset = 12;
  let format = null;
  let dataBytes = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      format = {
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    }
    if (id === "data") dataBytes = length;
    offset = start + length + (length % 2);
  }
  assert.ok(format);
  const { channels, sampleRate, bitsPerSample } = format;
  assert.equal(channels, expected.channels);
  assert.equal(sampleRate, expected.sampleRate);
  assert.equal(bitsPerSample, expected.bitsPerSample ?? 16);
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
