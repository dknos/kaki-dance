import { deepFreeze } from "../core/math.js";

export const DEFAULT_MEASURE_PATTERNS = deepFreeze([
  {
    id: "pocket-quarters",
    callBar: 2,
    responseBar: 3,
    subdivision: 16,
    callTicks: [0, 4, 8, 12],
    targetTicks: [0, 4, 8, 12],
    targetStrengths: [1, 0.86, 0.74, 0.92],
    optionalStyleTicks: [6, 14],
    choreographyId: "basic-rock-a",
    section: "onboarding",
    difficulty: 1,
    phraseEnding: false,
    freezeOpportunity: false,
    cueSounds: ["hat", "snare", "hat", "snare"],
  },
  {
    id: "backbeat-rock",
    callBar: 4,
    responseBar: 5,
    subdivision: 16,
    callTicks: [0, 4, 8, 12],
    targetTicks: [0, 4, 8, 12],
    targetStrengths: [0.86, 1, 0.78, 1],
    optionalStyleTicks: [7, 13],
    choreographyId: "basic-rock-b",
    section: "standing-groove",
    difficulty: 1,
    phraseEnding: true,
    freezeOpportunity: false,
    cueSounds: ["kick", "snare", "kick", "snare"],
  },
  {
    id: "break-go-down",
    callBar: 6,
    responseBar: 7,
    subdivision: 16,
    callTicks: [0, 4, 11, 14],
    targetTicks: [0, 4, 10, 12, 14],
    targetStrengths: [0.96, 0.9, 0.72, 0.9, 0.78],
    optionalStyleTicks: [6],
    choreographyId: "go-down-a",
    section: "transition-down",
    difficulty: 2,
    phraseEnding: true,
    freezeOpportunity: false,
    cueSounds: ["kick", "snare", "kick", "snare", "kick"],
  },
  {
    id: "six-step-open",
    callBar: 8,
    responseBar: 9,
    subdivision: 16,
    callTicks: [0, 4, 7, 9, 12, 13],
    targetTicks: [0, 4, 7, 10, 12],
    targetStrengths: [1, 0.9, 0.78, 0.82, 0.96],
    optionalStyleTicks: [2, 14],
    choreographyId: "six-step-a",
    section: "floorwork",
    difficulty: 2,
    phraseEnding: false,
    freezeOpportunity: false,
    cueSounds: ["scratch", "snare", "kick", "kick", "snare"],
  },
  {
    id: "six-step-sync",
    callBar: 10,
    responseBar: 11,
    subdivision: 16,
    callTicks: [0, 4, 6, 8, 11, 12, 14],
    targetTicks: [0, 3, 4, 8, 10, 12, 14],
    targetStrengths: [1, 0.76, 0.9, 0.7, 0.84, 0.95, 0.8],
    optionalStyleTicks: [6],
    choreographyId: "six-step-b",
    section: "floorwork-syncopation",
    difficulty: 3,
    phraseEnding: true,
    freezeOpportunity: false,
    cueSounds: ["scratch", "kick", "snare", "hat", "kick", "snare", "kick"],
  },
  {
    id: "windmill-scissor",
    callBar: 12,
    responseBar: 13,
    subdivision: 16,
    callTicks: [0, 4, 7, 9, 12, 13],
    targetTicks: [0, 4, 7, 10, 12],
    targetStrengths: [1, 0.9, 0.84, 0.88, 1],
    optionalStyleTicks: [14],
    choreographyId: "windmill-a",
    section: "power",
    difficulty: 3,
    phraseEnding: false,
    freezeOpportunity: false,
    cueSounds: ["stab", "snare", "kick", "kick", "snare"],
  },
  {
    id: "power-to-freeze",
    callBar: 14,
    responseBar: 15,
    subdivision: 16,
    callTicks: [0, 4, 6, 8, 11, 12],
    targetTicks: [0, 4, 8, 12, 14],
    targetStrengths: [1, 0.94, 1, 1, 0.86],
    optionalStyleTicks: [6, 10],
    choreographyId: "windmill-freeze",
    section: "phrase-peak",
    difficulty: 3,
    phraseEnding: true,
    freezeOpportunity: true,
    cueSounds: ["kick", "snare", "scratch", "snare", "kick"],
  },
]);

export const DEFAULT_BEATMAP = deepFreeze({
  schemaVersion: 2,
  id: "moonBlockParty",
  title: "Moon Block Party",
  bpm: 100,
  offsetSeconds: 0.084,
  beatsPerBar: 4,
  ticksPerBar: 16,
  barsPerPhrase: 4,
  loopBars: 16,
  sections: [
    { id: "countIn", startBar: 0, endBar: 1, intensity: 0.35 },
    { id: "pocketA", startBar: 1, endBar: 5, intensity: 0.62 },
    { id: "break", startBar: 5, endBar: 7, intensity: 0.42 },
    { id: "pocketB", startBar: 7, endBar: 13, intensity: 0.8 },
    { id: "finale", startBar: 13, endBar: 16, intensity: 1 },
  ],
  patterns: DEFAULT_MEASURE_PATTERNS,
  finale: {
    bar: 16,
    choreographyId: "baby-freeze-resolution",
    freezeTick: 0,
    holdTicks: 8,
    getUpTick: 8,
    victoryTick: 14,
  },
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
  if (Number(value.schemaVersion ?? 1) >= 2 && Number(value.ticksPerBar) !== 16) {
    errors.push("Beatmap v2 requires sixteen ticks per bar.");
  }
  if (Number(value.schemaVersion ?? 1) >= 2 && !(value.patterns?.length > 0)) {
    errors.push("Beatmap v2 requires authored measure patterns.");
  }
  for (const section of value.sections ?? []) {
    if (!section.id || !(section.endBar > section.startBar)) {
      errors.push("Every section needs an id and increasing bar bounds.");
    }
  }
  const patternIds = new Set();
  for (const pattern of value.patterns ?? []) {
    if (!pattern.id || patternIds.has(pattern.id)) errors.push("Every measure pattern needs a unique id.");
    patternIds.add(pattern.id);
    if (!(pattern.callBar > 0) || !(pattern.responseBar > pattern.callBar)) {
      errors.push(`${pattern.id ?? "Pattern"} needs an ordered call/response bar.`);
    }
    if (pattern.responseBar !== pattern.callBar + 1) {
      errors.push(`${pattern.id ?? "Pattern"} response must be the next bar.`);
    }
    if (pattern.subdivision !== 16) {
      errors.push(`${pattern.id ?? "Pattern"} subdivision must be sixteen.`);
    }
    for (const field of ["callTicks", "targetTicks", "optionalStyleTicks"]) {
      if (!(pattern[field] ?? []).every((tick) => Number.isInteger(tick) && tick >= 0 && tick < 16)) {
        errors.push(`${pattern.id ?? "Pattern"} has invalid ${field}.`);
      }
      if (new Set(pattern[field] ?? []).size !== (pattern[field] ?? []).length) {
        errors.push(`${pattern.id ?? "Pattern"} has duplicate ${field}.`);
      }
    }
    if ((pattern.targetStrengths ?? []).length !== (pattern.targetTicks ?? []).length) {
      errors.push(`${pattern.id ?? "Pattern"} needs one strength per target.`);
    }
    if (!(pattern.targetStrengths ?? []).every(
      (strength) => Number.isFinite(strength) && strength >= 0 && strength <= 1,
    )) {
      errors.push(`${pattern.id ?? "Pattern"} has invalid target strength.`);
    }
    if (!pattern.choreographyId) errors.push(`${pattern.id ?? "Pattern"} needs choreographyId.`);
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

export function patternForBar(bar, beatmap = DEFAULT_BEATMAP) {
  const oneBased = Number(bar);
  return (beatmap.patterns ?? []).find(
    (pattern) => pattern.callBar === oneBased || pattern.responseBar === oneBased,
  ) ?? null;
}

export function tickInBar(beat, beatmap = DEFAULT_BEATMAP) {
  const beatsPerBar = beatmap.beatsPerBar ?? 4;
  const ticksPerBar = beatmap.ticksPerBar ?? 16;
  const beatWithinBar = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  return beatWithinBar / beatsPerBar * ticksPerBar;
}
