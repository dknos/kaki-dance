import { DEFAULT_SETTINGS } from "./config.js";

export const SAVE_KEY = "kaki-dance-save-v1";
export const SAVE_VERSION = 1;

export function createDefaultSave() {
  return {
    version: SAVE_VERSION,
    selectedCharacter: "kitty",
    settings: cloneSettings(DEFAULT_SETTINGS),
    records: {
      freestyleBest: 0,
      battleWins: 0,
      bestCrowdHeat: 0,
    },
    calibration: {
      completed: false,
      samples: [],
    },
  };
}

export function loadSave(storage = globalThis.localStorage ?? null) {
  const fallback = createDefaultSave();
  if (!storage?.getItem) return fallback;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return fallback;
    return migrateSave(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function saveGame(save, storage = globalThis.localStorage ?? null) {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(migrateSave(save)));
    return true;
  } catch {
    return false;
  }
}

export function migrateSave(value) {
  const fallback = createDefaultSave();
  if (!value || typeof value !== "object") return fallback;
  const bindings = {
    ...fallback.settings.bindings,
    ...(value.settings?.bindings && typeof value.settings.bindings === "object" ? value.settings.bindings : {}),
  };
  return {
    version: SAVE_VERSION,
    selectedCharacter: value.selectedCharacter === "soder" ? "soder" : "kitty",
    settings: {
      ...fallback.settings,
      ...(value.settings ?? {}),
      bindings,
      latencyMs: finiteClamp(value.settings?.latencyMs, -200, 200, 0),
      screenShake: finiteClamp(value.settings?.screenShake, 0, 1, 0.7),
      musicVolume: finiteClamp(value.settings?.musicVolume, 0, 1, 0.8),
      effectsVolume: finiteClamp(value.settings?.effectsVolume, 0, 1, 0.8),
      crowdVolume: finiteClamp(value.settings?.crowdVolume, 0, 1, 0.75),
    },
    records: {
      ...fallback.records,
      ...(value.records ?? {}),
    },
    calibration: {
      ...fallback.calibration,
      ...(value.calibration ?? {}),
      samples: Array.isArray(value.calibration?.samples)
        ? value.calibration.samples.filter(Number.isFinite).slice(-16)
        : [],
    },
  };
}

export function resolveStorage(storage) {
  if (storage === null) return null;
  if (storage === undefined) {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }
  return storage;
}

function cloneSettings(settings) {
  return { ...settings, bindings: { ...settings.bindings } };
}

function finiteClamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}
