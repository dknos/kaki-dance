import { clamp } from "../core/math.js";

export function createBalanceState() {
  return {
    offset: 0,
    velocity: 0,
    wobble: 0,
    failed: false,
    stableBeats: 0,
  };
}

export function resetBalance(state = createBalanceState()) {
  state.offset = 0;
  state.velocity = 0;
  state.wobble = 0;
  state.failed = false;
  state.stableBeats = 0;
  return state;
}

export function updateFreezeBalance(state, {
  dt,
  beatDelta = 0,
  inputX = 0,
  difficulty = 0.3,
  demand = 0.3,
  staminaRatio = 1,
  momentum = 0,
  phase = 0,
  supportWidth = 10,
} = {}) {
  if (state.failed) return state;
  const fatigue = 1 - clamp(staminaRatio, 0, 1);
  const instability = 0.42 + difficulty * 0.7 + demand * 0.8 + fatigue * 0.75 + Math.abs(momentum) * 0.08;
  const deterministicDrift = Math.sin(phase * Math.PI * 2 * (1.3 + difficulty)) * instability;
  const correction = clamp(inputX, -1, 1) * (2.4 - demand * 0.7) * (0.7 + staminaRatio * 0.3);
  state.velocity += (deterministicDrift - correction - state.offset * 1.25) * dt;
  state.velocity *= Math.pow(0.965, dt * 120);
  state.offset += state.velocity * dt * 9;
  const supportScale = clamp(supportWidth / 16, 0.35, 1.2);
  const limit = 1.08 * supportScale;
  state.wobble = clamp(Math.abs(state.offset) / limit, 0, 1.4);
  if (state.wobble < 0.42) state.stableBeats += Math.max(0, beatDelta);
  if (Math.abs(state.offset) > limit) state.failed = true;
  return state;
}

export function projectedBalancePosition(support, state) {
  const half = Math.max(1, support.width / 2);
  return support.center + state.offset * half;
}
