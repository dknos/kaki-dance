import { clamp, distance } from "../core/math.js";

export function solveTwoBone(start, target, upperLength, lowerLength, {
  bend = 1,
  pole = null,
  previousJoint = null,
  previousBendSign = 0,
  allowFlip = false,
  minJointAngle = 0.08,
  maxJointAngle = Math.PI - 0.04,
  minimumReach = 0.01,
} = {}) {
  const origin = point(start);
  const desired = point(target);
  const upper = Math.max(0.01, Number(upperLength) || 0);
  const lower = Math.max(0.01, Number(lowerLength) || 0);
  const dx = desired.x - origin.x;
  const dy = desired.y - origin.y;
  const rawDistance = Math.hypot(dx, dy);
  const safeMinimumAngle = clamp(minJointAngle, 0.001, Math.PI - 0.002);
  const safeMaximumAngle = clamp(maxJointAngle, safeMinimumAngle + 0.001, Math.PI - 0.001);
  const distanceAtMinimumAngle = triangleReach(upper, lower, safeMinimumAngle);
  const distanceAtMaximumAngle = triangleReach(upper, lower, safeMaximumAngle);
  const maxReach = Math.max(
    minimumReach,
    Math.min(upper + lower - 0.001, distanceAtMaximumAngle),
  );
  const minReach = Math.min(
    maxReach,
    Math.max(minimumReach, Math.abs(upper - lower) + 0.001, distanceAtMinimumAngle),
  );
  const solvedDistance = clamp(rawDistance, minReach, maxReach);
  const fallbackDirection = pole
    ? Math.atan2(point(pole).y - origin.y, point(pole).x - origin.x)
    : 0;
  const baseAngle = rawDistance > 1e-8 ? Math.atan2(dy, dx) : fallbackDirection;
  const cosOffset = clamp(
    (upper ** 2 + solvedDistance ** 2 - lower ** 2) / (2 * upper * solvedDistance),
    -1,
    1,
  );
  const authoredSign = Math.sign(bend) || 1;
  const poleSign = bendSide(origin, desired, pole);
  const geometricPreviousSign = bendSide(origin, desired, previousJoint);
  const previousSign = Math.sign(previousBendSign) || geometricPreviousSign;
  let bendSign = poleSign || authoredSign;
  if (previousSign && !allowFlip) bendSign = previousSign;
  const offset = Math.acos(cosOffset) * bendSign;
  const jointAngle = baseAngle + offset;
  const joint = {
    x: origin.x + Math.cos(jointAngle) * upper,
    y: origin.y + Math.sin(jointAngle) * upper,
  };
  const solvedTarget = {
    x: origin.x + Math.cos(baseAngle) * solvedDistance,
    y: origin.y + Math.sin(baseAngle) * solvedDistance,
  };
  const upperMeasured = distance(origin, joint);
  const lowerMeasured = distance(joint, solvedTarget);
  const interiorAngle = Math.acos(clamp(
    (upper ** 2 + lower ** 2 - solvedDistance ** 2) / (2 * upper * lower),
    -1,
    1,
  ));
  return Object.freeze({
    start: origin,
    joint,
    end: solvedTarget,
    desired,
    error: distance(solvedTarget, desired),
    clamped: Math.abs(solvedDistance - rawDistance) > 1e-5,
    reachRatio: rawDistance / maxReach,
    bendSign,
    previousBendSign: previousSign,
    flipped: Boolean(previousSign && previousSign !== bendSign),
    interiorAngle,
    jointLimits: Object.freeze([safeMinimumAngle, safeMaximumAngle]),
    upperLength: upper,
    lowerLength: lower,
    upperMeasured,
    lowerMeasured,
    boneLengthError: Math.max(
      Math.abs(upperMeasured - upper),
      Math.abs(lowerMeasured - lower),
    ),
    finite: [
      origin.x, origin.y, joint.x, joint.y, solvedTarget.x, solvedTarget.y,
    ].every(Number.isFinite),
  });
}

export function bendSide(start, target, joint) {
  if (!joint) return 0;
  const origin = point(start);
  const desired = point(target);
  const value = point(joint);
  const targetX = desired.x - origin.x;
  const targetY = desired.y - origin.y;
  const jointX = value.x - origin.x;
  const jointY = value.y - origin.y;
  const cross = targetX * jointY - targetY * jointX;
  return Math.abs(cross) <= 1e-7 ? 0 : Math.sign(cross);
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

function triangleReach(upper, lower, interiorAngle) {
  return Math.sqrt(Math.max(
    0,
    upper ** 2 + lower ** 2 - 2 * upper * lower * Math.cos(interiorAngle),
  ));
}
