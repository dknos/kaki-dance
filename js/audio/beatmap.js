import { deepFreeze } from "../core/math.js";

export const DEFAULT_BEATMAP = deepFreeze({
  id: "moonBlockParty",
  title: "Moon Block Party",
  bpm: 100,
  offsetSeconds: 0.084,
  beatsPerBar: 4,
  barsPerPhrase: 4,
  loopBars: 16,
  sections: [
    { id: "countIn", startBar: 0, endBar: 1, intensity: 0.35 },
    { id: "pocketA", startBar: 1, endBar: 5, intensity: 0.62 },
    { id: "break", startBar: 5, endBar: 7, intensity: 0.42 },
    { id: "pocketB", startBar: 7, endBar: 13, intensity: 0.8 },
    { id: "finale", startBar: 13, endBar: 16, intensity: 1 },
  ],
  accents: [
    { beat: 0, strength: 1, label: "drop" },
    { beat: 2, strength: 0.72, label: "snare" },
    { beat: 8, strength: 0.88, label: "scratch" },
    { beat: 16, strength: 1, label: "phrase" },
    { beat: 20, strength: 0.8, label: "kick" },
    { beat: 24, strength: 0.92, label: "break" },
    { beat: 28, strength: 0.86, label: "fill" },
    { beat: 32, strength: 1, label: "return" },
    { beat: 40, strength: 0.82, label: "stab" },
    { beat: 48, strength: 1, label: "phrase" },
    { beat: 56, strength: 0.9, label: "scratch" },
    { beat: 60, strength: 1, label: "finale" },
  ],
  breaks: [{ startBeat: 24, endBeat: 28 }, { startBeat: 56, endBeat: 58 }],
  drops: [0, 32, 60],
});

export function validateBeatmap(value) {
  const errors = [];
  if (!value || typeof value !== "object") return ["Beatmap must be an object."];
  if (!value.id) errors.push("Beatmap id is required.");
  if (!(Number(value.bpm) > 0)) errors.push("Beatmap bpm must be positive.");
  if (!Number.isFinite(Number(value.offsetSeconds))) errors.push("Beatmap offsetSeconds must be finite.");
  if (!(Number(value.beatsPerBar) > 0)) errors.push("beatsPerBar must be positive.");
  if (!(Number(value.barsPerPhrase) > 0)) errors.push("barsPerPhrase must be positive.");
  for (const section of value.sections ?? []) {
    if (!section.id || !(section.endBar > section.startBar)) {
      errors.push("Every section needs an id and increasing bar bounds.");
    }
  }
  return errors;
}

export async function loadBeatmap(url = new URL("../../assets/audio/moon-block-party.beatmap.json", import.meta.url)) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Beatmap request failed: ${response.status}`);
    const value = await response.json();
    const errors = validateBeatmap(value);
    if (errors.length) throw new Error(errors.join(" "));
    return deepFreeze(value);
  } catch {
    return DEFAULT_BEATMAP;
  }
}

export function sectionAtBeat(beat, beatmap = DEFAULT_BEATMAP) {
  const bar = beat / beatmap.beatsPerBar;
  const loopBar = beatmap.loopBars
    ? ((bar % beatmap.loopBars) + beatmap.loopBars) % beatmap.loopBars
    : bar;
  return beatmap.sections.find((section) => loopBar >= section.startBar && loopBar < section.endBar)
    ?? beatmap.sections.at(-1)
    ?? { id: "main", intensity: 0.5 };
}

export function nearestAccent(beat, beatmap = DEFAULT_BEATMAP) {
  const loopBeats = beatmap.loopBars * beatmap.beatsPerBar;
  const localBeat = loopBeats ? ((beat % loopBeats) + loopBeats) % loopBeats : beat;
  let best = null;
  for (const accent of beatmap.accents ?? []) {
    const rawDelta = localBeat - accent.beat;
    const wrappedDelta = loopBeats
      ? Math.abs(rawDelta) > loopBeats / 2
        ? rawDelta - Math.sign(rawDelta) * loopBeats
        : rawDelta
      : rawDelta;
    if (!best || Math.abs(wrappedDelta) < Math.abs(best.deltaBeats)) {
      best = { ...accent, deltaBeats: wrappedDelta };
    }
  }
  return best;
}
