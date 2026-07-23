import { clamp, distance } from "../core/math.js";

export function solveTwoBone(start, target, upperLength, lowerLength, {
  bend = 1,
  minimumReach = 0.01,
} = {}) {
  const origin = point(start);
  const desired = point(target);
  const upper = Math.max(0.01, Number(upperLength) || 0);
  const lower = Math.max(0.01, Number(lowerLength) || 0);
  const dx = desired.x - origin.x;
  const dy = desired.y - origin.y;
  const rawDistance = Math.hypot(dx, dy);
  const maxReach = Math.max(minimumReach, upper + lower - 0.001);
  const minReach = Math.max(minimumReach, Math.abs(upper - lower) + 0.001);
  const solvedDistance = clamp(rawDistance, minReach, maxReach);
  const baseAngle = rawDistance > 1e-8 ? Math.atan2(dy, dx) : 0;
  const cosOffset = clamp(
    (upper ** 2 + solvedDistance ** 2 - lower ** 2) / (2 * upper * solvedDistance),
    -1,
    1,
  );
  const offset = Math.acos(cosOffset) * (Math.sign(bend) || 1);
  const jointAngle = baseAngle + offset;
  const joint = {
    x: origin.x + Math.cos(jointAngle) * upper,
    y: origin.y + Math.sin(jointAngle) * upper,
  };
  const solvedTarget = {
    x: origin.x + Math.cos(baseAngle) * solvedDistance,
    y: origin.y + Math.sin(baseAngle) * solvedDistance,
  };
  return Object.freeze({
    start: origin,
    joint,
    end: solvedTarget,
    desired,
    error: distance(solvedTarget, desired),
    clamped: Math.abs(solvedDistance - rawDistance) > 1e-5,
    reachRatio: rawDistance / maxReach,
  });
}

export function rotatePoint(pointValue, angle, origin = { x: 0, y: 0 }) {
  const source = point(pointValue);
  const center = point(origin);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dx = source.x - center.x;
  const dy = source.y - center.y;
  return {
    x: center.x + dx * cosine - dy * sine,
    y: center.y + dx * sine + dy * cosine,
  };
}

export function point(value) {
  if (Array.isArray(value)) return { x: Number(value[0]) || 0, y: Number(value[1]) || 0 };
  return { x: Number(value?.x) || 0, y: Number(value?.y) || 0 };
}
