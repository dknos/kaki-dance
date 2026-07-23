import { deepFreeze } from "../core/math.js";

function pose(overrides = {}) {
  return {
    root: [0, -20],
    bodyAngle: 0,
    headOffset: [0, -14],
    headAngle: 0,
    leftPaw: [-10, -16],
    rightPaw: [10, -16],
    leftFoot: [-6, 0],
    rightFoot: [6, 0],
    squash: 0,
    stretch: 0,
    earFlutter: 0,
    tailAngle: -0.4,
    depthFront: "right",
    expression: "focus",
    smear: 0,
    ...overrides,
  };
}

function frame(at, value, label = "") {
  return { at, pose: pose(value), label };
}

function clip(cadence, frames) {
  return { cadence, frames };
}

function topRockClip({ sway = 4, kick = 5, cross = 3, angle = 0.12 } = {}) {
  return clip(15, [
    frame(0, { expression: "bright" }, "pocket"),
    frame(0.24, {
      root: [-sway, -20],
      bodyAngle: -angle,
      leftPaw: [-13, -12],
      rightPaw: [8, -19],
      leftFoot: [-7, 0],
      rightFoot: [cross, -2],
      tailAngle: -0.72,
    }, "left-rock"),
    frame(0.5, {
      root: [0, -21],
      bodyAngle: angle,
      leftPaw: [-7, -20],
      rightPaw: [12, -12],
      leftFoot: [-cross, -1],
      rightFoot: [kick, 0],
      earFlutter: 0.7,
      expression: "bright",
    }, "cross"),
    frame(0.75, {
      root: [sway, -20],
      bodyAngle: angle,
      leftPaw: [-8, -13],
      rightPaw: [14, -19],
      leftFoot: [-kick, 0],
      rightFoot: [7, 0],
      tailAngle: -0.18,
    }, "right-rock"),
    frame(1, { expression: "bright" }, "pocket"),
  ]);
}

function floorworkClip({ reach = 13, tuck = 7, spin = 0, low = false } = {}) {
  const rootY = low ? -9 : -11;
  return clip(20, [
    frame(0, {
      root: [0, rootY],
      bodyAngle: -0.26,
      headOffset: [1, -13],
      leftPaw: [-reach, 0],
      rightPaw: [reach - 3, -2],
      leftFoot: [-tuck, 0],
      rightFoot: [reach, 0],
      depthFront: "right",
    }, "plant"),
    frame(0.25, {
      root: [2, rootY - 1],
      bodyAngle: 0.18 + spin,
      headOffset: [-1, -12],
      leftPaw: [-reach + 2, -1],
      rightPaw: [reach, 0],
      leftFoot: [-reach, 0],
      rightFoot: [tuck, -3],
      tailAngle: 0.3,
      depthFront: "left",
    }, "thread"),
    frame(0.5, {
      root: [0, rootY],
      bodyAngle: 0.42 + spin,
      headOffset: [0, -12],
      leftPaw: [-reach, 0],
      rightPaw: [reach, 0],
      leftFoot: [tuck, -4],
      rightFoot: [-reach, 0],
      squash: 0.3,
      depthFront: "right",
    }, "switch"),
    frame(0.75, {
      root: [-2, rootY - 1],
      bodyAngle: -0.18 + spin,
      headOffset: [1, -13],
      leftPaw: [-reach, 0],
      rightPaw: [reach - 2, -1],
      leftFoot: [reach, 0],
      rightFoot: [-tuck, -3],
      tailAngle: -0.8,
      depthFront: "left",
    }, "circle"),
    frame(1, {
      root: [0, rootY],
      bodyAngle: -0.26,
      headOffset: [1, -13],
      leftPaw: [-reach, 0],
      rightPaw: [reach - 3, -2],
      leftFoot: [-tuck, 0],
      rightFoot: [reach, 0],
    }, "plant"),
  ]);
}

function powerClip({ lift = 6, spread = 18, tilt = 0, head = false } = {}) {
  return clip(30, [
    frame(0, {
      root: [0, -8 - lift],
      bodyAngle: tilt,
      headOffset: [0, -12],
      leftPaw: [-spread, -1],
      rightPaw: [spread, -1],
      leftFoot: [-spread, -4],
      rightFoot: [spread, -4],
      smear: 0.2,
      expression: "focus",
    }, "catch"),
    frame(0.22, {
      root: [2, -10 - lift],
      bodyAngle: 1.35 + tilt,
      headOffset: head ? [0, -10] : [2, -12],
      leftPaw: [-8, -8],
      rightPaw: [spread, 0],
      leftFoot: [-spread, -1],
      rightFoot: [8, -12],
      stretch: 0.5,
      smear: 0.8,
      depthFront: "left",
    }, "sweep"),
    frame(0.5, {
      root: [0, -11 - lift],
      bodyAngle: Math.PI + tilt,
      headOffset: head ? [0, 10] : [0, -11],
      leftPaw: [spread, -2],
      rightPaw: [-spread, -2],
      leftFoot: [spread, -5],
      rightFoot: [-spread, -5],
      earFlutter: 1,
      smear: 1,
      expression: "wide",
    }, "flight"),
    frame(0.76, {
      root: [-2, -10 - lift],
      bodyAngle: 4.72 + tilt,
      headOffset: head ? [0, -10] : [-2, -12],
      leftPaw: [-spread, 0],
      rightPaw: [8, -8],
      leftFoot: [-8, -12],
      rightFoot: [spread, -1],
      stretch: 0.5,
      smear: 0.8,
      depthFront: "right",
    }, "handoff"),
    frame(1, {
      root: [0, -8 - lift],
      bodyAngle: Math.PI * 2 + tilt,
      headOffset: [0, -12],
      leftPaw: [-spread, -1],
      rightPaw: [spread, -1],
      leftFoot: [-spread, -4],
      rightFoot: [spread, -4],
      smear: 0.2,
      expression: "bright",
    }, "catch"),
  ]);
}

function freezeClip({ angle = 0.55, height = -12, legs = "tuck", head = false } = {}) {
  const extended = legs === "split";
  return clip(12, [
    frame(0, {
      root: [0, -9],
      bodyAngle: angle * 0.45,
      headOffset: [0, -12],
      leftPaw: [-9, 0],
      rightPaw: [8, -1],
      leftFoot: [-11, 0],
      rightFoot: [11, -2],
      squash: 0.5,
      expression: "focus",
    }, "catch"),
    frame(0.2, {
      root: [1, height],
      bodyAngle: angle,
      headOffset: head ? [0, 11] : [1, -12],
      leftPaw: [-9, 0],
      rightPaw: [8, 0],
      leftFoot: extended ? [-18, -12] : [-5, -14],
      rightFoot: extended ? [18, -15] : [8, -11],
      stretch: 0.5,
      earFlutter: 0.5,
      expression: "wide",
    }, "lock"),
    frame(0.5, {
      root: [0, height - 1],
      bodyAngle: angle - 0.04,
      headOffset: head ? [0, 11] : [0, -13],
      leftPaw: [-9, 0],
      rightPaw: [8, 0],
      leftFoot: extended ? [-19, -13] : [-5, -15],
      rightFoot: extended ? [19, -14] : [8, -12],
      expression: "bright",
    }, "hold"),
    frame(0.8, {
      root: [1, height],
      bodyAngle: angle + 0.03,
      headOffset: head ? [0, 11] : [1, -12],
      leftPaw: [-9, 0],
      rightPaw: [8, 0],
      leftFoot: extended ? [-18, -12] : [-5, -14],
      rightFoot: extended ? [18, -15] : [8, -11],
      expression: "focus",
    }, "breathe"),
    frame(1, {
      root: [0, height - 1],
      bodyAngle: angle,
      headOffset: head ? [0, 11] : [0, -13],
      leftPaw: [-9, 0],
      rightPaw: [8, 0],
      leftFoot: extended ? [-19, -13] : [-5, -15],
      rightFoot: extended ? [19, -14] : [8, -12],
      expression: "bright",
    }, "hold"),
  ]);
}

export const MOVE_CLIPS = deepFreeze({
  basicRock: topRockClip({ sway: 4, kick: 7, cross: 4, angle: 0.12 }),
  indianStep: topRockClip({ sway: 5, kick: 9, cross: -2, angle: 0.18 }),
  kickStep: topRockClip({ sway: 3, kick: 14, cross: 2, angle: 0.1 }),
  crossStep: topRockClip({ sway: 5, kick: 6, cross: -7, angle: 0.22 }),
  salsaStep: topRockClip({ sway: 6, kick: 10, cross: 6, angle: 0.28 }),

  basicGoDown: clip(20, [
    frame(0, { expression: "focus" }, "listen"),
    frame(0.26, {
      root: [0, -15],
      bodyAngle: -0.18,
      leftPaw: [-12, -10],
      rightPaw: [12, -11],
      leftFoot: [-7, 0],
      rightFoot: [8, 0],
      squash: 0.6,
    }, "drop"),
    frame(0.58, {
      root: [-2, -10],
      bodyAngle: -0.46,
      headOffset: [2, -12],
      leftPaw: [-12, 0],
      rightPaw: [10, -5],
      leftFoot: [-6, -2],
      rightFoot: [13, 0],
      earFlutter: 0.6,
    }, "plant"),
    frame(1, {
      root: [0, -10],
      bodyAngle: -0.24,
      headOffset: [1, -13],
      leftPaw: [-13, 0],
      rightPaw: [11, -1],
      leftFoot: [-7, 0],
      rightFoot: [13, 0],
      expression: "bright",
    }, "floor"),
  ]),
  kneeDrop: clip(15, [
    frame(0, { root: [0, -20] }, "listen"),
    frame(0.35, { root: [2, -14], bodyAngle: 0.25, leftPaw: [-12, -10], rightPaw: [12, -16], leftFoot: [-8, 0], rightFoot: [7, -1] }, "fold"),
    frame(0.62, { root: [1, -9], bodyAngle: 0.42, leftPaw: [-10, -3], rightPaw: [12, -7], leftFoot: [-12, 0], rightFoot: [5, 0], squash: 0.7 }, "knee"),
    frame(1, { root: [0, -10], bodyAngle: -0.2, leftPaw: [-13, 0], rightPaw: [11, -2], leftFoot: [-7, 0], rightFoot: [13, 0] }, "floor"),
  ]),
  sweepDown: clip(20, [
    frame(0, {}, "listen"),
    frame(0.3, { root: [-2, -14], bodyAngle: -0.4, leftPaw: [-14, 0], rightPaw: [10, -8], leftFoot: [-8, 0], rightFoot: [13, -2] }, "plant"),
    frame(0.65, { root: [2, -9], bodyAngle: 0.55, leftPaw: [-13, 0], rightPaw: [14, -1], leftFoot: [14, 0], rightFoot: [-14, 0], smear: 0.8 }, "sweep"),
    frame(1, { root: [0, -10], bodyAngle: -0.24, leftPaw: [-13, 0], rightPaw: [11, -1], leftFoot: [-7, 0], rightFoot: [13, 0] }, "floor"),
  ]),
  spinDown: clip(20, [
    frame(0, {}, "spot"),
    frame(0.28, { root: [0, -15], bodyAngle: 1.3, leftPaw: [-13, -8], rightPaw: [13, -8], leftFoot: [-8, 0], rightFoot: [9, 0], smear: 0.5 }, "turn"),
    frame(0.62, { root: [0, -10], bodyAngle: 3.4, leftPaw: [-13, 0], rightPaw: [12, -3], leftFoot: [-12, 0], rightFoot: [12, 0], smear: 0.9 }, "drop"),
    frame(1, { root: [0, -10], bodyAngle: Math.PI * 2 - 0.2, leftPaw: [-13, 0], rightPaw: [11, -1], leftFoot: [-7, 0], rightFoot: [13, 0] }, "floor"),
  ]),
  cleanGetUp: clip(20, [
    frame(0, { root: [0, -10], bodyAngle: -0.24, leftPaw: [-13, 0], rightPaw: [11, -1], leftFoot: [-7, 0], rightFoot: [13, 0] }, "floor"),
    frame(0.24, { root: [2, -12], bodyAngle: 0.42, leftPaw: [-9, -6], rightPaw: [13, 0], leftFoot: [-12, 0], rightFoot: [8, -1], squash: 0.5 }, "push"),
    frame(0.56, { root: [0, -17], bodyAngle: -0.2, leftPaw: [-13, -12], rightPaw: [11, -14], leftFoot: [-7, 0], rightFoot: [8, 0], stretch: 0.7 }, "rise"),
    frame(0.82, { root: [0, -22], bodyAngle: 0.08, leftPaw: [-12, -20], rightPaw: [12, -20], leftFoot: [-6, 0], rightFoot: [6, 0], earFlutter: 0.8, expression: "bright" }, "pop"),
    frame(1, { expression: "bright" }, "ready"),
  ]),

  twoStep: floorworkClip({ reach: 12, tuck: 6, low: false }),
  threeStep: floorworkClip({ reach: 14, tuck: 5, spin: 0.12, low: true }),
  sixStep: clip(20, [
    frame(0, { root: [0, -10], bodyAngle: -0.24, leftPaw: [-13, 0], rightPaw: [10, -2], leftFoot: [-7, 0], rightFoot: [14, 0] }, "one"),
    frame(0.16, { root: [2, -10], bodyAngle: 0.08, leftPaw: [-13, 0], rightPaw: [12, 0], leftFoot: [-14, 0], rightFoot: [8, -4], depthFront: "left" }, "two"),
    frame(0.33, { root: [1, -9], bodyAngle: 0.34, leftPaw: [-11, -1], rightPaw: [13, 0], leftFoot: [-8, -4], rightFoot: [-14, 0], tailAngle: 0.35 }, "three"),
    frame(0.5, { root: [0, -9], bodyAngle: 0.48, leftPaw: [-13, 0], rightPaw: [13, 0], leftFoot: [9, -4], rightFoot: [-9, -4], squash: 0.25, depthFront: "right" }, "four"),
    frame(0.66, { root: [-2, -10], bodyAngle: 0.08, leftPaw: [-13, 0], rightPaw: [11, -1], leftFoot: [14, 0], rightFoot: [-8, -4], tailAngle: -0.9 }, "five"),
    frame(0.83, { root: [-1, -10], bodyAngle: -0.3, leftPaw: [-13, 0], rightPaw: [10, -2], leftFoot: [8, -4], rightFoot: [14, 0], depthFront: "left" }, "six"),
    frame(1, { root: [0, -10], bodyAngle: -0.24, leftPaw: [-13, 0], rightPaw: [10, -2], leftFoot: [-7, 0], rightFoot: [14, 0], expression: "bright" }, "one"),
  ]),
  cc: floorworkClip({ reach: 16, tuck: 5, spin: -0.22, low: true }),
  sweep: floorworkClip({ reach: 18, tuck: 4, spin: 0.38, low: true }),
  coffeeGrinder: powerClip({ lift: 0, spread: 18, tilt: 0.3 }),

  backspin: powerClip({ lift: 0, spread: 15, tilt: 1.15 }),
  swipe: powerClip({ lift: 5, spread: 18, tilt: -0.25 }),
  windmill: powerClip({ lift: 2, spread: 19, tilt: 0.55 }),
  flare: powerClip({ lift: 8, spread: 21, tilt: -0.12 }),
  headspin: powerClip({ lift: 12, spread: 17, tilt: Math.PI, head: true }),

  babyFreeze: freezeClip({ angle: 1.12, height: -8, legs: "tuck" }),
  chairFreeze: freezeClip({ angle: -1.02, height: -9, legs: "split" }),
  turtleFreeze: freezeClip({ angle: 0.16, height: -7, legs: "split" }),
  headstandFreeze: freezeClip({ angle: Math.PI, height: -18, legs: "split", head: true }),
});

export const DEFAULT_POSE = deepFreeze(pose());
