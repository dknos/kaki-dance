import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reviewRelative = "docs/review/frolic-rescue-candidate-1";
const reviewRoot = resolve(root, reviewRelative);
const atlas = readJson("assets/heroes/kitty/frolic/flatfoot/atlas.json");
const soderAtlas = readJson("assets/heroes/soder/frolic/flatfoot/atlas.json");
const production = readJson("tools/blender/exports/kaki-appalachian-frolic-production.json");
const foley = readJson("assets/audio/frolic/feet/manifest.json");
const latency = readJson(`${reviewRelative}/reports/latency-report.json`);
const motion = readJson(`${reviewRelative}/reports/motion-report.json`);
const foleyReport = readJson(`${reviewRelative}/reports/foley-report.json`);

const excluded = new Set([
  `${reviewRelative}/source-provenance-manifest.json`,
]);
const media = walk(reviewRoot)
  .map((path) => relative(root, path).replaceAll("\\", "/"))
  .filter((path) => !excluded.has(path))
  .map(fileRecord);

const manifest = {
  schemaVersion: 1,
  candidateStatus: "human-review-required",
  candidateId: "frolic-rescue-candidate-1",
  auditDate: "2026-07-24",
  rejectedBaselineCommit: "0c82fe75eacf5e412a5a8e51a587932e9cc80e9d",
  workingHead: readHead(),
  deployment: "not-deployed",
  reviewPage: "frolic-rescue-review.html",
  scope: {
    profile: "Flatfoot",
    heroes: ["KittyKaki", "Soter"],
    actions: Object.keys(atlas.clips),
    buck: "being rebuilt",
    clog: "being rebuilt",
  },
  modelSheets: {
    tool: "OpenAI image generation",
    use: "turnaround, identity, proportion, palette, hand, shoe, and costume reference only",
    animationFramesGenerated: false,
    sourceFiles: [
      fileRecord("docs/art-source/frolic-rescue-candidate-1/imagegen/kittykaki-model-sheet-source.png"),
      fileRecord("docs/art-source/frolic-rescue-candidate-1/imagegen/soter-model-sheet-source.png"),
    ],
  },
  productionArt: {
    publicSpriteSource: production.publicSpriteSource,
    blenderScene: fileRecord("tools/blender/kaki-appalachian-frolic-atlas-candidate-1.blend"),
    exportContract: fileRecord("tools/blender/exports/kaki-appalachian-frolic-production.json"),
    armature: production.sharedArmature,
    topology: production.topology,
    camera: production.camera,
    cameraType: production.cameraType,
    sourceFPS: production.sourceFPS,
    renderResolution: production.renderResolution,
    meshSummary: production.meshSummary,
    controls: production.controls,
    manualPixelCleanup: production.manualPixelCleanup,
  },
  atlases: {
    sourceHash: atlas.productionSource.blenderSceneSha256,
    renderer: atlas.productionSource.renderer,
    conversion: atlas.productionSource.conversion,
    cleanupRevision: atlas.productionSource.cleanupRevision,
    atlasRevision: atlas.productionSource.atlasRevision,
    decodedTextureBytesPerHero: 2 * 1024 * 1024 * 4,
    heroes: {
      kitty: atlasRecord("kitty", atlas),
      soder: atlasRecord("soder", soderAtlas),
    },
  },
  foley: {
    sourceType: foley.provenance.sourceType,
    licenseSummary: foley.provenance.licenseSummary,
    sources: foley.provenance.sources,
    sampleCount: foleyReport.uniqueSampleCount,
    exactDuplicates: foleyReport.exactDuplicateCount,
    format: foleyReport.sampleFormat,
    synthesis: false,
    humanAudition: foleyReport.humanAudition,
  },
  music: {
    status: "unchanged-code-synthesized-candidate-not-approved",
    timing: "120 BPM; two-bar count-in; 32-bar AABB; 68 second master",
    report: `${reviewRelative}/reports/music-audit.md`,
  },
  measuredEvidence: {
    latency: latency.metricsMilliseconds,
    audioContext: latency.audioContext,
    latencySampleCount: latency.sampleCount,
    motion: motion.heroReports,
    reports: [
      `${reviewRelative}/reports/latency-report.md`,
      `${reviewRelative}/reports/motion-report.md`,
      `${reviewRelative}/reports/foley-report.md`,
      `${reviewRelative}/reports/review-page-smoke.json`,
    ],
  },
  knownVisibleWeaknesses: [
    "simple rounded Blender anatomy still needs specialist silhouette refinement",
    "arms and hands remain conservative and may read too stiff or glove-like",
    "the Flatfoot groove is subtle and may not yet carry enough personal musical character",
    "manual pixel cleanup is blocked because Aseprite and LibreSprite are unavailable",
    "the hall, crowd, band, instruments, and HUD received a readability pass rather than complete art polish",
    "Board & Bow remains code-synthesized and audibly unapproved",
  ],
  automatedApproval: false,
  humanApprovalRequired: true,
  changedFiles: readChangedFiles(),
  media,
};

writeFileSync(
  resolve(reviewRoot, "source-provenance-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(JSON.stringify({
  manifest: `${reviewRelative}/source-provenance-manifest.json`,
  mediaFiles: media.length,
  blenderSourceHash: manifest.atlases.sourceHash,
  humanApprovalRequired: true,
}, null, 2));

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function readHead() {
  const head = readFileSync(resolve(root, ".git/HEAD"), "utf8").trim();
  if (!head.startsWith("ref: ")) return head;
  return readFileSync(resolve(root, `.git/${head.slice(5)}`), "utf8").trim();
}

function readChangedFiles() {
  const result = spawnSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" },
  );
  const output = result.stdout ?? "";
  if (!output.trim()) return [];
  return output.trimEnd().split("\n").map((line) => ({
    status: line.slice(0, 2),
    path: line.slice(3),
  }));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
}

function fileRecord(path) {
  const normalized = path.replaceAll("\\", "/");
  return {
    path: normalized,
    bytes: statSync(resolve(root, normalized)).size,
    sha256: sha256(normalized),
  };
}

function atlasRecord(hero, definition) {
  const base = `assets/heroes/${hero}/frolic/flatfoot`;
  const files = [...definition.pages, "atlas.json"].map((name) => fileRecord(`${base}/${name}`));
  return {
    sourceFrames: Object.values(definition.clips).reduce((sum, clip) => sum + clip.frames.length, 0),
    files,
    compressedBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  };
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
