import { clamp } from "../core/math.js";

export const MAX_STAMINA = 100;

export function updateStamina(value, move, dt, {
  deliberateRest = false,
  intensity = 1,
  bpm = 100,
} = {}) {
  let rate = 0.9;
  if (move) {
    rate = -(Number(move.staminaDrainPerBeat) || 0) * (Math.max(1, Number(bpm) || 100) / 60) * intensity;
    if (move.family === "toprock" && move.staminaDrainPerBeat <= 0) rate = 3.6;
  }
  if (deliberateRest) rate += 5.2;
  return clamp(value + rate * dt, 0, MAX_STAMINA);
}

export function canAffordMove(value, move) {
  return Number(value) + 1e-8 >= (Number(move?.staminaCost) || 0);
}

export function spendStamina(value, move, multiplier = 1) {
  return clamp(value - (Number(move?.staminaCost) || 0) * multiplier, 0, MAX_STAMINA);
}

export function staminaControlScale(value) {
  const ratio = clamp(value / MAX_STAMINA, 0, 1);
  return 0.72 + ratio * 0.28;
}
