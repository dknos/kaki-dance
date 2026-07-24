import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(root, "assets/audio/frolic");
const stemRoot = resolve(outputRoot, "stems");
const feetRoot = resolve(outputRoot, "feet");
const reportPath = resolve(root, "docs/images/appalachian/frolic-audio-report.json");
const sampleRate = 22050;
const bpm = 120;
const secondsPerBeat = 60 / bpm;
const countInBars = 2;
const runBars = 32;
const countInSeconds = countInBars * 4 * secondsPerBeat;
const runSeconds = runBars * 4 * secondsPerBeat;
const durationSeconds = countInSeconds + runSeconds;
const samples = Math.ceil(durationSeconds * sampleRate);

mkdirSync(stemRoot, { recursive: true });
mkdirSync(feetRoot, { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });

const stems = {
  fiddle: new Float64Array(samples),
  banjo: new Float64Array(samples),
  guitar: new Float64Array(samples),
  bass: new Float64Array(samples),
};

const A = [
  [62, 64, 66, 69, 66, 64, 62, 59],
  [62, 66, 69, 71, 69, 66, 64, 62],
  [64, 66, 69, 74, 73, 71, 69, 66],
  [64, 62, 59, 57, 59, 61, 62, 64],
  [66, 69, 71, 69, 66, 64, 62, 64],
  [66, 69, 74, 73, 71, 69, 66, 64],
  [62, 64, 66, 69, 71, 69, 66, 61],
  [62, 66, 64, 62, 59, 61, 62, 62],
];

const B = [
  [69, 71, 74, 76, 74, 71, 69, 66],
  [69, 74, 76, 78, 76, 74, 71, 69],
  [71, 74, 78, 76, 74, 73, 71, 69],
  [66, 69, 71, 74, 71, 69, 66, 64],
  [67, 71, 74, 79, 78, 76, 74, 71],
  [69, 73, 76, 78, 76, 73, 71, 69],
  [66, 69, 74, 71, 69, 66, 64, 61],
  [62, 64, 66, 69, 66, 64, 62, 62],
];

const chords = [
  [50, 57, 62, 66],
  [50, 57, 62, 66],
  [55, 59, 62, 67],
  [50, 57, 62, 66],
  [47, 54, 59, 62],
  [55, 59, 62, 67],
  [50, 57, 62, 66],
  [57, 61, 64, 69],
];

renderCountIn(stems.guitar);

for (let bar = 0; bar < runBars; bar += 1) {
  const strainIndex = Math.floor(bar / 8);
  const melody = strainIndex < 2 ? A : B;
  const barInStrain = bar % 8;
  const notes = melody[barInStrain];
  const chord = chords[barInStrain];
  const barStart = countInSeconds + bar * 4 * secondsPerBeat;
  const energy = strainIndex === 0 ? 0.78 : strainIndex === 1 ? 0.86 : strainIndex === 2 ? 0.92 : 1;
  notes.forEach((note, index) => {
    const noteStart = barStart + index * secondsPerBeat / 2;
    const turnLift = barInStrain === 7 && index >= 6 ? 1.08 : 1;
    renderFiddle(stems.fiddle, noteStart, secondsPerBeat * 0.56, midi(note), 0.19 * energy * turnLift, bar * 31 + index);
  });
  for (let beat = 0; beat < 4; beat += 1) {
    const beatStart = barStart + beat * secondsPerBeat;
    const root = beat % 2 ? chord[1] : chord[0];
    renderGuitarBass(stems.guitar, beatStart, midi(root - 12), 0.115 * energy, bar * 11 + beat);
    renderGuitarStrum(stems.guitar, beatStart + 0.018, chord, 0.092 * energy, bar * 19 + beat);
    renderBass(stems.bass, beatStart, midi(beat % 2 ? chord[1] - 12 : chord[0] - 12), 0.12 * energy, bar * 13 + beat);
    renderBanjo(stems.banjo, beatStart, chord, energy, bar * 17 + beat);
  }
}

// A held open-D ending lets the final foot accent and band resolve together.
renderFiddle(stems.fiddle, durationSeconds - 0.72, 0.72, midi(62), 0.17, 9991);
renderGuitarStrum(stems.guitar, durationSeconds - 0.7, [50, 57, 62, 66], 0.12, 9992);
renderBass(stems.bass, durationSeconds - 0.7, midi(38), 0.13, 9993);

for (const buffer of Object.values(stems)) highPassDc(buffer);

const stemPaths = {};
for (const [name, data] of Object.entries(stems)) {
  const path = resolve(stemRoot, `board-and-bow-${name}.wav`);
  writeWav(path, [normalize(data, 0.78)], sampleRate);
  stemPaths[name] = path;
}

const masterLeft = new Float64Array(samples);
const masterRight = new Float64Array(samples);
const pans = {
  fiddle: -0.28,
  banjo: 0.3,
  guitar: -0.05,
  bass: 0,
};
for (const [name, data] of Object.entries(stems)) {
  const [leftGain, rightGain] = panGains(pans[name]);
  for (let index = 0; index < samples; index += 1) {
    masterLeft[index] += data[index] * leftGain;
    masterRight[index] += data[index] * rightGain;
  }
}
for (let index = 0; index < samples; index += 1) {
  masterLeft[index] = softClip(masterLeft[index] * 0.82);
  masterRight[index] = softClip(masterRight[index] * 0.82);
}
const peak = Math.max(maxAbs(masterLeft), maxAbs(masterRight), 1e-9);
const masterGain = 0.88 / peak;
scaleInPlace(masterLeft, masterGain);
scaleInPlace(masterRight, masterGain);
const masterPath = resolve(outputRoot, "board-and-bow.wav");
writeWav(masterPath, [masterLeft, masterRight], sampleRate);

const footManifest = buildFootSamples();
const manifestPath = resolve(feetRoot, "manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(footManifest, null, 2)}\n`);

const reportFiles = [
  masterPath,
  ...Object.values(stemPaths),
  manifestPath,
  ...Object.values(footManifest.groups).flatMap((group) => group.files.map((file) => resolve(feetRoot, file))),
];
const report = {
  schemaVersion: 1,
  title: "Board & Bow",
  provenance: "Original Kaki-Dance composition and deterministic synthesis; no third-party recording or sample.",
  bpm,
  meter: [4, 4],
  form: "AABB",
  countInBars,
  runBars,
  runSeconds,
  durationSeconds,
  sampleRate,
  channels: 2,
  stems: Object.keys(stems),
  footSampleGroups: Object.keys(footManifest.groups),
  files: Object.fromEntries(reportFiles.map((path) => [
    path.slice(root.length + 1),
    {
      bytes: readFileSync(path).byteLength,
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    },
  ])),
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`MASTER=${masterPath}`);
console.log(`DURATION=${durationSeconds}s (${countInSeconds}s count-in + ${runSeconds}s AABB)`);
console.log(`STEMS=${Object.values(stemPaths).length}`);
console.log(`FOOT_GROUPS=${Object.keys(footManifest.groups).length}`);
console.log(`REPORT=${reportPath}`);

function renderCountIn(buffer) {
  for (let beat = 0; beat < countInBars * 4; beat += 1) {
    const start = beat * secondsPerBeat;
    renderBodyKnock(buffer, start, beat % 4 === 0 ? 0.15 : 0.09, 701 + beat);
  }
}

function renderFiddle(buffer, start, duration, frequency, gain, seed) {
  const startIndex = Math.floor(start * sampleRate);
  const length = Math.min(buffer.length - startIndex, Math.floor(duration * sampleRate));
  const phaseOffsets = [0, 0.37, 0.71, 1.03];
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const attack = Math.min(1, time / 0.018);
    const release = Math.min(1, (duration - time) / 0.08);
    const envelope = attack * release;
    const vibrato = 1 + Math.sin(time * Math.PI * 2 * 5.4 + seed) * 0.0045;
    const bow = seededNoise(seed + index * 17) * 0.055;
    let value = bow;
    [1, 2, 3, 4].forEach((harmonic, harmonicIndex) => {
      value += Math.sin(time * Math.PI * 2 * frequency * harmonic * vibrato + phaseOffsets[harmonicIndex])
        * [1, 0.43, 0.2, 0.11][harmonicIndex];
    });
    buffer[startIndex + index] += value * envelope * gain;
  }
}

function renderBanjo(buffer, start, chord, energy, seed) {
  const pattern = [
    [0, chord[2], 0.1],
    [0.25, chord[1] + 12, 0.065],
    [0.5, chord[3], 0.09],
    [0.75, 69, 0.07],
  ];
  pattern.forEach(([offsetBeat, note, gain], index) => {
    renderPluck(
      buffer,
      start + offsetBeat * secondsPerBeat,
      0.32,
      midi(note),
      gain * energy,
      seed * 7 + index,
      0.012,
    );
  });
}

function renderGuitarBass(buffer, start, frequency, gain, seed) {
  renderPluck(buffer, start, 0.42, frequency, gain, seed, 0.026);
}

function renderGuitarStrum(buffer, start, chord, gain, seed) {
  chord.forEach((note, index) => {
    renderPluck(buffer, start + index * 0.006, 0.34, midi(note), gain / (1 + index * 0.13), seed + index * 97, 0.032);
  });
}

function renderBass(buffer, start, frequency, gain, seed) {
  const startIndex = Math.floor(start * sampleRate);
  const duration = 0.46;
  const length = Math.min(buffer.length - startIndex, Math.floor(duration * sampleRate));
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, time / 0.012) * Math.exp(-time * 5.2);
    const value = Math.sin(time * Math.PI * 2 * frequency)
      + Math.sin(time * Math.PI * 4 * frequency + 0.3) * 0.24
      + seededNoise(seed + index) * Math.exp(-time * 45) * 0.08;
    buffer[startIndex + index] += value * envelope * gain;
  }
}

function renderPluck(buffer, start, duration, frequency, gain, seed, decay) {
  const startIndex = Math.floor(start * sampleRate);
  const length = Math.min(buffer.length - startIndex, Math.floor(duration * sampleRate));
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.exp(-time / decay) * 0.45 + Math.exp(-time * 6.5) * 0.55;
    const pick = seededNoise(seed + index * 23) * Math.exp(-time * 90) * 0.34;
    const tone = Math.sin(time * Math.PI * 2 * frequency)
      + Math.sin(time * Math.PI * 4 * frequency + 0.2) * 0.42
      + Math.sin(time * Math.PI * 6 * frequency + 0.7) * 0.18;
    buffer[startIndex + index] += (tone + pick) * envelope * gain;
  }
}

function renderBodyKnock(buffer, start, gain, seed) {
  const startIndex = Math.floor(start * sampleRate);
  const length = Math.floor(0.14 * sampleRate);
  for (let index = 0; index < length && startIndex + index < buffer.length; index += 1) {
    const time = index / sampleRate;
    const value = seededNoise(seed + index * 3) * Math.exp(-time * 42)
      + Math.sin(time * Math.PI * 2 * 170) * Math.exp(-time * 18);
    buffer[startIndex + index] += value * gain;
  }
}

function buildFootSamples() {
  const recipes = {
    softSole: { length: 0.24, noise: 0.48, modes: [[145, 0.55], [238, 0.28]], decay: 18, gain: 0.62 },
    flatContact: { length: 0.28, noise: 0.58, modes: [[132, 0.66], [226, 0.32], [410, 0.12]], decay: 15, gain: 0.76 },
    heel: { length: 0.26, noise: 0.54, modes: [[118, 0.78], [278, 0.3]], decay: 16, gain: 0.82 },
    toeBall: { length: 0.2, noise: 0.5, modes: [[210, 0.55], [430, 0.32], [720, 0.12]], decay: 23, gain: 0.7 },
    brush: { length: 0.18, noise: 0.88, modes: [[310, 0.18]], decay: 34, gain: 0.46, sweep: 1 },
    scuff: { length: 0.2, noise: 0.82, modes: [[190, 0.26], [520, 0.16]], decay: 28, gain: 0.58, sweep: 1 },
    chug: { length: 0.34, noise: 0.58, modes: [[105, 0.76], [182, 0.36]], decay: 12, gain: 0.82 },
    drag: { length: 0.32, noise: 0.92, modes: [[126, 0.24], [252, 0.13]], decay: 15, gain: 0.52, sweep: 1.5 },
    slide: { length: 0.38, noise: 0.86, modes: [[154, 0.22]], decay: 11, gain: 0.44, sweep: 2 },
    tapHeel: { length: 0.3, noise: 0.38, modes: [[165, 0.42], [1240, 0.5], [2180, 0.24]], decay: 19, gain: 0.76 },
    tapToe: { length: 0.24, noise: 0.36, modes: [[240, 0.32], [1620, 0.55], [2620, 0.2]], decay: 24, gain: 0.72 },
    heavyAccent: { length: 0.46, noise: 0.65, modes: [[92, 0.84], [171, 0.46], [338, 0.22]], decay: 9, gain: 0.94 },
    rivalBoard: { length: 0.3, noise: 0.5, modes: [[155, 0.6], [312, 0.3], [590, 0.15]], decay: 14, gain: 0.68 },
  };
  const groups = {};
  for (const [id, recipe] of Object.entries(recipes)) {
    const files = [];
    for (let variant = 0; variant < 3; variant += 1) {
      const buffer = synthFoot(recipe, id.length * 131 + variant * 977);
      const filename = `${id}-${variant + 1}.wav`;
      writeWav(resolve(feetRoot, filename), [buffer], sampleRate);
      files.push(filename);
    }
    groups[id] = {
      files,
      baseGain: recipe.gain,
    };
  }
  return {
    schemaVersion: 1,
    sampleRate,
    roundRobin: 3,
    provenance: "Deterministic original synthesis with wooden-board resonance.",
    groups,
  };
}

function synthFoot(recipe, seed) {
  const length = Math.floor(recipe.length * sampleRate);
  const buffer = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const attack = Math.min(1, time / 0.0025);
    const sweepEnvelope = recipe.sweep
      ? Math.exp(-time * (recipe.decay * 0.45)) * (0.55 + Math.sin(time * Math.PI * 2 * (70 + time * 900)) * 0.12)
      : Math.exp(-time * recipe.decay);
    let value = seededNoise(seed + index * 47) * recipe.noise * sweepEnvelope;
    for (const [frequency, amount] of recipe.modes) {
      const variantFrequency = frequency * (1 + (seed % 17 - 8) * 0.0015);
      value += Math.sin(time * Math.PI * 2 * variantFrequency)
        * amount
        * Math.exp(-time * recipe.decay * (0.55 + frequency / 3800));
    }
    buffer[index] = value * attack * recipe.gain;
  }
  return normalize(buffer, 0.86);
}

function midi(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function panGains(pan) {
  const angle = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function highPassDc(buffer) {
  let previousInput = 0;
  let previousOutput = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const input = buffer[index];
    const output = input - previousInput + 0.995 * previousOutput;
    buffer[index] = output;
    previousInput = input;
    previousOutput = output;
  }
}

function normalize(buffer, target) {
  const result = new Float64Array(buffer);
  const peak = maxAbs(result);
  if (peak > 0) scaleInPlace(result, target / peak);
  return result;
}

function maxAbs(buffer) {
  let peak = 0;
  for (const value of buffer) peak = Math.max(peak, Math.abs(value));
  return peak;
}

function scaleInPlace(buffer, gain) {
  for (let index = 0; index < buffer.length; index += 1) buffer[index] *= gain;
}

function softClip(value) {
  return Math.tanh(value * 1.08) / Math.tanh(1.08);
}

function seededNoise(seed) {
  let value = (seed | 0) + 0x6d2b79f5;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 0xffffffff * 2 - 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function writeWav(path, channels, rate) {
  const channelCount = channels.length;
  const length = channels[0].length;
  const bytesPerSample = 2;
  const dataSize = length * channelCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * channelCount * bytesPerSample, 28);
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (let index = 0; index < length; index += 1) {
    for (const channel of channels) {
      const value = Math.round(clamp(channel[index] ?? 0, -1, 1) * 32767);
      buffer.writeInt16LE(value, offset);
      offset += 2;
    }
  }
  writeFileSync(path, buffer);
}
