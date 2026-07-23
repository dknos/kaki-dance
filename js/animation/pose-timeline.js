import { clamp, lerp, positiveModulo } from "../core/math.js";
import { DEFAULT_POSE } from "./move-clips.js";

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
  const sampled = interpolateValue(from.pose, to.pose, amount);
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
  return interpolateValue(from, to, eased);
}

function interpolateValue(from, to, amount) {
  if (typeof from === "number" && typeof to === "number") return lerp(from, to, amount);
  if (Array.isArray(from) && Array.isArray(to)) {
    return from.map((value, index) => interpolateValue(value, to[index] ?? value, amount));
  }
  if (from && to && typeof from === "object" && typeof to === "object") {
    const result = {};
    for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
      result[key] = interpolateValue(from[key], to[key], amount);
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
