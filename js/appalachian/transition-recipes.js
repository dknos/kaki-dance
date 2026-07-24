export const PERFORMANCE_TRANSITIONS = deepFreeze([
  recipe("neutral-step-left", "foundation", "foundation", "left", "walkingStep", 92),
  recipe("neutral-step-right", "foundation", "foundation", "right", "walkingStep", 92),
  recipe("step-cross-left", "foundation", "lick", "left", "recovery", 108),
  recipe("step-cross-right", "foundation", "lick", "right", "recovery", 108),
  recipe("step-brush-left", "foundation", "brush", "left", "shuffle", 96),
  recipe("step-brush-right", "foundation", "brush", "right", "shuffle", 96),
  recipe("brush-step-left", "brush", "foundation", "left", "walkingStep", 104),
  recipe("brush-step-right", "brush", "foundation", "right", "walkingStep", 104),
  recipe("brush-drive-left", "brush", "drive", "left", "recovery", 116),
  recipe("brush-drive-right", "brush", "drive", "right", "recovery", 116),
  recipe("drive-step-left", "drive", "foundation", "left", "walkingStep", 110),
  recipe("drive-step-right", "drive", "foundation", "right", "walkingStep", 110),
  recipe("rear-weight-left", "drive", "travel", "left", "recovery", 124),
  recipe("rear-weight-right", "drive", "travel", "right", "recovery", 124),
  recipe("slide-return-left", "travel", "foundation", "left", "slidingWalk", 118),
  recipe("slide-return-right", "travel", "foundation", "right", "slidingWalk", 118),
  recipe("cross-open-left", "lick", "foundation", "left", "recovery", 132),
  recipe("cross-open-right", "lick", "foundation", "right", "recovery", 132),
  recipe("turn-resolve-left", "lick", "lick", "left", "turnaround", 136),
  recipe("turn-resolve-right", "lick", "lick", "right", "turnaround", 136),
  recipe("landing-soft-left", "aerial", "foundation", "left", "recovery", 124),
  recipe("landing-soft-right", "aerial", "foundation", "right", "recovery", 124),
  recipe("balance-save-left", "recovery", "foundation", "left", "recovery", 138),
  recipe("balance-save-right", "recovery", "foundation", "right", "recovery", 138),
]);

export function transitionRecipeFor({
  fromFamily = "foundation",
  toFamily = "foundation",
  support = "left",
  landing = false,
  recovery = false,
} = {}) {
  const side = support === "right" ? "right" : "left";
  const candidates = PERFORMANCE_TRANSITIONS.filter((value) => (
    value.support === side
    && (landing ? value.fromFamily === "aerial" : true)
    && (recovery ? value.toFamily === "foundation" && value.clip === "recovery" : true)
  ));
  return candidates.find((value) => (
    value.fromFamily === fromFamily && value.toFamily === toFamily
  )) ?? candidates[0] ?? PERFORMANCE_TRANSITIONS[0];
}

export function validatePerformanceTransitions(values = PERFORMANCE_TRANSITIONS) {
  const errors = [];
  const ids = new Set();
  for (const value of values) {
    if (ids.has(value.id)) errors.push(`Duplicate transition ${value.id}.`);
    ids.add(value.id);
    if (!["left", "right"].includes(value.support)) errors.push(`${value.id} has invalid support.`);
    if (!(value.durationMs >= 80 && value.durationMs <= 140)) errors.push(`${value.id} exceeds the 80–140 ms handoff window.`);
    if (!(value.rootWarpLimitMeters >= 0 && value.rootWarpLimitMeters <= 0.18)) errors.push(`${value.id} root warp is unbounded.`);
    if (value.candidateStatus !== "CANDIDATE — HUMAN REVIEW REQUIRED") errors.push(`${value.id} lacks candidate status.`);
  }
  return errors;
}

function recipe(id, fromFamily, toFamily, support, clip, durationMs) {
  return {
    id,
    fromFamily,
    toFamily,
    support,
    clip,
    durationMs,
    rootWarpLimitMeters: 0.14,
    plantedFootLock: true,
    inertialBlend: true,
    source: `tools/blender/kaki-appalachian-frolic.blend#FrolicCandidate.${clip}`,
    candidateStatus: "CANDIDATE — HUMAN REVIEW REQUIRED",
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
