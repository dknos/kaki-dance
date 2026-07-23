import { clamp, lerp, positiveModulo, shortestAngleDelta } from "../core/math.js";
import { DEFAULT_POSE } from "./move-clips.js";

const BRIDGE_ANGLE_KEYS = new Set([
  "bodyAngle",
  "pelvisAngle",
  "chestAngle",
  "headAngle",
  "tailAngle",
  "leftHandAngle",
  "rightHandAngle",
  "leftFootAngle",
  "rightFootAngle",
]);

export function samplePoseTimeline(clip, phase, {
  bpm = 100,
  durationBeats = 2,
  reducedMotion = false,
  sampleCadence = clip?.cadence ?? 15,
} = {}) {
  if (!clip?.frames?.length) return { pose: cloneValue(DEFAULT_POSE), label: "idle", sampledPhase: 0 };
  const normalized = clamp(phase, 0, 1);
  const durationSeconds = Math.max(0.05, durationBeats * 60 / bpm);
  const cadence = reducedMotion ? Math.min(12, sampleCadence) : sampleCadence;
  const drawingCount = Math.max(1, Math.round(durationSeconds * cadence));
  const sampledPhase = normalized >= 1
    ? 1
    : Math.floor(normalized * drawingCount + 1e-8) / drawingCount;

  let from = clip.frames[0];
  let to = clip.frames.at(-1);
  for (let index = 1; index < clip.frames.length; index += 1) {
    if (sampledPhase <= clip.frames[index].at) {
      from = clip.frames[index - 1];
      to = clip.frames[index];
      break;
    }
  }
  const span = to.at - from.at;
  const amount = span > 0 ? clamp((sampledPhase - from.at) / span, 0, 1) : 0;
  const sampled = interpolateTimelineValue(from.pose, to.pose, amount);
  if (reducedMotion) {
    sampled.smear = 0;
    sampled.earFlutter *= 0.35;
  }
  return {
    pose: sampled,
    label: amount < 0.5 ? from.label : to.label,
    sampledPhase,
  };
}

export function mirrorPose(source) {
  const pose = cloneValue(source);
  pose.root[0] *= -1;
  pose.bodyAngle *= -1;
  pose.pelvisAngle *= -1;
  pose.chestAngle *= -1;
  pose.chestShift *= -1;
  pose.headOffset[0] *= -1;
  pose.headAngle *= -1;
  pose.tailAngle *= -1;
  const leftPaw = mirrorPoint(source.rightPaw);
  const rightPaw = mirrorPoint(source.leftPaw);
  const leftFoot = mirrorPoint(source.rightFoot);
  const rightFoot = mirrorPoint(source.leftFoot);
  pose.leftPaw = leftPaw;
  pose.rightPaw = rightPaw;
  pose.leftFoot = leftFoot;
  pose.rightFoot = rightFoot;
  pose.leftHandAngle = mirrorAngle(source.rightHandAngle);
  pose.rightHandAngle = mirrorAngle(source.leftHandAngle);
  pose.leftFootAngle = mirrorAngle(source.rightFootAngle);
  pose.rightFootAngle = mirrorAngle(source.leftFootAngle);
  pose.leftArmBend = -(source.rightArmBend ?? 1);
  pose.rightArmBend = -(source.leftArmBend ?? -1);
  pose.leftLegBend = -(source.rightLegBend ?? -1);
  pose.rightLegBend = -(source.leftLegBend ?? 1);
  pose.leftArmFlip = source.rightArmFlip ?? 0;
  pose.rightArmFlip = source.leftArmFlip ?? 0;
  pose.leftLegFlip = source.rightLegFlip ?? 0;
  pose.rightLegFlip = source.leftLegFlip ?? 0;
  pose.depthFront = source.depthFront === "left" ? "right" : "left";
  return pose;
}

export function phaseWithinWindow(phase, windows = []) {
  const normalized = positiveModulo(phase, 1);
  return windows.some(([start, end]) => normalized + 1e-8 >= start && normalized - 1e-8 <= end);
}

export function blendPoses(from, to, amount) {
  const normalized = clamp(amount, 0, 1);
  const eased = normalized * normalized * (3 - 2 * normalized);
  return interpolateBridgeValue(from, to, eased);
}

export function createPoseBridge(from, to, {
  drawings = 5,
  preserveBendUntil = 0.72,
} = {}) {
  return Object.freeze({
    from: cloneValue(from),
    to: cloneValue(to),
    drawings: Math.max(2, Math.round(drawings)),
    preserveBendUntil: clamp(preserveBendUntil, 0.5, 0.95),
  });
}

export function samplePoseBridge(bridge, progress) {
  if (!bridge) return cloneValue(DEFAULT_POSE);
  const normalized = clamp(progress, 0, 1);
  const sampled = normalized >= 1
    ? 1
    : Math.floor(normalized * bridge.drawings + 1e-8) / bridge.drawings;
  const eased = sampled * sampled * (3 - 2 * sampled);
  return interpolateBridgeValue(
    bridge.from,
    bridge.to,
    eased,
    "",
    bridge.preserveBendUntil,
  );
}

function interpolateTimelineValue(from, to, amount) {
  if (typeof from === "number" && typeof to === "number") return lerp(from, to, amount);
  if (Array.isArray(from) && Array.isArray(to)) {
    return from.map((value, index) => interpolateTimelineValue(value, to[index] ?? value, amount));
  }
  if (from && to && typeof from === "object" && typeof to === "object") {
    const result = {};
    for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
      result[key] = interpolateTimelineValue(from[key], to[key], amount);
    }
    return result;
  }
  return amount < 0.5 ? cloneValue(from) : cloneValue(to);
}

function interpolateBridgeValue(from, to, amount, key = "", preserveBendUntil = 0.72) {
  if (typeof from === "number" && typeof to === "number") {
    if (BRIDGE_ANGLE_KEYS.has(key)) {
      return from + shortestAngleDelta(from, to) * amount;
    }
    if (key.endsWith("Bend")) return amount < preserveBendUntil ? from : to;
    if (key.endsWith("Flip")) return amount < 0.5 ? from : to;
    return lerp(from, to, amount);
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    return from.map((value, index) => interpolateBridgeValue(
      value,
      to[index] ?? value,
      amount,
      key,
      preserveBendUntil,
    ));
  }
  if (from && to && typeof from === "object" && typeof to === "object") {
    const result = {};
    for (const childKey of new Set([...Object.keys(from), ...Object.keys(to)])) {
      result[childKey] = interpolateBridgeValue(
        from[childKey],
        to[childKey],
        amount,
        childKey,
        preserveBendUntil,
      );
    }
    return result;
  }
  return amount < 0.5 ? cloneValue(from) : cloneValue(to);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }
  return value;
}

function mirrorPoint(point = [0, 0]) {
  return [-(point[0] ?? 0), point[1] ?? 0];
}

function mirrorAngle(angle = 0) {
  return Math.PI - angle;
}
