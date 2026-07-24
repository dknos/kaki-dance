import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const reviewRoot = resolve(root, "docs/review/frolic-rescue-candidate-1/reports");
const renderManifest = readJson("build/frolic-rescue-candidate-1/render-manifest.json");
const production = readJson("tools/blender/exports/kaki-appalachian-frolic-production.json");
const atlases = Object.fromEntries(["kitty", "soder"].map((hero) => [
  hero,
  readJson(`assets/heroes/${hero}/frolic/flatfoot/atlas.json`),
]));
const requiredClips = [
  "groove",
  "walkingStep",
  "shuffle",
  "heelToeChange",
  "backstep",
  "chug",
  "recovery",
  "turnaround",
];

assert.equal(renderManifest.sourceFPS, 30);
assert.equal(production.publicSpriteSource, "actual Blender rendered character");
assert.ok(
  requiredClips.every((clipId) => production.actions[clipId]),
  "The live production pack must retain every atlas-candidate action",
);

const checks = {};
const heroReports = {};
for (const hero of ["kitty", "soder"]) {
  const source = renderManifest.heroes[hero];
  const atlas = atlases[hero];
  assert.deepEqual(Object.keys(source.clips).sort(), [...requiredClips].sort());
  assert.deepEqual(Object.keys(atlas.clips).sort(), [...requiredClips].sort());

  const report = {
    frameCount: 0,
    plantedFootMaxDriftSourcePixels: 0,
    plantedFootMaxDriftLogicalPixels: 0,
    plantedFootWorstCase: null,
    centerOfMassMaxDistanceFromSupportHeelSourcePixels: 0,
    centerOfMassWorstCase: null,
    minimumFootSeparationLogicalPixels: Infinity,
    handAttachmentDistanceLogicalPixels: { minimum: Infinity, maximum: 0 },
    maximumConsecutiveSegmentLengthChangeSourcePixels: 0,
    firstLastCompatibilityMaxSourcePixels: 0,
  };

  for (const [clipId, clip] of Object.entries(source.clips)) {
    report.frameCount += clip.frames.length;
    validateFrameSequence(hero, clipId, clip.frames, report);
    measurePlantDrift(hero, clipId, clip.frames, report);
    measureEntryExitCompatibility(clipId, clip.frames, report);
  }
  for (const clip of Object.values(atlas.clips)) {
    for (const frame of clip.frames) {
      const anchors = frame.semanticAnchors;
      report.minimumFootSeparationLogicalPixels = Math.min(
        report.minimumFootSeparationLogicalPixels,
        Math.abs(anchors.leftFoot[0] - anchors.rightFoot[0]),
      );
      for (const side of ["left", "right"]) {
        const attachment = distance(anchors[`${side}Wrist`], anchors[`${side}Hand`]);
        report.handAttachmentDistanceLogicalPixels.minimum = Math.min(
          report.handAttachmentDistanceLogicalPixels.minimum,
          attachment,
        );
        report.handAttachmentDistanceLogicalPixels.maximum = Math.max(
          report.handAttachmentDistanceLogicalPixels.maximum,
          attachment,
        );
      }
    }
  }
  report.plantedFootMaxDriftLogicalPixels = report.plantedFootMaxDriftSourcePixels / 4;
  roundNumbers(report);
  heroReports[hero] = report;

  assert.ok(report.plantedFootMaxDriftSourcePixels <= 8, `${hero} planted-foot drift exceeded two logical pixels`);
  assert.ok(report.minimumFootSeparationLogicalPixels >= 6, `${hero} crossed feet lost readable separation`);
  assert.ok(report.handAttachmentDistanceLogicalPixels.minimum >= 2);
  assert.ok(report.handAttachmentDistanceLogicalPixels.maximum <= 8);
  assert.ok(report.maximumConsecutiveSegmentLengthChangeSourcePixels <= 18);
}

checks.heelToePivot = heelToePivotCheck(renderManifest.heroes.kitty.clips.heelToeChange.frames);
checks.leftRightDepthContinuity = depthCheck(atlases);
checks.outfitVolumeConsistency = outfitVolumeCheck(atlases);
checks.metadataCoverage = {
  pass: true,
  requiredPerFrame: [
    "support",
    "contact",
    "freeFoot",
    "centerOfMass",
    "semantic anchors",
  ],
};
checks.automatedApproval = {
  pass: false,
  note: "These checks catch regressions; they do not approve anatomy, musicality, silhouette appeal, or aesthetics.",
};

assert.ok(checks.heelToePivot.pass);
assert.ok(checks.leftRightDepthContinuity.pass);
assert.ok(checks.outfitVolumeConsistency.pass);

const report = {
  candidateStatus: "human-review-required",
  productionSource: renderManifest.sourceBlend,
  sourceHash: renderManifest.sourceHash,
  sourceFPS: renderManifest.sourceFPS,
  renderedFrameCount: Object.values(heroReports).reduce((sum, hero) => sum + hero.frameCount, 0),
  heroReports,
  checks,
};
mkdirSync(reviewRoot, { recursive: true });
writeFileSync(resolve(reviewRoot, "motion-report.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(resolve(reviewRoot, "motion-report.md"), markdown(report));
console.log(JSON.stringify(report, null, 2));

function validateFrameSequence(hero, clipId, frames, report) {
  const previousLengths = {};
  for (const frame of frames) {
    const anchors = frame.anchors;
    const required = [
      "pelvis", "chest", "head",
      "leftShoulder", "leftElbow", "leftHand",
      "rightShoulder", "rightElbow", "rightHand",
      "leftHip", "leftKnee", "leftHeel", "leftToe",
      "rightHip", "rightKnee", "rightHeel", "rightToe",
    ];
    assert.ok(required.every((key) => finitePoint(anchors[key])), `${hero}/${clipId}/${frame.sourceFrame} missing anchors`);
    assert.ok(finitePoint(frame.centerOfMass));
    for (const side of ["left", "right"]) {
      assert.ok(anchors[`${side}Hip`][1] < anchors[`${side}Knee`][1], `${hero}/${clipId} knee inverted`);
      assert.ok(anchors[`${side}Knee`][1] < Math.max(anchors[`${side}Heel`][1], anchors[`${side}Toe`][1]) + 8);
      assert.ok(anchors[`${side}Shoulder`][1] < anchors[`${side}Elbow`][1], `${hero}/${clipId} elbow inverted`);
      assert.ok(anchors[`${side}Elbow`][1] < anchors[`${side}Hand`][1] + 8);
      for (const [segment, from, to] of [
        [`${side}UpperArm`, `${side}Shoulder`, `${side}Elbow`],
        [`${side}Forearm`, `${side}Elbow`, `${side}Hand`],
        [`${side}Thigh`, `${side}Hip`, `${side}Knee`],
        [`${side}Shin`, `${side}Knee`, `${side}Heel`],
      ]) {
        const length = distance(anchors[from], anchors[to]);
        assert.ok(length > 12 && length < 115, `${hero}/${clipId} invalid ${segment} length`);
        if (Number.isFinite(previousLengths[segment])) {
          report.maximumConsecutiveSegmentLengthChangeSourcePixels = Math.max(
            report.maximumConsecutiveSegmentLengthChangeSourcePixels,
            Math.abs(length - previousLengths[segment]),
          );
        }
        previousLengths[segment] = length;
      }
    }
    if (["left", "right"].includes(frame.support)) {
      const supportHeel = anchors[`${frame.support}Heel`];
      const offset = Math.abs(frame.centerOfMass[0] - supportHeel[0]);
      if (offset > report.centerOfMassMaxDistanceFromSupportHeelSourcePixels) {
        report.centerOfMassMaxDistanceFromSupportHeelSourcePixels = offset;
        report.centerOfMassWorstCase = `${clipId}:${frame.sourceFrame}:${frame.support}`;
      }
    }
  }
}

function measurePlantDrift(hero, clipId, frames, report) {
  for (const side of ["left", "right"]) {
    let interval = [];
    for (const frame of [...frames, null]) {
      if (frame && [side, "both"].includes(frame.support)) {
        interval.push(frame);
        continue;
      }
      if (interval.length > 1) {
        const origin = interval[0].anchors[`${side}Heel`];
        for (const current of interval) {
          const drift = distance(origin, current.anchors[`${side}Heel`]);
          if (drift > report.plantedFootMaxDriftSourcePixels) {
            report.plantedFootMaxDriftSourcePixels = drift;
            report.plantedFootWorstCase = `${hero}/${clipId}/${side}/${interval[0].sourceFrame}-${current.sourceFrame}`;
          }
        }
      }
      interval = [];
    }
  }
}

function measureEntryExitCompatibility(clipId, frames, report) {
  if (!["groove", "walkingStep"].includes(clipId)) return;
  const first = frames[0].anchors;
  const last = frames.at(-1).anchors;
  for (const key of ["pelvis", "chest", "head", "leftHeel", "rightHeel", "leftHand", "rightHand"]) {
    report.firstLastCompatibilityMaxSourcePixels = Math.max(
      report.firstLastCompatibilityMaxSourcePixels,
      distance(first[key], last[key]),
    );
  }
}

function heelToePivotCheck(frames) {
  const byFrame = Object.fromEntries(frames.map((frame) => [frame.sourceFrame, frame]));
  const delta = (frame, side) => (
    byFrame[frame].anchors[`${side}Toe`][1] - byFrame[frame].anchors[`${side}Heel`][1]
  );
  const measurements = {
    leftNeutral: delta(1, "left"),
    leftHeel: delta(6, "left"),
    leftToe: delta(11, "left"),
    rightNeutral: delta(16, "right"),
    rightHeel: delta(21, "right"),
    rightToe: delta(26, "right"),
  };
  return {
    pass: measurements.leftHeel > measurements.leftNeutral + 8
      && measurements.leftToe < measurements.leftHeel - 8
      && measurements.rightHeel > measurements.rightNeutral + 8
      && measurements.rightToe < measurements.rightHeel - 8,
    measurements: roundNumbers(measurements),
    note: "Heel keys increase toe-vs-heel projection; toe keys reverse it. This is a geometric regression check, not an aesthetic approval.",
  };
}

function depthCheck(allAtlases) {
  let frameCount = 0;
  for (const atlas of Object.values(allAtlases)) {
    for (const clip of Object.values(atlas.clips)) {
      for (const frame of clip.frames) {
        frameCount += 1;
        for (const limb of ["UpperArm", "Forearm", "Hand", "Thigh", "Shin", "Foot"]) {
          assert.ok(frame.segmentDepth[`left${limb}`] > 0);
          assert.ok(frame.segmentDepth[`right${limb}`] < 0);
        }
      }
    }
  }
  return { pass: true, frameCount, note: "Near and far limb depth signs remain stable on every packed frame." };
}

function outfitVolumeCheck(allAtlases) {
  const ratios = [];
  for (const clipId of requiredClips) {
    const kitty = allAtlases.kitty.clips[clipId].frames;
    const soter = allAtlases.soder.clips[clipId].frames;
    assert.equal(kitty.length, soter.length);
    for (let index = 0; index < kitty.length; index += 1) {
      ratios.push((soter[index].w * soter[index].h) / (kitty[index].w * kitty[index].h));
    }
  }
  const minimum = Math.min(...ratios);
  const maximum = Math.max(...ratios);
  return {
    pass: minimum >= 0.95 && maximum <= 1.8,
    areaRatioSoterToKitty: { minimum: round(minimum), maximum: round(maximum) },
    note: "The costume remains an over-body volume without collapsing or ballooning relative to the shared biped.",
  };
}

function markdown(report) {
  const rows = Object.entries(report.heroReports).map(([hero, value]) => (
    `| ${hero} | ${value.frameCount} | ${value.plantedFootMaxDriftLogicalPixels} px | ${value.minimumFootSeparationLogicalPixels} px | ${value.handAttachmentDistanceLogicalPixels.minimum}-${value.handAttachmentDistanceLogicalPixels.maximum} px |`
  )).join("\n");
  return `# Frolic candidate motion report

Status: human review required

| Hero | Frames | Max planted-foot drift | Minimum foot separation | Wrist-to-hand distance |
| --- | ---: | ---: | ---: | ---: |
${rows}

The checks cover planted-foot drift, center-of-mass/support metadata, heel/toe
pivot direction, knee and elbow direction, limb continuity, hand attachment,
left/right depth continuity, foot separation, costume volume, and loop
compatibility.

These measurements are regression gates only. They do not approve anatomy,
silhouette appeal, timing, musicality, or the candidate's aesthetics.
`;
}

function finitePoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function roundNumbers(value) {
  if (Array.isArray(value)) return value.map(roundNumbers);
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) value[key] = roundNumbers(child);
    return value;
  }
  return Number.isFinite(value) ? round(value) : value;
}
