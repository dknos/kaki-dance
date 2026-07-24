export const FROLIC_PPQ = 96;
export const FROLIC_BEATS_PER_BAR = 4;
export const FROLIC_RUN_BARS = 32;
export const FROLIC_COUNT_IN_BARS = 2;
export const FROLIC_TICKS_PER_BAR = FROLIC_PPQ * FROLIC_BEATS_PER_BAR;
export const FROLIC_RUN_TICKS = FROLIC_TICKS_PER_BAR * FROLIC_RUN_BARS;

export const FROLIC_STATES = Object.freeze({
  COUNT_IN: "COUNT_IN",
  OPEN_JAM: "OPEN_JAM",
  TRADE_CALL: "TRADE_CALL",
  TRADE_RESPONSE: "TRADE_RESPONSE",
  TURNAROUND: "TURNAROUND",
  BREAKDOWN: "BREAKDOWN",
  FINISH: "FINISH",
  RESULTS: "RESULTS",
});

const calls = [
  call("a2-call-1", 9, 10, [0, 96, 168, 240, 288], [0, 96, 240]),
  call("a2-call-2", 11, 12, [0, 72, 144, 192, 288, 336], [0, 192, 288]),
  call("a2-call-3", 13, 14, [0, 48, 120, 192, 264, 336], [0, 192, 336]),
  call("a2-turn-call", 15, 16, [0, 72, 144, 216, 288, 336], [0, 144, 288]),
  call("b2-call-1", 25, 26, [0, 48, 96, 192, 240, 336], [0, 192, 336]),
  call("b2-call-2", 27, 28, [0, 72, 120, 192, 264, 312], [0, 192, 312]),
  call("b2-call-3", 29, 30, [0, 48, 144, 192, 240, 336], [0, 192, 336]),
];

const accents = [];
for (let bar = 1; bar <= FROLIC_RUN_BARS; bar += 1) {
  for (let beat = 0; beat < FROLIC_BEATS_PER_BAR; beat += 1) {
    accents.push(Object.freeze({
      tick: (bar - 1) * FROLIC_TICKS_PER_BAR + beat * FROLIC_PPQ,
      strength: beat === 0 ? 1 : beat === 2 ? 0.78 : 0.48,
      label: beat === 0 ? "downbeat" : beat === 2 ? "backbeat" : "pulse",
    }));
  }
}
for (const bar of [8, 16, 24, 32]) {
  accents.push(Object.freeze({
    tick: bar * FROLIC_TICKS_PER_BAR - FROLIC_PPQ,
    strength: 1,
    label: bar === 32 ? "final-turnaround" : "turnaround",
  }));
}

export const APPALACHIAN_TUNE_MAP = deepFreeze({
  schemaVersion: 1,
  id: "board-and-bow",
  title: "Board & Bow",
  composer: "Kaki-Dance original",
  bpm: 120,
  meter: [4, 4],
  ppq: FROLIC_PPQ,
  beatsPerBar: FROLIC_BEATS_PER_BAR,
  ticksPerBar: FROLIC_TICKS_PER_BAR,
  barsPerPhrase: 8,
  loopBars: FROLIC_RUN_BARS,
  loop: false,
  countInBars: FROLIC_COUNT_IN_BARS,
  offsetSeconds: FROLIC_COUNT_IN_BARS * FROLIC_BEATS_PER_BAR * 60 / 120,
  form: "AABB",
  strains: [
    {
      id: "A1",
      startBar: 1,
      bars: 8,
      mode: "open-jam",
      turnaroundBar: 8,
      melody: "A",
    },
    {
      id: "A2",
      startBar: 9,
      bars: 8,
      mode: "trade",
      turnaroundBar: 16,
      melody: "A",
    },
    {
      id: "B1",
      startBar: 17,
      bars: 8,
      mode: "build",
      turnaroundBar: 24,
      melody: "B",
    },
    {
      id: "B2",
      startBar: 25,
      bars: 8,
      mode: "breakdown",
      turnaroundBar: 32,
      melody: "B",
    },
  ],
  sections: [
    { id: "A1", startBar: 0, endBar: 8, intensity: 0.52 },
    { id: "A2", startBar: 8, endBar: 16, intensity: 0.66 },
    { id: "B1", startBar: 16, endBar: 24, intensity: 0.78 },
    { id: "B2", startBar: 24, endBar: 32, intensity: 0.94 },
  ],
  calls,
  accents,
  difficultyLayers: {
    easy: {
      timingToleranceTicks: 28,
      acceptsExactEcho: true,
      variationBonus: 0,
      transitionAssist: true,
    },
    standard: {
      timingToleranceTicks: 20,
      acceptsExactEcho: true,
      variationBonus: 6,
      transitionAssist: true,
    },
    advanced: {
      timingToleranceTicks: 14,
      acceptsExactEcho: true,
      variationBonus: 12,
      transitionAssist: false,
    },
  },
  stemManifest: {
    master: "./assets/audio/frolic/board-and-bow.wav",
    fiddle: "./assets/audio/frolic/stems/board-and-bow-fiddle.wav",
    banjo: "./assets/audio/frolic/stems/board-and-bow-banjo.wav",
    guitar: "./assets/audio/frolic/stems/board-and-bow-guitar.wav",
    bass: "./assets/audio/frolic/stems/board-and-bow-bass.wav",
  },
  trackUrl: "./assets/audio/frolic/board-and-bow.wav",
});

export function validateAppalachianTuneMap(value) {
  const errors = [];
  if (!value || typeof value !== "object") return ["Tune map must be an object."];
  if (value.form !== "AABB") errors.push("Frolic tune form must be AABB.");
  if (value.ppq !== FROLIC_PPQ) errors.push(`Frolic tune must use ${FROLIC_PPQ} PPQ.`);
  if (value.bpm !== 120) errors.push("The MVP tune must run at 120 BPM.");
  if (value.meter?.[0] !== 4 || value.meter?.[1] !== 4) errors.push("The MVP tune must use 4/4.");
  if (value.strains?.length !== 4) errors.push("The tune needs four strains.");
  const expected = [
    ["A1", 1, 8, 8],
    ["A2", 9, 8, 16],
    ["B1", 17, 8, 24],
    ["B2", 25, 8, 32],
  ];
  expected.forEach(([id, startBar, bars, turnaroundBar], index) => {
    const strain = value.strains?.[index];
    if (
      strain?.id !== id
      || strain?.startBar !== startBar
      || strain?.bars !== bars
      || strain?.turnaroundBar !== turnaroundBar
    ) {
      errors.push(`Strain ${id} has the wrong AABB boundary.`);
    }
  });
  for (const valueCall of value.calls ?? []) {
    if (!(valueCall.responseBar === valueCall.callBar + 1)) {
      errors.push(`${valueCall.id} response must immediately follow its call.`);
    }
    if (!(valueCall.anchorTicks?.length > 0)) errors.push(`${valueCall.id} needs anchor ticks.`);
    for (const key of ["rhythmTicks", "anchorTicks", "complementTicks"]) {
      if (!(valueCall[key] ?? []).every(isTickInBar)) errors.push(`${valueCall.id} has invalid ${key}.`);
    }
  }
  return errors;
}

export function frolicStateAtTick(tick) {
  const numeric = Number(tick) || 0;
  if (numeric < 0) return FROLIC_STATES.COUNT_IN;
  if (numeric >= FROLIC_RUN_TICKS) return FROLIC_STATES.RESULTS;
  const bar = Math.floor(numeric / FROLIC_TICKS_PER_BAR) + 1;
  const local = positiveModulo(numeric, FROLIC_TICKS_PER_BAR);
  if (bar === 32) return FROLIC_STATES.FINISH;
  if ([8, 16, 24].includes(bar) && local >= FROLIC_TICKS_PER_BAR - FROLIC_PPQ) {
    return FROLIC_STATES.TURNAROUND;
  }
  if (bar <= 8) return FROLIC_STATES.OPEN_JAM;
  if (bar <= 16) return bar % 2 ? FROLIC_STATES.TRADE_CALL : FROLIC_STATES.TRADE_RESPONSE;
  if (bar <= 24) return FROLIC_STATES.OPEN_JAM;
  if (bar <= 30) return bar % 2 ? FROLIC_STATES.TRADE_CALL : FROLIC_STATES.TRADE_RESPONSE;
  return FROLIC_STATES.BREAKDOWN;
}

export function frolicStateAtBeat(beat) {
  return frolicStateAtTick(Number(beat) * FROLIC_PPQ);
}

export function strainAtTick(tick, tuneMap = APPALACHIAN_TUNE_MAP) {
  const bar = Math.min(FROLIC_RUN_BARS, Math.max(1, Math.floor(Math.max(0, tick) / FROLIC_TICKS_PER_BAR) + 1));
  return tuneMap.strains.find((strain) => bar >= strain.startBar && bar < strain.startBar + strain.bars)
    ?? tuneMap.strains.at(-1);
}

export function callAtTick(tick, tuneMap = APPALACHIAN_TUNE_MAP) {
  const bar = Math.floor(Math.max(0, Number(tick) || 0) / FROLIC_TICKS_PER_BAR) + 1;
  return tuneMap.calls.find((value) => value.callBar === bar || value.responseBar === bar) ?? null;
}

export function localTickInBar(tick) {
  return positiveModulo(Number(tick) || 0, FROLIC_TICKS_PER_BAR);
}

export function nearestPulseTick(tick, subdivision = FROLIC_PPQ / 2) {
  const size = Math.max(1, Number(subdivision) || FROLIC_PPQ / 2);
  return Math.round((Number(tick) || 0) / size) * size;
}

function call(id, callBar, responseBar, rhythmTicks, anchorTicks) {
  const complementTicks = rhythmTicks.map((tick) => positiveModulo(tick + FROLIC_PPQ / 2, FROLIC_TICKS_PER_BAR));
  return Object.freeze({
    id,
    callBar,
    responseBar,
    rhythmTicks: Object.freeze([...rhythmTicks]),
    anchorTicks: Object.freeze([...anchorTicks]),
    complementTicks: Object.freeze(complementTicks),
    instrument: callBar < 17 ? (callBar % 4 === 1 ? "fiddle" : "banjo") : "rival-board",
  });
}

function isTickInBar(tick) {
  return Number.isInteger(tick) && tick >= 0 && tick < FROLIC_TICKS_PER_BAR;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
