import { clamp } from "../core/math.js";

export const STYLE_ARM_LIMITS = Object.freeze({
  flatfoot: Object.freeze({
    amplitude: 0.66,
    shoulderDegrees: 74,
    elbowDegrees: 58,
    chestDegrees: 10,
    bodyLeanDegrees: 8,
  }),
  buck: Object.freeze({
    amplitude: 0.84,
    shoulderDegrees: 88,
    elbowDegrees: 68,
    chestDegrees: 13,
    bodyLeanDegrees: 11,
  }),
  clog: Object.freeze({
    amplitude: 1,
    shoulderDegrees: 104,
    elbowDegrees: 76,
    chestDegrees: 16,
    bodyLeanDegrees: 14,
  }),
});

export const ARM_POSE_POINTS = Object.freeze([
  Object.freeze({ id: "relaxed-low", point: Object.freeze([0, -0.18]) }),
  Object.freeze({ id: "hands-near-hips", point: Object.freeze([0, -1]) }),
  Object.freeze({ id: "open-low-left", point: Object.freeze([-1, -0.58]) }),
  Object.freeze({ id: "open-low-right", point: Object.freeze([1, -0.58]) }),
  Object.freeze({ id: "cross-body-left", point: Object.freeze([-1, 0.05]) }),
  Object.freeze({ id: "cross-body-right", point: Object.freeze([1, 0.05]) }),
  Object.freeze({ id: "diagonal-reach-left", point: Object.freeze([-0.72, 0.72]) }),
  Object.freeze({ id: "diagonal-reach-right", point: Object.freeze([0.72, 0.72]) }),
  Object.freeze({ id: "both-arms-high", point: Object.freeze([0, 1]) }),
]);

export function poseFieldWeights(x, y, points = ARM_POSE_POINTS) {
  const px = clamp(Number(x) || 0, -1, 1);
  const py = clamp(Number(y) || 0, -1, 1);
  const weighted = points.map((sample) => {
    const dx = px - sample.point[0];
    const dy = py - sample.point[1];
    const distanceSquared = dx * dx + dy * dy;
    return {
      id: sample.id,
      weight: Math.exp(-distanceSquared / 0.28),
      distanceSquared,
    };
  }).sort((left, right) => right.weight - left.weight);
  const active = weighted.slice(0, 4);
  const total = active.reduce((sum, value) => sum + value.weight, 0) || 1;
  return Object.freeze(active.map((value) => Object.freeze({
    id: value.id,
    weight: value.weight / total,
    distanceSquared: value.distanceSquared,
  })));
}

export function blendAuthoredPose(samples, x, y, style = "flatfoot") {
  const source = Array.isArray(samples) ? samples : [];
  const byId = new Map(source.map((value) => [value.id, value]));
  const weights = poseFieldWeights(x, y, source.length ? source : ARM_POSE_POINTS);
  const pose = {
    chest: [0, 0, 0],
    left: { upperArm: [0, 0, 0], forearm: [0, 0, 0], hand: [0, 0, 0] },
    right: { upperArm: [0, 0, 0], forearm: [0, 0, 0], hand: [0, 0, 0] },
  };
  for (const entry of weights) {
    const sample = byId.get(entry.id);
    if (!sample) continue;
    addWeighted(pose.chest, sample.chest, entry.weight);
    for (const side of ["left", "right"]) {
      addWeighted(pose[side].upperArm, sample[side]?.upperArm, entry.weight);
      addWeighted(pose[side].forearm, sample[side]?.forearm, entry.weight);
      addWeighted(pose[side].hand, sample[side]?.hand, entry.weight);
    }
  }
  const limits = STYLE_ARM_LIMITS[style] ?? STYLE_ARM_LIMITS.flatfoot;
  scaleAndClamp(pose.chest, limits.amplitude, limits.chestDegrees);
  for (const side of ["left", "right"]) {
    scaleAndClamp(pose[side].upperArm, limits.amplitude, limits.shoulderDegrees);
    scaleAndClamp(pose[side].forearm, limits.amplitude, limits.elbowDegrees);
    scaleAndClamp(pose[side].hand, limits.amplitude, 28);
  }
  return deepFreeze({ ...pose, weights });
}

export function bodyLineFromInput(x, y, style = "flatfoot") {
  const limits = STYLE_ARM_LIMITS[style] ?? STYLE_ARM_LIMITS.flatfoot;
  const nx = clamp(Number(x) || 0, -1, 1);
  const ny = clamp(Number(y) || 0, -1, 1);
  return Object.freeze({
    pelvisDegrees: Object.freeze([
      -ny * limits.bodyLeanDegrees * 0.42,
      0,
      -nx * limits.bodyLeanDegrees * 0.54,
    ]),
    chestDegrees: Object.freeze([
      -ny * limits.bodyLeanDegrees,
      nx * limits.bodyLeanDegrees * 0.24,
      -nx * limits.bodyLeanDegrees,
    ]),
    balance: clamp(1 - Math.hypot(nx, ny) * 0.16, 0.72, 1),
  });
}

export function validateAuthoredPose(pose, style = "flatfoot") {
  const limits = STYLE_ARM_LIMITS[style] ?? STYLE_ARM_LIMITS.flatfoot;
  const errors = [];
  if (!pose) return ["Missing authored arm pose."];
  for (const side of ["left", "right"]) {
    if (maxAbs(pose[side]?.upperArm) > limits.shoulderDegrees + 1e-6) {
      errors.push(`${side} shoulder exceeds ${limits.shoulderDegrees} degrees.`);
    }
    if (maxAbs(pose[side]?.forearm) > limits.elbowDegrees + 1e-6) {
      errors.push(`${side} elbow exceeds ${limits.elbowDegrees} degrees.`);
    }
  }
  if (maxAbs(pose.chest) > limits.chestDegrees + 1e-6) {
    errors.push(`Chest exceeds ${limits.chestDegrees} degrees.`);
  }
  const leftCross = Math.abs(pose.left?.upperArm?.[2] ?? 0);
  const rightCross = Math.abs(pose.right?.upperArm?.[2] ?? 0);
  const opposingCross = Math.sign(pose.left?.upperArm?.[2] ?? 0)
    === Math.sign(pose.right?.upperArm?.[2] ?? 0);
  if (opposingCross && leftCross + rightCross > limits.shoulderDegrees * 1.45) {
    errors.push("Authored arms enter the conservative torso self-intersection envelope.");
  }
  return errors;
}

export function smoothPoseVector(current, target, dt, response = 18) {
  const factor = 1 - Math.exp(-Math.max(0, Number(dt) || 0) * response);
  return Object.freeze({
    x: (Number(current?.x) || 0) + ((Number(target?.x) || 0) - (Number(current?.x) || 0)) * factor,
    y: (Number(current?.y) || 0) + ((Number(target?.y) || 0) - (Number(current?.y) || 0)) * factor,
  });
}

function addWeighted(target, source, weight) {
  for (let index = 0; index < 3; index += 1) {
    target[index] += (Number(source?.[index]) || 0) * weight;
  }
}

function scaleAndClamp(values, amplitude, maximum) {
  for (let index = 0; index < values.length; index += 1) {
    values[index] = clamp(values[index] * amplitude, -maximum, maximum);
  }
}

function maxAbs(values) {
  return Math.max(...(values ?? [0]).map((value) => Math.abs(Number(value) || 0)));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
