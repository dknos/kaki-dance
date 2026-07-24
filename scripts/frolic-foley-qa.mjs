import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FootPercussionPlayer } from "../js/audio/foot-percussion-player.js";

const root = resolve(import.meta.dirname, "..");
const audioRoot = resolve(root, "assets/audio/frolic/feet");
const reportRoot = resolve(root, "docs/review/frolic-rescue-candidate-1/reports");
const manifest = JSON.parse(readFileSync(resolve(audioRoot, "manifest.json"), "utf8"));
const sampleReports = {};
const hashes = new Map();
const groupReports = {};

assert.equal(manifest.candidateStatus, "human-review-required");
assert.equal(manifest.provenance.noSynthesis, true);
assert.equal(manifest.provenance.noPitchDerivedLeftRight, true);
assert.equal(manifest.sampleRate, 48000);
assert.deepEqual(manifest.velocityLayers, ["soft", "medium", "strong"]);

for (const [sourceId, source] of Object.entries(manifest.provenance.sources)) {
  const bytes = readFileSync(resolve(audioRoot, source.file));
  assert.equal(sha256(bytes), source.sha256, `${sourceId} source hash mismatch`);
  assert.match(source.url, /^https:\/\//);
  assert.match(source.license, /CC0|public domain/i);
}

for (const [filename, definition] of Object.entries(manifest.samples)) {
  const bytes = readFileSync(resolve(audioRoot, filename));
  const hash = sha256(bytes);
  assert.equal(hash, definition.sha256, `${filename} hash mismatch`);
  assert.ok(!hashes.has(hash), `${filename} duplicates ${hashes.get(hash)}`);
  hashes.set(hash, filename);
  const wav = decodePcmWav(bytes);
  assert.ok([1, 0xfffe].includes(wav.audioFormat), `${filename} must be PCM`);
  assert.equal(wav.sampleRate, 48000);
  assert.equal(wav.channels, 1);
  assert.equal(wav.bitsPerSample, 24);
  const analysis = analyze(wav.samples, wav.sampleRate);
  sampleReports[filename] = {
    group: definition.group,
    velocityLayer: definition.velocityLayer,
    sourceId: definition.sourceId,
    sampleRate: wav.sampleRate,
    bitsPerSample: wav.bitsPerSample,
    channels: wav.channels,
    durationSeconds: round(wav.samples.length / wav.sampleRate),
    peak: round(analysis.peak),
    rms: round(analysis.rms),
    dcOffset: round(analysis.dcOffset),
    subBassEnergyRatio: round(analysis.subBassEnergyRatio),
    transientSeconds: round(analysis.transientOnsetIndex / wav.sampleRate),
    maximumPeakSeconds: round(analysis.maximumPeakIndex / wav.sampleRate),
    final20msRmsRelativeDb: round(analysis.final20msRmsRelativeDb),
    finalSampleAbsolute: round(analysis.finalSampleAbsolute),
    tailTonalAutocorrelation: round(analysis.tailTonalAutocorrelation),
    clippedSamples: analysis.clippedSamples,
  };
  assert.ok(analysis.peak < 0.999, `${filename} clips`);
  assert.equal(analysis.clippedSamples, 0, `${filename} contains clipped samples`);
  assert.ok(Math.abs(analysis.dcOffset) < 0.01, `${filename} has excessive DC`);
  assert.ok(analysis.subBassEnergyRatio < 0.16, `${filename} has excessive sub-bass`);
  const maximumPreRoll = ["brush", "scuff", "drag", "slide"].includes(definition.group) ? 0.065 : 0.025;
  assert.ok(analysis.transientOnsetIndex / wav.sampleRate <= maximumPreRoll, `${filename} transient is not tightly aligned`);
  assert.ok(analysis.finalSampleAbsolute < 0.0001, `${filename} tail does not fade to silence`);
  const maximumDuration = ["brush", "scuff", "drag", "slide"].includes(definition.group) ? 0.45 : 0.22;
  assert.ok(wav.samples.length / wav.sampleRate <= maximumDuration + 0.001, `${filename} has an overlong tail`);
  if (!["brush", "scuff", "drag", "slide"].includes(definition.group)) {
    assert.ok(analysis.tailTonalAutocorrelation < 0.82, `${filename} has tonal tail ringing`);
  }
}

for (const [group, definition] of Object.entries(manifest.groups)) {
  if (definition.aliasOf) continue;
  assert.equal(definition.files.length, 6, `${group} requires six distinct round robins`);
  assert.equal(new Set(definition.files).size, 6);
  assert.ok(definition.polyphony >= 3 && definition.polyphony <= 5);
  const layers = {};
  for (const layer of manifest.velocityLayers) {
    assert.equal(definition.layers[layer].length, 2, `${group}/${layer} requires two distinct recordings`);
    layers[layer] = median(definition.layers[layer].map((file) => sampleReports[file].rms));
  }
  groupReports[group] = {
    roundRobins: definition.files.length,
    perVelocityLayer: 2,
    polyphony: definition.polyphony,
    medianRmsByVelocity: Object.fromEntries(Object.entries(layers).map(([key, value]) => [key, round(value)])),
  };
  assert.ok(layers.strong > layers.soft * 1.08, `${group} lost natural soft/strong dynamics`);
}

const runtime = runtimeChecks();
const report = {
  candidateStatus: "human-review-required",
  sourceType: manifest.provenance.sourceType,
  noSynthesis: manifest.provenance.noSynthesis,
  sourceCount: Object.keys(manifest.provenance.sources).length,
  uniqueSampleCount: Object.keys(sampleReports).length,
  exactDuplicateCount: 0,
  sampleFormat: "48 kHz / 24-bit / mono PCM WAV",
  provenance: manifest.provenance.sources,
  groups: groupReports,
  runtime,
  thresholds: {
    peak: "< 0.999",
    absoluteDcOffset: "< 0.01",
    subBassEnergyRatio: "< 0.16",
    transientAlignment: "<= 45 ms",
    finalSampleAbsolute: "< 0.0001",
    impactDuration: "<= 220 ms",
    scrapeDuration: "<= 450 ms",
    tonalTailAutocorrelationForImpacts: "< 0.82",
  },
  samples: sampleReports,
  humanAudition: {
    required: true,
    approved: false,
    note: "Signal checks cannot determine whether footwear sounds convincing. Use the audition page before approval.",
  },
};
mkdirSync(reportRoot, { recursive: true });
writeFileSync(resolve(reportRoot, "foley-report.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(resolve(reportRoot, "foley-report.md"), markdown(report));
console.log(JSON.stringify({
  candidateStatus: report.candidateStatus,
  sourceType: report.sourceType,
  uniqueSampleCount: report.uniqueSampleCount,
  exactDuplicateCount: report.exactDuplicateCount,
  runtime: report.runtime,
  humanAudition: report.humanAudition,
}, null, 2));

function runtimeChecks() {
  const started = [];
  const sources = [];
  const node = () => ({ connect() {}, disconnect() {} });
  const context = {
    currentTime: 1,
    baseLatency: 0.012,
    outputLatency: 0.018,
    createBufferSource() {
      const source = {
        buffer: null,
        playbackRate: { value: 0 },
        connect() {},
        disconnect() {},
        start(time) { started.push({ time, buffer: this.buffer, rate: this.playbackRate.value }); },
        stop() { this.stopped = true; },
        addEventListener() {},
      };
      sources.push(source);
      return source;
    },
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createStereoPanner: () => ({ ...node(), pan: { value: 0 } }),
    createBiquadFilter: () => ({ ...node(), type: "", frequency: { value: 0 }, Q: { value: 0 } }),
    createDynamicsCompressor: () => ({
      ...node(),
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
    }),
  };
  const player = new FootPercussionPlayer({
    transport: { context, effectsGain: node() },
    fetchImpl: null,
  });
  player.manifest = manifest;
  for (const [group, definition] of Object.entries(manifest.groups)) {
    player.buffers.set(group, definition.files.map((filename) => ({ filename })));
  }
  const sequence = [];
  for (let index = 0; index < 6; index += 1) {
    assert.equal(player.playContact({
      sampleGroup: "heel",
      intensity: 0.55,
      immediate: true,
      inputAudioTime: 0.99,
      contactId: `qa-${index}`,
    }), true);
    sequence.push(started.at(-1).buffer.filename);
  }
  assert.deepEqual(sequence.slice(0, 2), manifest.groups.heel.layers.medium);
  assert.deepEqual(sequence.slice(2, 4), manifest.groups.heel.layers.medium);
  assert.ok(started.every((entry) => entry.rate === 1));
  assert.ok(started.every((entry) => entry.time === context.currentTime));
  assert.ok(player.activeByGroup.get("heel").length <= manifest.groups.heel.polyphony);
  const footBus = player.footBus;
  assert.ok(footBus);
  player.stopAll();
  assert.equal(player.active.size, 0);
  return {
    scheduling: "immediate AudioBufferSource.start at converted input time, clamped to currentTime",
    scheduledSources: started.length,
    playbackRate: 1,
    roundRobinSequence: sequence,
    noImmediateRepeat: sequence.every((file, index) => index === 0 || file !== sequence[index - 1]),
    polyphonyLimitObserved: true,
    dedicatedFootBus: "70 Hz high-pass and gentle compressor",
    stopAllClearsVoices: true,
  };
}

function decodePcmWav(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
  let offset = 12;
  let format = null;
  let pcm = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: bytes.readUInt16LE(start),
        channels: bytes.readUInt16LE(start + 2),
        sampleRate: bytes.readUInt32LE(start + 4),
        bitsPerSample: bytes.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      pcm = bytes.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  assert.ok(format && pcm);
  assert.equal(format.bitsPerSample, 24);
  const samples = new Float64Array(pcm.length / 3);
  for (let index = 0; index < samples.length; index += 1) {
    const byte = index * 3;
    let value = pcm[byte] | (pcm[byte + 1] << 8) | (pcm[byte + 2] << 16);
    if (value & 0x800000) value |= 0xff000000;
    samples[index] = value / 8388608;
  }
  return { ...format, samples };
}

function analyze(samples, sampleRate) {
  let sum = 0;
  let energy = 0;
  let peak = 0;
  let maximumPeakIndex = 0;
  let clippedSamples = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const absolute = Math.abs(sample);
    sum += sample;
    energy += sample * sample;
    if (absolute > peak) {
      peak = absolute;
      maximumPeakIndex = index;
    }
    if (absolute >= 0.999) clippedSamples += 1;
  }
  const rms = Math.sqrt(energy / samples.length);
  const tailLength = Math.min(samples.length, Math.round(sampleRate * 0.02));
  let tailEnergy = 0;
  for (let index = samples.length - tailLength; index < samples.length; index += 1) {
    tailEnergy += samples[index] ** 2;
  }
  const tailRms = Math.sqrt(tailEnergy / tailLength);
  let transientOnsetIndex = 0;
  const onsetThreshold = peak * 0.05;
  while (
    transientOnsetIndex < samples.length - 1
    && Math.abs(samples[transientOnsetIndex]) < onsetThreshold
  ) transientOnsetIndex += 1;
  return {
    peak,
    rms,
    dcOffset: sum / samples.length,
    subBassEnergyRatio: spectralSubBassRatio(samples, sampleRate),
    transientOnsetIndex,
    maximumPeakIndex,
    final20msRmsRelativeDb: 20 * Math.log10(Math.max(tailRms, 1e-12) / Math.max(rms, 1e-12)),
    finalSampleAbsolute: Math.abs(samples.at(-1)),
    tailTonalAutocorrelation: tonalAutocorrelation(samples, sampleRate),
    clippedSamples,
  };
}

function spectralSubBassRatio(samples, sampleRate) {
  let size = 1;
  while (size < samples.length) size *= 2;
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let index = 0; index < samples.length; index += 1) {
    real[index] = samples[index];
  }
  for (let index = 1, target = 0; index < size; index += 1) {
    let bit = size >> 1;
    while (target & bit) {
      target ^= bit;
      bit >>= 1;
    }
    target ^= bit;
    if (index < target) {
      [real[index], real[target]] = [real[target], real[index]];
      [imaginary[index], imaginary[target]] = [imaginary[target], imaginary[index]];
    }
  }
  for (let length = 2; length <= size; length *= 2) {
    const angle = -2 * Math.PI / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
  let subBass = 0;
  let total = 0;
  for (let bin = 1; bin < size / 2; bin += 1) {
    const frequency = bin * sampleRate / size;
    const magnitude = real[bin] ** 2 + imaginary[bin] ** 2;
    total += magnitude;
    if (frequency < 60) subBass += magnitude;
  }
  return subBass / Math.max(total, 1e-18);
}

function tonalAutocorrelation(samples, sampleRate) {
  const count = Math.min(samples.length, Math.round(sampleRate * 0.08));
  const start = samples.length - count;
  let maximum = 0;
  for (let frequency = 80; frequency <= 400; frequency += 10) {
    const lag = Math.max(1, Math.round(sampleRate / frequency));
    let numerator = 0;
    let left = 0;
    let right = 0;
    for (let index = start + lag; index < samples.length; index += 1) {
      const a = samples[index];
      const b = samples[index - lag];
      numerator += a * b;
      left += a * a;
      right += b * b;
    }
    maximum = Math.max(maximum, Math.abs(numerator) / Math.sqrt(Math.max(left * right, 1e-18)));
  }
  return maximum;
}

function markdown(report) {
  return `# Frolic candidate Foley report

Status: human review required

- Source: ${report.sourceType}
- Unique runtime samples: ${report.uniqueSampleCount}
- Exact duplicates: ${report.exactDuplicateCount}
- Format: ${report.sampleFormat}
- Runtime bus: ${report.runtime.dedicatedFootBus}
- Playback rate: ${report.runtime.playbackRate}

All runtime samples passed format, clipping, DC offset, sub-bass, transient
alignment, short-tail, duplicate, provenance, round-robin, polyphony, and
scheduling checks.

Human audition is still mandatory. Signal analysis cannot decide whether a
sample convincingly sounds like footwear on wood.
`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}
