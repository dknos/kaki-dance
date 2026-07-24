import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "assets", "audio", "frolic", "feet");
const SOURCES = {
  deck: {
    id: "bigsoundbank-1515",
    file: "sources/bigsoundbank-1515-shoes-on-wood-cc0.wav",
    url: "https://bigsoundbank.com/steps-on-a-wooden-floor-1-s1515.html",
    directUrl: "https://bigsoundbank.com/UPLOAD/bwf-en/1515.wav",
    author: "Joseph SARDIN",
    license: "CC0 / public domain equivalent",
    recording: "Real shoes on a wooden floor/deck; mono 48 kHz, 24-bit",
  },
  parquet: {
    id: "bigsoundbank-0376",
    file: "sources/bigsoundbank-0376-shoe-on-parquet-cc0.wav",
    url: "https://bigsoundbank.com/footsteps-shoe-on-parquet-s0376.html",
    directUrl: "https://bigsoundbank.com/UPLOAD/bwf-en/0376.wav",
    author: "Joseph SARDIN",
    license: "CC0 / public domain equivalent",
    recording: "Real shoes on old parquet; mono 48 kHz, 16-bit",
  },
  shuffle: {
    id: "freesound-273380",
    file: "sources/freesound-273380-trekking-shoe-shuffle-cc0-derived.wav",
    originalFile: "sources/freesound-273380-trekking-shoe-shuffle-cc0-hq.mp3",
    url: "https://freesound.org/people/sturmankin/sounds/273380/",
    directUrl: "https://cdn.freesound.org/previews/273/273380_4181170-hq.mp3",
    author: "sturmankin",
    license: "CC0 1.0",
    recording: "Real trekking shoes shuffling on wood; 48 kHz source, public HQ preview retained and converted to 48 kHz/24-bit PCM",
  },
};

const GROUPS = {
  softSole: group("Soft leather sole", "deck", 0.60, 0.20, [
    [1.237, 0.043], [2.053, 0.066], [2.982, 0.062],
    [3.911, 0.037], [4.899, 0.075], [5.774, 0.072],
  ]),
  flatContact: group("Flat sole contact", "deck", 0.70, 0.20, [
    [6.892, 0.036], [7.700, 0.041], [8.655, 0.068],
    [9.592, 0.047], [10.674, 0.046], [11.627, 0.081],
  ]),
  chug: group("Weighted shoe chug", "deck", 0.78, 0.22, [
    [12.357, 0.054], [13.506, 0.034], [14.180, 0.065],
    [15.084, 0.067], [16.011, 0.080], [17.900, 0.062],
  ]),
  heel: group("Leather shoe heel", "parquet", 0.74, 0.18, [
    [1.725, 0.461], [2.528, 0.151], [3.312, 0.173],
    [4.147, 0.186], [4.964, 0.197], [5.809, 0.188],
  ]),
  toeBall: group("Leather shoe toe and ball", "parquet", 0.66, 0.16, [
    [6.633, 0.190], [7.525, 0.165], [8.324, 0.313],
    [9.192, 0.215], [27.337, 0.095], [10.034, 0.252],
  ]),
  tapHeel: group("Hard shoe heel tap", "parquet", 0.70, 0.16, [
    [10.894, 0.172], [22.097, 0.328], [11.701, 0.234],
    [24.772, 0.232], [12.711, 0.167], [13.398, 0.157],
  ]),
  tapToe: group("Hard shoe toe tap", "parquet", 0.66, 0.15, [
    [14.357, 0.170], [15.940, 0.186], [16.823, 0.141],
    [19.429, 0.142], [30.758, 0.153], [20.306, 0.166],
  ]),
  brush: group("Shoe brush", "shuffle", 0.52, 0.28, [
    [0.326, 0.077], [0.939, 0.069], [1.738, 0.158],
    [3.076, 0.071], [3.583, 0.039], [4.783, 0.216],
  ], 0.038),
  scuff: group("Shoe scuff", "shuffle", 0.58, 0.30, [
    [5.493, 0.044], [6.289, 0.046], [7.941, 0.122],
    [8.714, 0.083], [9.891, 0.080], [11.332, 0.144],
  ], 0.042),
  drag: group("Shoe drag", "shuffle", 0.52, 0.42, [
    [11.911, 0.079], [12.793, 0.094], [13.552, 0.074],
    [14.589, 0.101], [15.321, 0.047], [16.495, 0.147],
  ], 0.055),
  slide: group("Shoe slide", "shuffle", 0.48, 0.44, [
    [17.362, 0.076], [18.046, 0.087], [18.888, 0.362],
    [19.692, 0.491], [21.074, 0.055], [21.857, 0.051],
  ], 0.060),
};

function group(label, source, baseGain, duration, events, preRoll = 0.018) {
  return { label, source, baseGain, duration, events, preRoll };
}

function renderSample(sourcePath, outputPath, peak, duration, preRoll) {
  const start = Math.max(0, peak - preRoll);
  const fadeOutStart = Math.max(0.03, duration - 0.025);
  const filter = [
    `atrim=start=${start.toFixed(6)}:duration=${duration.toFixed(6)}`,
    "asetpts=PTS-STARTPTS",
    "highpass=f=100",
    "afade=t=in:st=0:d=0.003",
    `afade=t=out:st=${fadeOutStart.toFixed(6)}:d=0.025`,
  ].join(",");
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", sourcePath,
    "-af", filter,
    "-ar", "48000",
    "-ac", "1",
    "-c:a", "pcm_s24le",
    outputPath,
  ]);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const manifest = {
  schemaVersion: 2,
  candidateStatus: "human-review-required",
  sampleRate: 48000,
  roundRobin: 6,
  velocityLayers: ["soft", "medium", "strong"],
  provenance: {
    sourceType: "real Foley-derived shoe recordings",
    licenseSummary: "CC0 source recordings; URLs and unmodified downloads retained",
    noSynthesis: true,
    noPitchDerivedLeftRight: true,
    sources: {},
  },
  groups: {},
  samples: {},
};

for (const source of Object.values(SOURCES)) {
  const sourcePath = join(OUTPUT, source.file);
  manifest.provenance.sources[source.id] = {
    ...source,
    file: source.file,
    sha256: sha256(sourcePath),
    ...(source.originalFile
      ? { originalFileSha256: sha256(join(OUTPUT, source.originalFile)) }
      : {}),
  };
}

for (const [groupId, definition] of Object.entries(GROUPS)) {
  const source = SOURCES[definition.source];
  const sourcePath = join(OUTPUT, source.file);
  const ordered = definition.events
    .map(([peak, energy], sourceIndex) => ({ peak, energy, sourceIndex }))
    .sort((a, b) => a.energy - b.energy);
  const layerBySourceIndex = new Map();
  ordered.forEach((entry, index) => {
    layerBySourceIndex.set(entry.sourceIndex, index < 2 ? "soft" : index < 4 ? "medium" : "strong");
  });
  const layers = { soft: [], medium: [], strong: [] };
  const files = [];
  definition.events.forEach(([peak, sourcePeakEnvelope], index) => {
    const layer = layerBySourceIndex.get(index);
    const layerIndex = layers[layer].length + 1;
    const filename = `${groupId}-${layer}-${layerIndex}.wav`;
    const outputPath = join(OUTPUT, filename);
    renderSample(sourcePath, outputPath, peak, definition.duration, definition.preRoll);
    layers[layer].push(filename);
    files.push(filename);
    manifest.samples[filename] = {
      group: groupId,
      velocityLayer: layer,
      sourceId: source.id,
      sourceFile: source.file,
      sourcePeakSeconds: peak,
      sourcePeakEnvelope,
      preRollSeconds: definition.preRoll,
      durationSeconds: definition.duration,
      processing: "trim, transient align, 100 Hz high-pass, 3 ms fade-in, 25 ms fade-out; no normalization or pitch shift",
      sha256: sha256(outputPath),
    };
  });
  manifest.groups[groupId] = {
    label: definition.label,
    files,
    layers,
    baseGain: definition.baseGain,
    polyphony: ["brush", "scuff", "drag", "slide"].includes(groupId) ? 3 : 5,
  };
}

// Rival call-and-response uses the same real flat-contact family instead of a
// synthetic special drum voice.
manifest.groups.rivalBoard = {
  label: "Rival shoe on board",
  aliasOf: "flatContact",
  files: [...manifest.groups.flatContact.files],
  layers: structuredClone(manifest.groups.flatContact.layers),
  baseGain: 0.62,
  polyphony: 4,
};

writeFileSync(join(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  output: relative(ROOT, OUTPUT),
  sourceCount: Object.keys(manifest.provenance.sources).length,
  familyCount: Object.keys(manifest.groups).length,
  renderedSamples: Object.keys(manifest.samples).length,
  sampleRate: manifest.sampleRate,
  roundRobin: manifest.roundRobin,
  candidateStatus: manifest.candidateStatus,
}, null, 2));
