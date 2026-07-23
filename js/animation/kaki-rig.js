import { clamp, distance } from "../core/math.js";
import { getCharacterProfile } from "./character-profiles.js";
import { mirrorPose } from "./pose-timeline.js";
import { point, rotatePoint, solveTwoBone } from "./ik.js";

const BODY_CONTACTS = Object.freeze(["head", "back", "leftShoulder", "rightShoulder"]);
const BONE_TOLERANCE = 1e-6;

export function solveCharacterRig(character, sourcePose, contactState, options = {}) {
  return solveBipedRig(
    getCharacterProfile(character),
    sourcePose,
    contactState,
    options,
  );
}

export function solveBipedRig(profile, sourcePose, contactState, {
  mirror = false,
  balance = 0,
  wobble = 0,
  previousRig = null,
  debugAssertions = false,
} = {}) {
  const pose = mirror ? mirrorPose(sourcePose) : clonePose(sourcePose);
  const skeleton = profile.skeleton;
  const contactMap = new Map(
    (contactState?.contacts ?? []).map((entry) => [entry.limb, entry.anchor]),
  );
  const squash = clamp(pose.squash, 0, 1);
  const stretch = clamp(pose.stretch, 0, 1);
  const bodyAngle = finiteNumber(pose.bodyAngle);
  const pelvisAngle = finiteNumber(pose.pelvisAngle, bodyAngle * 0.62);
  const chestAngle = finiteNumber(pose.chestAngle, bodyAngle);

  let pelvis = point(pose.root);
  pelvis.x += balance * 2.2;
  pelvis.y += Math.abs(wobble) * 0.55;
  const spineLength = skeleton.torsoLength * (1 - squash * 0.1 + stretch * 0.08);
  const chestVector = rotatePoint(
    {
      x: finiteNumber(pose.chestShift),
      y: -spineLength,
    },
    bodyAngle,
  );
  let chest = add(pelvis, chestVector);
  let shoulders = shoulderPoints(chest, chestAngle, skeleton.shoulderSpread, squash);
  let hips = hipPoints(pelvis, pelvisAngle, skeleton.hipSpread);
  const headFollow = clamp(pose.headFollow, 0, 1);
  const headVector = rotatePoint({
    x: pose.headOffset?.[0] ?? 0,
    y: (pose.headOffset?.[1] ?? -14) + squash * 1.35,
  }, bodyAngle * headFollow);
  let head = add(chest, headVector);
  let neck = pointBetween(chest, head, clamp(skeleton.neckLength / Math.max(1, distance(chest, head)), 0.08, 0.45));

  const bodyCorrection = resolveBodyContactCorrection({
    pelvis,
    chest,
    head,
    shoulders,
  }, contactMap);
  if (bodyCorrection) {
    ({ pelvis, chest, head, neck, shoulders, hips } = translateBody(
      { pelvis, chest, head, neck, shoulders, hips },
      bodyCorrection,
    ));
  }

  const handTargets = {
    left: contactMap.get("leftPaw") ?? point(pose.leftPaw),
    right: contactMap.get("rightPaw") ?? point(pose.rightPaw),
  };
  const footTargets = {
    left: contactMap.get("leftFoot") ?? point(pose.leftFoot),
    right: contactMap.get("rightFoot") ?? point(pose.rightFoot),
  };
  const handAngles = {
    left: finiteNumber(pose.leftHandAngle, Math.PI),
    right: finiteNumber(pose.rightHandAngle, 0),
  };
  const footAngles = {
    left: finiteNumber(pose.leftFootAngle, -0.1),
    right: finiteNumber(pose.rightFootAngle, 0.1),
  };
  const handDirections = {
    left: angleVector(handAngles.left),
    right: angleVector(handAngles.right),
  };
  const footDirections = {
    left: angleVector(footAngles.left),
    right: angleVector(footAngles.right),
  };
  let wristTargets = {
    left: subtract(handTargets.left, multiply(handDirections.left, skeleton.handLength)),
    right: subtract(handTargets.right, multiply(handDirections.right, skeleton.handLength)),
  };
  let ankleTargets = {
    left: subtract(footTargets.left, multiply(footDirections.left, skeleton.footLength * 0.42)),
    right: subtract(footTargets.right, multiply(footDirections.right, skeleton.footLength * 0.42)),
  };

  // Contacts own truth. If a fixed-length limb cannot reach, translate the
  // shared body mass toward the active supports instead of stretching a bone.
  if (!bodyCorrection) {
    const reachCorrection = solveRootReach({
      shoulders,
      hips,
      wristTargets,
      ankleTargets,
      contactMap,
      skeleton,
    });
    if (reachCorrection.x || reachCorrection.y) {
      ({ pelvis, chest, head, neck, shoulders, hips } = translateBody(
        { pelvis, chest, head, neck, shoulders, hips },
        reachCorrection,
      ));
    }
  }

  // Recompute endpoint targets after root adjustment. Their world-space
  // contact anchors remain unchanged.
  wristTargets = {
    left: subtract(handTargets.left, multiply(handDirections.left, skeleton.handLength)),
    right: subtract(handTargets.right, multiply(handDirections.right, skeleton.handLength)),
  };
  ankleTargets = {
    left: subtract(footTargets.left, multiply(footDirections.left, skeleton.footLength * 0.42)),
    right: subtract(footTargets.right, multiply(footDirections.right, skeleton.footLength * 0.42)),
  };

  const bendPreferences = {
    leftArm: signedPreference(pose.leftArmBend, profile.bendPreferences.leftArm),
    rightArm: signedPreference(pose.rightArmBend, profile.bendPreferences.rightArm),
    leftLeg: signedPreference(pose.leftLegBend, profile.bendPreferences.leftLeg),
    rightLeg: signedPreference(pose.rightLegBend, profile.bendPreferences.rightLeg),
  };
  const leftArm = solveTwoBone(
    shoulders.left,
    wristTargets.left,
    skeleton.upperArmLength,
    skeleton.forearmLength,
    limbOptions({
      bend: bendPreferences.leftArm,
      previousJoint: previousRig?.anchors?.leftElbow,
      previousBendSign: previousRig?.limbs?.leftArm?.bendSign,
      allowFlip: pose.leftArmFlip,
      limits: skeleton.elbowLimits,
    }),
  );
  const rightArm = solveTwoBone(
    shoulders.right,
    wristTargets.right,
    skeleton.upperArmLength,
    skeleton.forearmLength,
    limbOptions({
      bend: bendPreferences.rightArm,
      previousJoint: previousRig?.anchors?.rightElbow,
      previousBendSign: previousRig?.limbs?.rightArm?.bendSign,
      allowFlip: pose.rightArmFlip,
      limits: skeleton.elbowLimits,
    }),
  );
  const leftLeg = solveTwoBone(
    hips.left,
    ankleTargets.left,
    skeleton.thighLength,
    skeleton.shinLength,
    limbOptions({
      bend: bendPreferences.leftLeg,
      previousJoint: previousRig?.anchors?.leftKnee,
      previousBendSign: previousRig?.limbs?.leftLeg?.bendSign,
      allowFlip: pose.leftLegFlip,
      limits: skeleton.kneeLimits,
    }),
  );
  const rightLeg = solveTwoBone(
    hips.right,
    ankleTargets.right,
    skeleton.thighLength,
    skeleton.shinLength,
    limbOptions({
      bend: bendPreferences.rightLeg,
      previousJoint: previousRig?.anchors?.rightKnee,
      previousBendSign: previousRig?.limbs?.rightLeg?.bendSign,
      allowFlip: pose.rightLegFlip,
      limits: skeleton.kneeLimits,
    }),
  );

  const leftHand = add(leftArm.end, multiply(handDirections.left, skeleton.handLength));
  const rightHand = add(rightArm.end, multiply(handDirections.right, skeleton.handLength));
  const leftFoot = add(leftLeg.end, multiply(footDirections.left, skeleton.footLength * 0.42));
  const rightFoot = add(rightLeg.end, multiply(footDirections.right, skeleton.footLength * 0.42));
  const headAngle = bodyAngle * 0.22 + finiteNumber(pose.headAngle) - wobble * 0.07;
  const headScale = clamp(pose.headScale, 0.68, 1.12);
  const earSpread = (6.25 + finiteNumber(pose.earFlutter) * 0.65) * headScale;
  const tailBase = rotateAround(add(pelvis, { x: -3.4, y: -0.7 }), pelvis, pelvisAngle);
  const tailLength = profile.id === "soder" ? 10.6 : 11.6 + stretch * 1.6;
  const tailAngle = finiteNumber(pose.tailAngle, -0.4) + pelvisAngle + Math.PI;
  const tailTip = {
    x: tailBase.x + Math.cos(tailAngle) * tailLength,
    y: tailBase.y + Math.sin(tailAngle) * tailLength,
  };
  const centerOfMass = {
    x: pelvis.x * 0.46 + chest.x * 0.34 + head.x * 0.2,
    y: pelvis.y * 0.46 + chest.y * 0.34 + head.y * 0.2,
  };
  const anchors = Object.freeze({
    root: pelvis,
    pelvis,
    chest,
    neck,
    head,
    leftEar: rotateAround(
      { x: head.x - earSpread, y: head.y - 5.1 * headScale },
      head,
      headAngle,
    ),
    rightEar: rotateAround(
      { x: head.x + earSpread, y: head.y - 5.1 * headScale },
      head,
      headAngle,
    ),
    tailBase,
    tailTip,
    costumeTailBase: tailBase,
    costumeTailTip: tailTip,
    leftShoulder: shoulders.left,
    rightShoulder: shoulders.right,
    leftElbow: leftArm.joint,
    rightElbow: rightArm.joint,
    leftWrist: leftArm.end,
    rightWrist: rightArm.end,
    leftHand,
    rightHand,
    leftPaw: leftHand,
    rightPaw: rightHand,
    leftHip: hips.left,
    rightHip: hips.right,
    leftKnee: leftLeg.joint,
    rightKnee: rightLeg.joint,
    leftAnkle: leftLeg.end,
    rightAnkle: rightLeg.end,
    leftFoot,
    rightFoot,
    back: pointBetween(pelvis, chest, 0.52),
  });
  const limbs = Object.freeze({ leftArm, rightArm, leftLeg, rightLeg });
  const boneMetrics = measureBones(anchors, skeleton);
  const warnings = validateBipedGeometry({ anchors, limbs, boneMetrics });
  if (debugAssertions) {
    console.assert(
      warnings.length === 0,
      `BipedRig geometry warning: ${warnings.join("; ")}`,
    );
  }
  const contactError = largestContactError(anchors, contactMap);
  return Object.freeze({
    topology: "biped",
    profileId: profile.id,
    anchors,
    limbs,
    boneLengths: Object.freeze({
      upperArm: skeleton.upperArmLength,
      forearm: skeleton.forearmLength,
      thigh: skeleton.thighLength,
      shin: skeleton.shinLength,
    }),
    boneMetrics,
    maxBoneLengthError: boneMetrics.maxError,
    warnings: Object.freeze(warnings),
    centerOfMass,
    headScale,
    headAngle,
    bodyAngle,
    pelvisAngle,
    chestAngle,
    handAngles: Object.freeze(handAngles),
    footAngles: Object.freeze(footAngles),
    squash,
    stretch,
    costumeBounce: squash * profile.secondaryMotion.costumeBounce + Math.abs(wobble) * 0.18,
    expression: pose.expression,
    depthFront: pose.depthFront,
    smear: pose.smear,
    contactError,
    finite: warnings.every((warning) => !warning.startsWith("non-finite")),
  });
}

export function validateBipedGeometry(rigOrParts, tolerance = BONE_TOLERANCE) {
  const anchors = rigOrParts?.anchors ?? {};
  const limbs = rigOrParts?.limbs ?? {};
  const boneMetrics = rigOrParts?.boneMetrics ?? { entries: [] };
  const warnings = [];
  for (const [name, value] of Object.entries(anchors)) {
    if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) {
      warnings.push(`non-finite anchor ${name}`);
    }
  }
  for (const [name, limb] of Object.entries(limbs)) {
    if (!limb?.finite) warnings.push(`non-finite limb ${name}`);
    if (limb?.boneLengthError > tolerance) {
      warnings.push(`${name} length drift ${limb.boneLengthError}`);
    }
    const [minimum, maximum] = limb?.jointLimits ?? [0, Math.PI];
    if (limb?.interiorAngle < minimum - tolerance || limb?.interiorAngle > maximum + tolerance) {
      warnings.push(`${name} joint limit ${limb.interiorAngle}`);
    }
  }
  for (const entry of boneMetrics.entries ?? []) {
    if (entry.error > tolerance) warnings.push(`${entry.id} length drift ${entry.error}`);
  }
  return warnings;
}

function resolveBodyContactCorrection(body, contactMap) {
  const provisional = {
    head: body.head,
    back: pointBetween(body.pelvis, body.chest, 0.52),
    leftShoulder: body.shoulders.left,
    rightShoulder: body.shoulders.right,
  };
  const corrections = [];
  for (const limb of BODY_CONTACTS) {
    const target = contactMap.get(limb);
    const actual = provisional[limb];
    if (!target || !actual) continue;
    corrections.push({ x: target.x - actual.x, y: target.y - actual.y });
  }
  return corrections.length ? average(corrections) : null;
}

function solveRootReach({
  shoulders,
  hips,
  wristTargets,
  ankleTargets,
  contactMap,
  skeleton,
}) {
  let correction = { x: 0, y: 0 };
  let workingShoulders = { ...shoulders };
  let workingHips = { ...hips };
  const armBounds = reachBounds(
    skeleton.upperArmLength,
    skeleton.forearmLength,
    skeleton.elbowLimits,
  );
  const legBounds = reachBounds(
    skeleton.thighLength,
    skeleton.shinLength,
    skeleton.kneeLimits,
  );
  for (let iteration = 0; iteration < 96; iteration += 1) {
    const constraints = [];
    if (contactMap.has("leftPaw")) {
      addReachConstraint(constraints, workingShoulders.left, wristTargets.left, armBounds);
    }
    if (contactMap.has("rightPaw")) {
      addReachConstraint(constraints, workingShoulders.right, wristTargets.right, armBounds);
    }
    if (contactMap.has("leftFoot")) {
      addReachConstraint(constraints, workingHips.left, ankleTargets.left, legBounds);
    }
    if (contactMap.has("rightFoot")) {
      addReachConstraint(constraints, workingHips.right, ankleTargets.right, legBounds);
    }
    if (!constraints.length) break;
    const step = limitVector(average(constraints), 1.25);
    const remaining = 24 - Math.hypot(correction.x, correction.y);
    if (remaining <= 1e-5) break;
    const limited = limitVector(step, remaining);
    correction = add(correction, limited);
    workingShoulders = {
      left: add(workingShoulders.left, limited),
      right: add(workingShoulders.right, limited),
    };
    workingHips = {
      left: add(workingHips.left, limited),
      right: add(workingHips.right, limited),
    };
  }
  return correction;
}

function addReachConstraint(collection, start, target, bounds) {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-8) {
    collection.push({ x: -bounds.min, y: 0 });
    return;
  }
  const direction = { x: dx / length, y: dy / length };
  if (length > bounds.max - 0.001) {
    collection.push(multiply(direction, length - bounds.max + 0.002));
  } else if (length < bounds.min + 0.001) {
    collection.push(multiply(direction, -(bounds.min - length + 0.002)));
  }
}

function reachBounds(upper, lower, limits) {
  return {
    min: triangleReach(upper, lower, limits[0]) + 0.001,
    max: triangleReach(upper, lower, limits[1]) - 0.001,
  };
}

function limbOptions({ bend, previousJoint, previousBendSign, allowFlip, limits }) {
  return {
    bend,
    previousJoint,
    previousBendSign,
    allowFlip: Boolean(allowFlip),
    minJointAngle: limits[0],
    maxJointAngle: limits[1],
  };
}

function shoulderPoints(chest, angle, spread, squash = 0) {
  const adjustedSpread = spread - squash * 0.55;
  return {
    left: rotateAround(
      { x: chest.x - adjustedSpread, y: chest.y + 0.7 },
      chest,
      angle,
    ),
    right: rotateAround(
      { x: chest.x + adjustedSpread, y: chest.y + 0.7 },
      chest,
      angle,
    ),
  };
}

function hipPoints(pelvis, angle, spread) {
  return {
    left: rotateAround({ x: pelvis.x - spread, y: pelvis.y }, pelvis, angle),
    right: rotateAround({ x: pelvis.x + spread, y: pelvis.y }, pelvis, angle),
  };
}

function translateBody(body, correction) {
  return {
    pelvis: add(body.pelvis, correction),
    chest: add(body.chest, correction),
    head: add(body.head, correction),
    neck: add(body.neck, correction),
    shoulders: {
      left: add(body.shoulders.left, correction),
      right: add(body.shoulders.right, correction),
    },
    hips: {
      left: add(body.hips.left, correction),
      right: add(body.hips.right, correction),
    },
  };
}

function measureBones(anchors, skeleton) {
  const definitions = [
    ["leftUpperArm", "leftShoulder", "leftElbow", skeleton.upperArmLength],
    ["leftForearm", "leftElbow", "leftWrist", skeleton.forearmLength],
    ["rightUpperArm", "rightShoulder", "rightElbow", skeleton.upperArmLength],
    ["rightForearm", "rightElbow", "rightWrist", skeleton.forearmLength],
    ["leftThigh", "leftHip", "leftKnee", skeleton.thighLength],
    ["leftShin", "leftKnee", "leftAnkle", skeleton.shinLength],
    ["rightThigh", "rightHip", "rightKnee", skeleton.thighLength],
    ["rightShin", "rightKnee", "rightAnkle", skeleton.shinLength],
  ];
  const entries = definitions.map(([id, from, to, expected]) => {
    const measured = distance(anchors[from], anchors[to]);
    return Object.freeze({
      id,
      from,
      to,
      expected,
      measured,
      error: Math.abs(measured - expected),
    });
  });
  return Object.freeze({
    entries: Object.freeze(entries),
    maxError: Math.max(...entries.map((entry) => entry.error), 0),
  });
}

function largestContactError(anchors, contactMap) {
  let largest = 0;
  for (const [limb, target] of contactMap.entries()) {
    const actual = anchors[limb];
    if (actual) largest = Math.max(largest, distance(actual, target));
  }
  return largest;
}

function triangleReach(upper, lower, angle) {
  return Math.sqrt(Math.max(
    0,
    upper ** 2 + lower ** 2 - 2 * upper * lower * Math.cos(angle),
  ));
}

function signedPreference(value, fallback) {
  const sign = Math.sign(Number(value));
  return sign || Math.sign(fallback) || 1;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function angleVector(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function rotateAround(value, origin, angle) {
  return rotatePoint(value, angle, origin);
}

function pointBetween(a, b, amount) {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
  };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function multiply(value, amount) {
  return { x: value.x * amount, y: value.y * amount };
}

function average(values) {
  return values.reduce((sum, value) => ({
    x: sum.x + value.x / values.length,
    y: sum.y + value.y / values.length,
  }), { x: 0, y: 0 });
}

function limitVector(value, maximum) {
  const length = Math.hypot(value.x, value.y);
  if (length <= maximum || length <= 1e-8) return value;
  return multiply(value, maximum / length);
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
