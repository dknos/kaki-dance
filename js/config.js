export const LOGICAL_WIDTH = 384;
export const LOGICAL_HEIGHT = 216;
export const FIXED_STEP = 1 / 120;
export const MAX_FRAME_DELTA = 0.1;
export const MAX_CATCH_UP_STEPS = 14;
export const GAME_VERSION = "0.1.0";

export const MODE_IDS = Object.freeze(["practice", "freestyle", "battle"]);
export const ROUND_BARS = Object.freeze({
  practice: 999,
  freestyle: 25,
  battle: 8,
});

export const COLORS = Object.freeze({
  midnight: "#11142d",
  night2: "#1c2143",
  lavender: "#8f86d9",
  moon: "#f5e9c9",
  persimmon: "#f46b45",
  mint: "#63d6b3",
  navy: "#17172f",
  ink: "#090b1b",
  chalk: "#fff5dc",
  denim: "#455f9a",
  raspberry: "#ce4772",
  gold: "#f4c95d",
});

export const TIMING_WINDOWS = Object.freeze({
  standard: Object.freeze({ perfect: 0.045, clean: 0.09, accepted: 0.15 }),
  wide: Object.freeze({ perfect: 0.06, clean: 0.12, accepted: 0.19 }),
  extra: Object.freeze({ perfect: 0.08, clean: 0.16, accepted: 0.24 }),
});

export const DEFAULT_SETTINGS = Object.freeze({
  controlMode: "simple",
  timingWindow: "standard",
  latencyMs: 0,
  reducedMotion: false,
  screenShake: 0.7,
  reduceFlashes: false,
  beatPulse: true,
  timingLabels: true,
  musicVolume: 0.8,
  effectsVolume: 0.8,
  crowdVolume: 0.75,
  masterMute: false,
  bindings: Object.freeze({
    left: "KeyA",
    right: "KeyD",
    up: "KeyW",
    down: "KeyS",
    action: "Space",
    style: "KeyF",
    power: "ShiftLeft",
    freeze: "KeyT",
  }),
});

export const STAGE = Object.freeze({
  id: "moonlitOekaki",
  displayName: "Moonlit Oekaki Block Party",
  floorCenterX: 192,
  floorCenterY: 163,
  floorRadiusX: 104,
  floorRadiusY: 34,
});
