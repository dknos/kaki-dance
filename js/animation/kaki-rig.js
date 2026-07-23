import { clamp } from "../core/math.js";
import { mirrorPose } from "./pose-timeline.js";
import { point, rotatePoint, solveTwoBone } from "./ik.js";

const BODY_CONTACTS = new Set(["head", "back", "leftShoulder", "rightShoulder"]);

export function solveCharacterRig(character, sourcePose, contactState, options = {}) {
  return character?.rig === "soder"
    ? solveSoderRig(sourcePose, contactState, options)
    : solveKakiRig(sourcePose, contactState, options);
}

export function solveKakiRig(sourcePose, contactState, {
  mirror = false,
  balance = 0,
  wobble = 0,
} = {}) {
  const pose = mirror ? mirrorPose(sourcePose) : clonePose(sourcePose);
  const contactMap = new Map((contactState?.contacts ?? []).map((entry) => [entry.limb, entry.anchor]));
  const root = point(pose.root);
  root.x += balance * 2.2;
  root.y += Math.abs(wobble) * 0.7;
  const bodyAngle = pose.bodyAngle + wobble * 0.12;
  const squash = clamp(pose.squash, 0, 1);
  const stretch = clamp(pose.stretch, 0, 1);
  const chestOffset = rotatePoint({ x: 0, y: -7 - stretch * 1.5 + squash * 1.2 }, bodyAngle);
  let pelvis = { ...root };
  let chest = { x: root.x + chestOffset.x, y: root.y + chestOffset.y };
  let shoulders = shoulderPoints(chest, bodyAngle, squash);
  let hips = hipPoints(pelvis, bodyAngle);
  const rotatedHeadOffset = rotatePoint({
    x: pose.headOffset[0],
    y: pose.headOffset[1] + squash * 1.6,
  }, bodyAngle);
  let head = {
    x: chest.x + rotatedHeadOffset.x,
    y: chest.y + rotatedHeadOffset.y,
  };

  const provisional = {
    head,
    back: { x: (pelvis.x + chest.x) / 2, y: (pelvis.y + chest.y) / 2 },
    leftShoulder: shoulders.left,
    rightShoulder: shoulders.right,
  };
  const bodyCorrections = [];
  for (const limb of BODY_CONTACTS) {
    const target = contactMap.get(limb);
    const actual = provisional[limb];
    if (target && actual) bodyCorrections.push({ x: target.x - actual.x, y: target.y - actual.y });
  }
  if (bodyCorrections.length) {
    const correction = bodyCorrections.reduce((sum, value) => ({
      x: sum.x + value.x / bodyCorrections.length,
      y: sum.y + value.y / bodyCorrections.length,
    }), { x: 0, y: 0 });
    pelvis = add(pelvis, correction);
    chest = add(chest, correction);
    head = add(head, correction);
    shoulders = { left: add(shoulders.left, correction), right: add(shoulders.right, correction) };
    hips = { left: add(hips.left, correction), right: add(hips.right, correction) };
  }

  const leftPawTarget = contactMap.get("leftPaw") ?? point(pose.leftPaw);
  const rightPawTarget = contactMap.get("rightPaw") ?? point(pose.rightPaw);
  const leftFootTarget = contactMap.get("leftFoot") ?? point(pose.leftFoot);
  const rightFootTarget = contactMap.get("rightFoot") ?? point(pose.rightFoot);
  // Planted paws get a tiny authored plush stretch allowance. It is enough to
  // keep wide two-paw Swipe supports exact without changing the silhouette.
  const leftArmLengths = contactMap.has("leftPaw") ? [12.8, 12.8] : [9.5, 9.5];
  const rightArmLengths = contactMap.has("rightPaw") ? [12.8, 12.8] : [9.5, 9.5];
  const legLengths = [10.5, 10.5];

  // When a planted limb would exceed the authored maximum, move the plush
  // mass toward its support before solving. This keeps the contact exact and
  // makes the root visibly orbit the planted paw/foot during power moves.
  if (!bodyCorrections.length) {
    for (let iteration = 0; iteration < 64; iteration += 1) {
      const corrections = [];
      addReachCorrection(corrections, shoulders.left, contactMap.get("leftPaw"), leftArmLengths[0] + leftArmLengths[1]);
      addReachCorrection(corrections, shoulders.right, contactMap.get("rightPaw"), rightArmLengths[0] + rightArmLengths[1]);
      addReachCorrection(corrections, hips.left, contactMap.get("leftFoot"), legLengths[0] + legLengths[1]);
      addReachCorrection(corrections, hips.right, contactMap.get("rightFoot"), legLengths[0] + legLengths[1]);
      if (!corrections.length) break;
      const correction = averageCorrection(corrections);
      pelvis = add(pelvis, correction);
      chest = add(chest, correction);
      head = add(head, correction);
      shoulders = { left: add(shoulders.left, correction), right: add(shoulders.right, correction) };
      hips = { left: add(hips.left, correction), right: add(hips.right, correction) };
    }
  }

  const leftArm = solveTwoBone(shoulders.left, leftPawTarget, leftArmLengths[0], leftArmLengths[1], { bend: -1 });
  const rightArm = solveTwoBone(shoulders.right, rightPawTarget, rightArmLengths[0], rightArmLengths[1], { bend: 1 });
  const leftLeg = solveTwoBone(hips.left, leftFootTarget, legLengths[0], legLengths[1], { bend: 1 });
  const rightLeg = solveTwoBone(hips.right, rightFootTarget, legLengths[0], legLengths[1], { bend: -1 });
  const headAngle = bodyAngle * 0.28 + pose.headAngle - wobble * 0.08;
  const earSpread = 6.5 + pose.earFlutter * 0.8;
  const tailBase = rotateAround(add(pelvis, { x: -4, y: -1 }), pelvis, bodyAngle);
  const tailLength = 12 + stretch * 2;
  const tailTip = {
    x: tailBase.x + Math.cos(pose.tailAngle + bodyAngle + Math.PI) * tailLength,
    y: tailBase.y + Math.sin(pose.tailAngle + bodyAngle + Math.PI) * tailLength,
  };
  const centerOfMass = {
    x: pelvis.x * 0.48 + chest.x * 0.32 + head.x * 0.2,
    y: pelvis.y * 0.48 + chest.y * 0.32 + head.y * 0.2,
  };
  const anchors = Object.freeze({
    root: pelvis,
    pelvis,
    chest,
    head,
    leftEar: rotateAround({ x: head.x - earSpread, y: head.y - 5 }, head, headAngle),
    rightEar: rotateAround({ x: head.x + earSpread, y: head.y - 5 }, head, headAngle),
    tailBase,
    tailTip,
    leftShoulder: shoulders.left,
    rightShoulder: shoulders.right,
    leftElbow: leftArm.joint,
    rightElbow: rightArm.joint,
    leftPaw: leftArm.end,
    rightPaw: rightArm.end,
    leftHip: hips.left,
    rightHip: hips.right,
    leftKnee: leftLeg.joint,
    rightKnee: rightLeg.joint,
    leftFoot: leftLeg.end,
    rightFoot: rightLeg.end,
    back: { x: (pelvis.x + chest.x) / 2, y: (pelvis.y + chest.y) / 2 },
  });
  return Object.freeze({
    topology: "kaki",
    anchors,
    limbs: Object.freeze({ leftArm, rightArm, leftLeg, rightLeg }),
    centerOfMass,
    headAngle,
    bodyAngle,
    squash,
    stretch,
    expression: pose.expression,
    depthFront: pose.depthFront,
    smear: pose.smear,
    contactError: Math.max(leftArm.error, rightArm.error, leftLeg.error, rightLeg.error),
  });
}

/**
 * Soder has a dedicated coil topology. Shared move semantics feed a hood,
 * sleeve-paws, and a six-segment weighted coil; no cat pelvis/leg mesh is used.
 */
export function solveSoderRig(sourcePose, contactState, {
  mirror = false,
  balance = 0,
  wobble = 0,
} = {}) {
  const pose = mirror ? mirrorPose(sourcePose) : clonePose(sourcePose);
  const contactMap = new Map((contactState?.contacts ?? []).map((entry) => [entry.limb, entry.anchor]));
  let root = point(pose.root);
  root.x += balance * 2.5;
  const angle = pose.bodyAngle + wobble * 0.14;
  const leftPawTarget = contactMap.get("leftPaw") ?? point(pose.leftPaw);
  const rightPawTarget = contactMap.get("rightPaw") ?? point(pose.rightPaw);
  const hoodOffset = rotatePoint({
    x: pose.headOffset[0] * 0.7,
    y: pose.headOffset[1] - 4,
  }, angle * 0.7);
  let hood = {
    x: root.x + hoodOffset.x,
    y: root.y + hoodOffset.y,
  };
  let shoulders = shoulderPoints({ x: hood.x, y: hood.y + 8 }, angle * 0.45, pose.squash);
  const bodyTarget = contactMap.get("head")
    ? { actual: hood, target: contactMap.get("head") }
    : contactMap.get("leftShoulder")
      ? { actual: shoulders.left, target: contactMap.get("leftShoulder") }
      : contactMap.get("rightShoulder")
        ? { actual: shoulders.right, target: contactMap.get("rightShoulder") }
        : null;
  if (bodyTarget) {
    const correction = {
      x: bodyTarget.target.x - bodyTarget.actual.x,
      y: bodyTarget.target.y - bodyTarget.actual.y,
    };
    root = add(root, correction);
    hood = add(hood, correction);
    shoulders = shoulderPoints({ x: hood.x, y: hood.y + 8 }, angle * 0.45, pose.squash);
  } else {
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const corrections = [];
      addReachCorrection(corrections, shoulders.left, contactMap.get("leftPaw"), 23.2);
      addReachCorrection(corrections, shoulders.right, contactMap.get("rightPaw"), 23.2);
      if (!corrections.length) break;
      const correction = averageCorrection(corrections);
      root = add(root, correction);
      hood = add(hood, correction);
      shoulders = shoulderPoints({ x: hood.x, y: hood.y + 8 }, angle * 0.45, pose.squash);
    }
  }
  const leftArm = solveTwoBone(shoulders.left, leftPawTarget, 11.6, 11.6, { bend: -1 });
  const rightArm = solveTwoBone(shoulders.right, rightPawTarget, 11.6, 11.6, { bend: 1 });
  const coilTargets = [
    contactMap.get("back"),
    contactMap.get("leftFoot"),
    contactMap.get("rightFoot"),
  ].filter(Boolean);
  const coilTarget = coilTargets.length
    ? {
        x: coilTargets.reduce((sum, target) => sum + target.x, 0) / coilTargets.length,
        y: coilTargets.reduce((sum, target) => sum + target.y, 0) / coilTargets.length,
      }
    : { x: root.x, y: 0 };
  const coilSegments = [];
  const segmentCount = 7;
  for (let index = 0; index < segmentCount; index += 1) {
    const t = index / (segmentCount - 1);
    const curve = Math.sin(t * Math.PI * 1.35 + angle) * (5 + pose.smear * 2);
    coilSegments.push(Object.freeze({
      x: root.x * (1 - t) + coilTarget.x * t + curve,
      y: root.y * (1 - t) + coilTarget.y * t + Math.sin(t * Math.PI) * -3,
      radius: 5.3 - t * 1.8 + pose.squash * 0.5,
    }));
  }
  if (contactMap.has("back")) coilSegments[3] = Object.freeze({ ...contactMap.get("back"), radius: coilSegments[3].radius });
  if (contactMap.has("leftFoot")) coilSegments[segmentCount - 2] = Object.freeze({ ...contactMap.get("leftFoot"), radius: coilSegments[segmentCount - 2].radius });
  if (contactMap.has("rightFoot")) coilSegments[segmentCount - 1] = Object.freeze({ ...contactMap.get("rightFoot"), radius: coilSegments[segmentCount - 1].radius });
  const tailTip = coilSegments.at(-1);
  const centerOfMass = {
    x: (hood.x * 2 + root.x + coilSegments[3].x) / 4,
    y: (hood.y * 2 + root.y + coilSegments[3].y) / 4,
  };
  const anchors = Object.freeze({
    root,
    pelvis: root,
    chest: { x: hood.x, y: hood.y + 8 },
    head: contactMap.get("head") ?? hood,
    leftEar: { x: hood.x - 7, y: hood.y - 5 },
    rightEar: { x: hood.x + 7, y: hood.y - 5 },
    tailBase: root,
    tailTip,
    leftShoulder: contactMap.get("leftShoulder") ?? shoulders.left,
    rightShoulder: contactMap.get("rightShoulder") ?? shoulders.right,
    leftElbow: leftArm.joint,
    rightElbow: rightArm.joint,
    leftPaw: leftArm.end,
    rightPaw: rightArm.end,
    leftFoot: contactMap.get("leftFoot") ?? coilSegments.at(-2),
    rightFoot: contactMap.get("rightFoot") ?? tailTip,
    leftHip: root,
    rightHip: root,
    leftKnee: coilSegments.at(-2),
    rightKnee: coilSegments.at(-1),
    back: contactMap.get("back") ?? coilSegments[3],
  });
  return Object.freeze({
    topology: "soder",
    anchors,
    limbs: Object.freeze({ leftArm, rightArm }),
    coilSegments: Object.freeze(coilSegments),
    centerOfMass,
    headAngle: angle * 0.2 + pose.headAngle,
    bodyAngle: angle,
    squash: pose.squash,
    stretch: pose.stretch,
    expression: pose.expression,
    depthFront: pose.depthFront,
    smear: pose.smear,
    contactError: Math.max(leftArm.error, rightArm.error),
  });
}

function shoulderPoints(chest, angle, squash = 0) {
  const spread = 6.8 - squash * 0.7;
  return {
    left: rotateAround({ x: chest.x - spread, y: chest.y + 1 }, chest, angle),
    right: rotateAround({ x: chest.x + spread, y: chest.y + 1 }, chest, angle),
  };
}

function hipPoints(pelvis, angle) {
  return {
    left: rotateAround({ x: pelvis.x - 3.7, y: pelvis.y }, pelvis, angle),
    right: rotateAround({ x: pelvis.x + 3.7, y: pelvis.y }, pelvis, angle),
  };
}

function rotateAround(value, origin, angle) {
  return rotatePoint(value, angle, origin);
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function addReachCorrection(collection, start, target, maxReach) {
  if (!target) return;
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const length = Math.hypot(dx, dy);
  const excess = length - maxReach + 0.002;
  if (excess <= 0 || length < 1e-8) return;
  collection.push({ x: dx / length * excess, y: dy / length * excess });
}

function averageCorrection(corrections) {
  return corrections.reduce((sum, correction) => ({
    x: sum.x + correction.x / corrections.length,
    y: sum.y + correction.y / corrections.length,
  }), { x: 0, y: 0 });
}

function clonePose(pose) {
  return {
    ...pose,
    root: [...pose.root],
    headOffset: [...pose.headOffset],
    leftPaw: [...pose.leftPaw],
    rightPaw: [...pose.rightPaw],
    leftFoot: [...pose.leftFoot],
    rightFoot: [...pose.rightFoot],
  };
}
