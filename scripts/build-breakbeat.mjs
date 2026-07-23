import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 44100;
const BPM = 100;
const BEAT_SECONDS = 60 / BPM;
const BARS = 16;
const BEATS_PER_BAR = 4;
const OFFSET_SECONDS = 0.084;
const DURATION_SECONDS = BARS * BEATS_PER_BAR * BEAT_SECONDS;
const sampleCount = Math.round(DURATION_SECONDS * SAMPLE_RATE);
const mix = new Float64Array(sampleCount);
let noiseState = 0x4b414b49;

function random() {
  let value = noiseState;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  noiseState = value >>> 0;
  return noiseState / 0x100000000;
}

function addKick(time, strength = 1) {
  const start = Math.round(time * SAMPLE_RATE);
  const length = Math.round(0.24 * SAMPLE_RATE);
  let phase = 0;
  for (let index = 0; index < length && start + index < mix.length; index += 1) {
    const t = index / SAMPLE_RATE;
    const frequency = 142 * Math.exp(-t * 24) + 43;
    phase += Math.PI * 2 * frequency / SAMPLE_RATE;
    const envelope = Math.exp(-t * 17) * Math.min(1, t * 800);
    const click = index < 80 ? (1 - index / 80) * (random() * 2 - 1) * 0.16 : 0;
    mix[start + index] += (Math.sin(phase) * 0.72 + click) * envelope * strength;
  }
}

function addSnare(time, strength = 1) {
  const start = Math.round(time * SAMPLE_RATE);
  const length = Math.round(0.19 * SAMPLE_RATE);
  let phase = 0;
  for (let index = 0; index < length && start + index < mix.length; index += 1) {
    const t = index / SAMPLE_RATE;
    phase += Math.PI * 2 * 185 / SAMPLE_RATE;
    const envelope = Math.exp(-t * 22);
    const noise = (random() * 2 - 1) * (0.58 + 0.24 * Math.sin(t * Math.PI * 850));
    const body = Math.sin(phase) * 0.28;
    mix[start + index] += (noise + body) * envelope * strength * 0.68;
  }
}

function addHat(time, open = false, strength = 1) {
  const start = Math.round(time * SAMPLE_RATE);
  const length = Math.round((open ? 0.13 : 0.045) * SAMPLE_RATE);
  let previous = 0;
  for (let index = 0; index < length && start + index < mix.length; index += 1) {
    const t = index / SAMPLE_RATE;
    const noise = random() * 2 - 1;
    const high = noise - previous * 0.82;
    previous = noise;
    const envelope = Math.exp(-t * (open ? 28 : 75));
    mix[start + index] += high * envelope * strength * 0.12;
  }
}

function addBass(time, frequency, duration = 0.42, strength = 1) {
  const start = Math.round(time * SAMPLE_RATE);
  const length = Math.round(duration * SAMPLE_RATE);
  let phase = 0;
  for (let index = 0; index < length && start + index < mix.length; index += 1) {
    const t = index / SAMPLE_RATE;
    phase += Math.PI * 2 * frequency / SAMPLE_RATE;
    const attack = Math.min(1, t * 45);
    const release = Math.min(1, (duration - t) * 9);
    const envelope = attack * Math.max(0, release) * 0.22;
    const sample = Math.sin(phase) + Math.sin(phase * 2) * 0.18;
    mix[start + index] += sample * envelope * strength;
  }
}

function addStab(time, frequency, strength = 1) {
  const start = Math.round(time * SAMPLE_RATE);
  const length = Math.round(0.17 * SAMPLE_RATE);
  const notes = [frequency, frequency * 1.25, frequency * 1.5];
  const phases = [0, 0, 0];
  for (let index = 0; index < length && start + index < mix.length; index += 1) {
    const t = index / SAMPLE_RATE;
    const envelope = Math.exp(-t * 14) * Math.min(1, t * 90);
    let sample = 0;
    for (let note = 0; note < notes.length; note += 1) {
      phases[note] += Math.PI * 2 * notes[note] / SAMPLE_RATE;
      sample += Math.sign(Math.sin(phases[note])) / notes.length;
    }
    mix[start + index] += sample * envelope * 0.11 * strength;
  }
}

function addScratch(time, direction = 1, strength = 1) {
  const start = Math.round(time * SAMPLE_RATE);
  const length = Math.round(0.28 * SAMPLE_RATE);
  let phase = 0;
  let filtered = 0;
  for (let index = 0; index < length && start + index < mix.length; index += 1) {
    const t = index / SAMPLE_RATE;
    const sweep = direction > 0 ? 280 + t * 2400 : 950 - t * 2500;
    phase += Math.PI * 2 * Math.max(90, sweep) / SAMPLE_RATE;
    const raw = (random() * 2 - 1) * 0.7 + Math.sin(phase) * 0.3;
    filtered += (raw - filtered) * 0.3;
    const envelope = Math.sin(Math.min(1, t / 0.28) * Math.PI);
    mix[start + index] += filtered * envelope * 0.16 * strength;
  }
}

function addVinylBed() {
  let low = 0;
  for (let index = 0; index < mix.length; index += 1) {
    const noise = random() * 2 - 1;
    low += (noise - low) * 0.02;
    const crackle = random() > 0.99972 ? (random() * 2 - 1) * 0.07 : 0;
    mix[index] += low * 0.012 + crackle;
  }
}

addVinylBed();

const kickPatterns = [
  [0, 1.75, 2.5],
  [0, 1.5, 2.75],
  [0, 0.75, 2.5, 3.5],
  [0, 1.75, 2.25, 3.25],
];
const bassNotes = [55, 55, 65.41, 49, 55, 73.42, 65.41, 49];

for (let bar = 0; bar < BARS; bar += 1) {
  const barStart = OFFSET_SECONDS + bar * BEATS_PER_BAR * BEAT_SECONDS;
  const isBreak = bar === 5 || bar === 6 || bar === 14;
  const isFinale = bar >= 12;
  const kickPattern = kickPatterns[bar % kickPatterns.length];
  if (!isBreak || bar === 6) {
    for (const beatOffset of kickPattern) {
      addKick(barStart + beatOffset * BEAT_SECONDS, beatOffset === 0 ? 1 : 0.78);
    }
  } else {
    addKick(barStart, 0.85);
    addKick(barStart + 3.5 * BEAT_SECONDS, 0.62);
  }
  addSnare(barStart + BEAT_SECONDS, 0.92);
  addSnare(barStart + BEAT_SECONDS * 3, isFinale ? 1.08 : 0.96);
  if (bar === 5) addSnare(barStart + BEAT_SECONDS * 2.75, 0.55);
  for (let eighth = 0; eighth < 8; eighth += 1) {
    if (isBreak && eighth % 2) continue;
    const swing = eighth % 2 ? 0.026 : 0;
    addHat(barStart + eighth * BEAT_SECONDS / 2 + swing, eighth === 7 && bar % 2 === 1, eighth % 2 ? 0.72 : 0.92);
  }
  const root = bassNotes[bar % bassNotes.length];
  addBass(barStart, root, BEAT_SECONDS * 0.68, 1);
  addBass(barStart + BEAT_SECONDS * 2.5, root * (bar % 3 === 0 ? 1.5 : 1.25), BEAT_SECONDS * 0.52, 0.82);
  if ([0, 4, 8, 12, 15].includes(bar)) {
    addStab(barStart, root * 4, isFinale ? 1.15 : 0.88);
  }
  if ([2, 7, 10, 14].includes(bar)) {
    addScratch(barStart + BEAT_SECONDS * (bar === 14 ? 2 : 0), bar % 2 ? -1 : 1, isFinale ? 1.2 : 0.9);
  }
}

// A tiny four-note "Kaki-Dance" synth answer in the finale; no sampled vocals.
for (const [beat, note] of [[52, 440], [54, 493.88], [56, 523.25], [60, 659.25]]) {
  addStab(OFFSET_SECONDS + beat * BEAT_SECONDS, note, 0.72);
}

let peak = 0;
for (const sample of mix) peak = Math.max(peak, Math.abs(sample));
const gain = peak > 0 ? 0.88 / peak : 1;
const pcm = new Int16Array(sampleCount);
for (let index = 0; index < mix.length; index += 1) {
  const edgeFade = Math.min(1, index / 128, (mix.length - 1 - index) / 128);
  pcm[index] = Math.round(Math.max(-1, Math.min(1, mix[index] * gain * edgeFade)) * 32767);
}

const output = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/audio/moon-block-party.wav");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, encodeWave(pcm, SAMPLE_RATE));
console.log(`Wrote ${output} (${DURATION_SECONDS.toFixed(3)} s, ${BPM} BPM, ${sampleCount} samples).`);

function encodeWave(samples, sampleRate) {
  const byteLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + byteLength);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + byteLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(byteLength, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }
  return buffer;
}
