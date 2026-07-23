import { getCharacterProfile } from "../animation/character-profiles.js";
import { drawPixelText } from "./pixel-font.js";
import {
  pixelEllipse,
  pixelLine,
  pixelRect,
  polygon,
  scalePoint,
} from "./primitives.js";

const DEBUG_JOINTS = Object.freeze([
  "pelvis", "chest", "neck", "head",
  "leftShoulder", "leftElbow", "leftWrist", "leftHand",
  "rightShoulder", "rightElbow", "rightWrist", "rightHand",
  "leftHip", "leftKnee", "leftAnkle", "leftFoot",
  "rightHip", "rightKnee", "rightAnkle", "rightFoot",
]);

const JOINT_LABELS = Object.freeze({
  pelvis: "P",
  chest: "C",
  neck: "N",
  head: "H",
  leftShoulder: "LS",
  leftElbow: "LE",
  leftWrist: "LW",
  leftHand: "LH",
  rightShoulder: "RS",
  rightElbow: "RE",
  rightWrist: "RW",
  rightHand: "RH",
  leftHip: "LHP",
  leftKnee: "LK",
  leftAnkle: "LA",
  leftFoot: "LF",
  rightHip: "RHP",
  rightKnee: "RK",
  rightAnkle: "RA",
  rightFoot: "RF",
});

export function drawDancer(ctx, dancerSnapshot, character, {
  x = 192,
  floorY = 158,
  scale = 1.45,
  alpha = 1,
  ghost = false,
  silhouette = false,
  debug = null,
} = {}) {
  const rig = dancerSnapshot?.rig;
  if (!rig) return;
  const profile = getCharacterProfile(character);
  const contacts = new Set(
    (dancerSnapshot.contacts?.contacts ?? []).map((contact) => contact.limb),
  );
  const paint = makePaint(profile, { ghost, silhouette });
  ctx.save();
  ctx.globalAlpha *= alpha;
  drawShadow(ctx, rig, x, floorY, scale, dancerSnapshot, silhouette);
  if (!silhouette && (dancerSnapshot.family === "power" || ghost)) {
    drawMotionArc(ctx, rig, x, floorY, scale, paint, ghost);
  }
  drawBiped(ctx, rig, profile, paint, contacts, x, floorY, scale);
  if (!silhouette && !ghost) {
    drawContactAccents(ctx, dancerSnapshot, x, floorY, scale, paint);
  }
  if (debug) {
    drawRigDebug(ctx, rig, dancerSnapshot.contacts, x, floorY, scale, debug);
  }
  ctx.restore();
}

function drawBiped(ctx, rig, profile, paint, contacts, x, floorY, scale) {
  const anchors = mapAnchors(rig.anchors, x, floorY, scale);
  const farSide = rig.depthFront === "left" ? "right" : "left";
  const nearSide = farSide === "left" ? "right" : "left";

  drawCostumeTail(ctx, anchors, rig, profile, paint, scale);
  drawArm(ctx, anchors, farSide, profile, paint, scale, contacts, 0.88);
  drawLeg(ctx, anchors, farSide, profile, paint, scale, contacts, 0.9);
  drawPelvis(ctx, anchors, rig, profile, paint, scale);
  drawLeg(ctx, anchors, nearSide, profile, paint, scale, contacts, 1);
  drawTorso(ctx, anchors, rig, profile, paint, scale);
  drawArm(ctx, anchors, nearSide, profile, paint, scale, contacts, 1);
  drawHead(ctx, anchors, rig, profile, paint, scale);

  for (const side of ["left", "right"]) {
    if (contacts.has(`${side}Paw`)) {
      drawHand(ctx, anchors, side, profile, paint, scale, true, 1);
    }
    if (contacts.has(`${side}Foot`)) {
      drawFoot(ctx, anchors, side, profile, paint, scale, true, 1);
    }
  }
}

function drawArm(ctx, a, side, profile, paint, scale, contacts, depthScale) {
  const shoulder = a[`${side}Shoulder`];
  const elbow = a[`${side}Elbow`];
  const wrist = a[`${side}Wrist`];
  const planted = contacts.has(`${side}Paw`);
  const upperWidths = profile.volumes.upperArm.map((value) => value * scale * depthScale);
  const forearmWidths = profile.volumes.forearm.map((value) => value * scale * depthScale);
  const soder = profile.id === "soder";
  const far = depthScale < 0.95;
  const upperColor = soder
    ? (far ? paint.torsoShade : paint.torso)
    : (far ? paint.furShade : paint.fur);
  const lowerColor = soder
    ? (far ? paint.torso : paint.torsoLight)
    : (far ? paint.furShade : paint.fur);

  drawTaperedVolume(ctx, shoulder, elbow, upperWidths[0], upperWidths[1], upperColor, paint.outline);
  if (!soder) {
    const sleeveEnd = interpolatePoint(shoulder, elbow, 0.28);
    drawTaperedVolume(
      ctx,
      shoulder,
      sleeveEnd,
      upperWidths[0] + 0.5,
      upperWidths[1] + 0.2,
      paint.torso,
      paint.outline,
    );
  }
  drawJointPatch(
    ctx,
    elbow,
    Math.max(2.1, upperWidths[1] * 0.58),
    soder ? paint.torsoShade : paint.furShade,
    paint.outline,
  );
  drawTaperedVolume(ctx, elbow, wrist, forearmWidths[0], forearmWidths[1], lowerColor, paint.outline);
  drawCuff(
    ctx,
    elbow,
    wrist,
    Math.max(2, profile.costume.cuffWidth * scale * depthScale),
    soder ? paint.cuff : paint.torsoLight,
    paint.outline,
  );
  if (!planted) drawHand(ctx, a, side, profile, paint, scale, false, depthScale);
}

function drawLeg(ctx, a, side, profile, paint, scale, contacts, depthScale) {
  const hip = a[`${side}Hip`];
  const knee = a[`${side}Knee`];
  const ankle = a[`${side}Ankle`];
  const planted = contacts.has(`${side}Foot`);
  const thighWidths = profile.volumes.thigh.map((value) => value * scale * depthScale);
  const shinWidths = profile.volumes.shin.map((value) => value * scale * depthScale);
  const legColor = depthScale < 0.95 ? paint.pantsShade : paint.pants;
  drawTaperedVolume(ctx, hip, knee, thighWidths[0], thighWidths[1], legColor, paint.outline);
  drawJointPatch(
    ctx,
    knee,
    Math.max(2.35, thighWidths[1] * 0.58),
    paint.pantsLight,
    paint.outline,
  );
  drawTaperedVolume(ctx, knee, ankle, shinWidths[0], shinWidths[1], legColor, paint.outline);
  drawCuff(
    ctx,
    knee,
    ankle,
    Math.max(2.2, profile.costume.ankleWidth * scale * depthScale),
    paint.cuff,
    paint.outline,
  );
  if (!planted) drawFoot(ctx, a, side, profile, paint, scale, false, depthScale);
}

function drawPelvis(ctx, a, rig, profile, paint, scale) {
  const spine = normalizedVector(a.pelvis, a.chest);
  const normal = { x: -spine.y, y: spine.x };
  const halfWidth = profile.volumes.pelvis[0] * scale * 0.58;
  const halfHeight = profile.volumes.pelvis[1] * scale * 0.58;
  const center = {
    x: a.pelvis.x + spine.x * halfHeight * 0.1,
    y: a.pelvis.y + spine.y * halfHeight * 0.1,
  };
  const points = [
    addPoint(center, normal, halfWidth, spine, -halfHeight),
    addPoint(center, normal, -halfWidth, spine, -halfHeight),
    addPoint(center, normal, -halfWidth * 0.82, spine, halfHeight),
    addPoint(center, normal, halfWidth * 0.82, spine, halfHeight),
  ];
  drawOutlinedPolygon(ctx, points, paint.pants, paint.outline, 1.4);
  if (!paint.details) return;
  const hemCenter = interpolatePoint(a.pelvis, a.chest, 0.12);
  drawCrossBand(ctx, hemCenter, spine, halfWidth * 0.86, 1.2, paint.pantsLight);
  if (rig.squash > 0.35) {
    drawCrossBand(ctx, center, spine, halfWidth * 0.52, 1, paint.outline);
  }
}

function drawTorso(ctx, a, rig, profile, paint, scale) {
  const spine = normalizedVector(a.pelvis, a.chest);
  const normal = { x: -spine.y, y: spine.x };
  const chestHalf = profile.volumes.chest[0] * scale * 0.55;
  const hemHalf = chestHalf * (0.86 + rig.squash * 0.08);
  const top = addVector(a.chest, spine, -0.6 * scale);
  const bottom = addVector(a.pelvis, spine, 2.2 * scale);
  const outlinePoints = [
    addVector(top, normal, chestHalf),
    addVector(top, normal, -chestHalf),
    addVector(bottom, normal, -hemHalf),
    addVector(bottom, normal, hemHalf),
  ];
  drawOutlinedPolygon(ctx, outlinePoints, paint.torso, paint.outline, 1.45);

  if (profile.id === "soder") {
    drawSoderBelly(ctx, a, rig, profile, paint, scale, spine, normal);
  } else {
    drawKittyHoodieDetails(ctx, a, rig, paint, scale, spine, normal, hemHalf);
  }
}

function drawKittyHoodieDetails(ctx, a, rig, paint, scale, spine, normal, hemHalf) {
  if (!paint.details) return;
  const hem = addVector(a.pelvis, spine, 1.2 * scale);
  drawCrossBand(ctx, hem, spine, hemHalf * 0.92, 1.4, paint.torsoLight);
  const neck = interpolatePoint(a.chest, a.head, 0.16);
  drawJointPatch(ctx, neck, 2.2 * scale, paint.outline, paint.outline);
  if (Math.abs(rig.bodyAngle) < 1.25) {
    const tieOrigin = addVector(a.chest, spine, 1.8 * scale);
    const leftTie = addVector(tieOrigin, normal, -1.6 * scale);
    const rightTie = addVector(tieOrigin, normal, 1.6 * scale);
    drawTinyCord(ctx, leftTie, spine, 4.2 * scale, paint.fur);
    drawTinyCord(ctx, rightTie, spine, 4.2 * scale, paint.fur);
  }
}

function drawSoderBelly(ctx, a, rig, profile, paint, scale, spine, normal) {
  const chest = addVector(a.chest, spine, 1.2 * scale);
  const pelvis = addVector(a.pelvis, spine, 1.1 * scale);
  const topHalf = 3.8 * scale;
  const bottomHalf = (3.35 + rig.costumeBounce * 0.35) * scale;
  const panel = [
    addVector(chest, normal, topHalf),
    addVector(chest, normal, -topHalf),
    addVector(pelvis, normal, -bottomHalf),
    addVector(pelvis, normal, bottomHalf),
  ];
  drawOutlinedPolygon(ctx, panel, paint.belly, paint.outline, 1);
  if (!paint.details) return;
  for (const amount of [0.28, 0.5, 0.72]) {
    const center = interpolatePoint(chest, pelvis, amount);
    const width = (topHalf * (1 - amount) + bottomHalf * amount) * 0.72;
    drawCrossBand(ctx, center, spine, width, 0.75, paint.bellyLight);
  }
}

function drawHand(ctx, a, side, profile, paint, scale, planted, depthScale) {
  const wrist = a[`${side}Wrist`];
  const hand = a[`${side}Hand`];
  const direction = normalizedVector(wrist, hand, side === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 });
  const normal = { x: -direction.y, y: direction.x };
  const width = profile.volumes.hand[0] * scale * depthScale;
  const height = profile.volumes.hand[1] * scale * depthScale;
  let points;
  if (planted) {
    const tangent = {
      x: Math.abs(direction.x) < 0.35 ? (side === "left" ? -1 : 1) : Math.sign(direction.x),
      y: 0,
    };
    const upper = { x: hand.x, y: hand.y - height * 0.9 };
    points = [
      { x: wrist.x, y: wrist.y },
      { x: upper.x - tangent.x * width * 0.55, y: upper.y },
      { x: hand.x - tangent.x * width * 0.7, y: hand.y - 1 },
      { x: hand.x + tangent.x * width * 0.55, y: hand.y },
      { x: upper.x + tangent.x * width * 0.55, y: upper.y + 1 },
    ];
  } else {
    const heel = addVector(wrist, direction, -0.2 * scale);
    const knuckle = addVector(hand, direction, width * 0.22);
    const tip = addVector(hand, direction, width * 0.55);
    points = [
      addVector(heel, normal, height * 0.42),
      addVector(knuckle, normal, height * 0.58),
      addVector(tip, normal, height * 0.24),
      addVector(tip, normal, -height * 0.24),
      addVector(knuckle, normal, -height * 0.58),
      addVector(heel, normal, -height * 0.42),
    ];
  }
  drawOutlinedPolygon(ctx, points, paint.fur, paint.outline, 1.15);
  if (paint.details) {
    const knuckle = planted
      ? { x: hand.x, y: hand.y - Math.max(1, height * 0.55) }
      : addVector(hand, direction, width * 0.18);
    drawCrossBand(ctx, knuckle, direction, height * 0.34, 0.65, paint.furHighlight);
  }
}

function drawFoot(ctx, a, side, profile, paint, scale, planted, depthScale) {
  const ankle = a[`${side}Ankle`];
  const foot = a[`${side}Foot`];
  const direction = normalizedVector(ankle, foot, side === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 });
  const normal = { x: -direction.y, y: direction.x };
  const length = profile.volumes.foot[0] * scale * depthScale;
  const height = profile.volumes.foot[1] * scale * depthScale;
  let points;
  if (planted) {
    const sign = Math.abs(direction.x) > 0.2
      ? Math.sign(direction.x)
      : side === "left" ? -1 : 1;
    const heelX = foot.x - sign * length * 0.42;
    const toeX = foot.x + sign * length * 0.7;
    const innerX = foot.x - sign * length * 0.2;
    points = [
      { x: heelX, y: foot.y },
      { x: toeX, y: foot.y },
      { x: toeX + sign, y: foot.y - height * 0.45 },
      { x: foot.x + sign * length * 0.2, y: foot.y - height },
      { x: innerX, y: foot.y - height * 0.82 },
      { x: ankle.x, y: ankle.y },
    ];
  } else {
    const heel = addVector(ankle, direction, -length * 0.2);
    const toe = addVector(foot, direction, length * 0.62);
    points = [
      addVector(heel, normal, height * 0.36),
      addVector(toe, normal, height * 0.46),
      addVector(toe, normal, -height * 0.32),
      addVector(foot, normal, -height * 0.62),
      addVector(heel, normal, -height * 0.42),
    ];
  }
  drawOutlinedPolygon(ctx, points, paint.shoe, paint.outline, 1.25);
  if (!paint.details) return;
  if (planted) {
    const sign = Math.abs(direction.x) > 0.2
      ? Math.sign(direction.x)
      : side === "left" ? -1 : 1;
    pixelRect(
      ctx,
      Math.min(foot.x - sign * length * 0.42, foot.x + sign * length * 0.7),
      foot.y - 1,
      Math.abs(length * 1.12),
      1,
      paint.sole,
    );
    pixelRect(ctx, foot.x + sign * length * 0.34, foot.y - height * 0.58, Math.max(1, length * 0.22), 1, paint.shoeLight);
  } else {
    const highlight = addVector(foot, normal, -height * 0.28);
    pixelRect(ctx, highlight.x - 1, highlight.y - 1, 3, 1, paint.shoeLight);
  }
}

function drawCostumeTail(ctx, a, rig, profile, paint, scale) {
  const base = a.costumeTailBase ?? a.tailBase;
  const tip = a.costumeTailTip ?? a.tailTip;
  const direction = normalizedVector(base, tip);
  const normal = { x: -direction.y, y: direction.x };
  const bend = (profile.id === "soder" ? 2.5 : 1.8) * scale;
  const middle = addVector(interpolatePoint(base, tip, 0.55), normal, bend);
  const startWidth = (profile.id === "soder" ? 4.2 : 3.2) * scale;
  const endWidth = (profile.id === "soder" ? 2.2 : 1.7) * scale;
  const fill = profile.id === "soder" ? paint.torso : paint.furShade;
  drawTaperedVolume(ctx, base, middle, startWidth, startWidth * 0.72, fill, paint.outline);
  drawTaperedVolume(ctx, middle, tip, startWidth * 0.75, endWidth, fill, paint.outline);
  drawJointPatch(ctx, tip, Math.max(1.5, endWidth * 0.52), fill, paint.outline);
  if (paint.details && profile.id === "soder") {
    const spot = interpolatePoint(middle, tip, 0.5);
    drawJointPatch(ctx, spot, Math.max(1, endWidth * 0.3), paint.bellyLight, paint.bellyLight);
  }
}

function drawHead(ctx, a, rig, profile, paint, scale) {
  if (profile.id === "soder") drawSoderHead(ctx, a, rig, profile, paint, scale);
  else drawKittyHead(ctx, a, rig, profile, paint, scale);
}

function drawKittyHead(ctx, a, rig, profile, paint, scale) {
  const head = a.head;
  const localScale = scale * rig.headScale;
  const rx = profile.volumes.head[0] * localScale;
  const ry = profile.volumes.head[1] * localScale;
  const earWidth = 4.15 * localScale;
  drawOutlinedPolygon(ctx, [
    { x: a.leftEar.x - earWidth, y: a.leftEar.y + 3 * localScale },
    { x: a.leftEar.x, y: a.leftEar.y - 4.2 * localScale },
    { x: a.leftEar.x + earWidth, y: a.leftEar.y + 3 * localScale },
  ], paint.hair, paint.outline, 1);
  drawOutlinedPolygon(ctx, [
    { x: a.rightEar.x - earWidth, y: a.rightEar.y + 3 * localScale },
    { x: a.rightEar.x, y: a.rightEar.y - 4.2 * localScale },
    { x: a.rightEar.x + earWidth, y: a.rightEar.y + 3 * localScale },
  ], paint.hair, paint.outline, 1);
  pixelEllipse(ctx, head.x, head.y, rx + 1.2, ry + 1.2, paint.outline);
  pixelEllipse(ctx, head.x, head.y + 0.3 * localScale, rx, ry, paint.fur);
  if (!paint.details) return;

  pixelRect(ctx, head.x - rx * 0.9, head.y - ry * 0.86, rx * 1.8, 4.8 * localScale, paint.hair);
  pixelRect(ctx, head.x - rx * 0.92, head.y - ry * 0.58, 2.7 * localScale, 8.4 * localScale, paint.hairShade);
  pixelRect(ctx, head.x + rx * 0.72, head.y - ry * 0.58, 2.7 * localScale, 8.2 * localScale, paint.hairShade);
  for (const offset of [-5.4, -1.4, 2.6]) {
    polygon(ctx, [
      { x: head.x + offset * localScale, y: head.y - 5.2 * localScale },
      { x: head.x + (offset + 4.2) * localScale, y: head.y - 5.2 * localScale },
      { x: head.x + (offset + 2.1) * localScale, y: head.y - 0.9 * localScale },
    ], paint.hair);
  }
  pixelRect(ctx, head.x - 5.5 * localScale, head.y - 6.2 * localScale, 4.2 * localScale, 1, paint.hairHighlight);
  drawFace(ctx, head, rig, paint, localScale);
}

function drawSoderHead(ctx, a, rig, profile, paint, scale) {
  const head = a.head;
  const localScale = scale * rig.headScale;
  const rx = (profile.volumes.head[0] + 1.65) * localScale;
  const ry = (profile.volumes.head[1] + 1.25 + rig.costumeBounce * 0.2) * localScale;
  pixelEllipse(ctx, head.x, head.y, rx + 1.1, ry + 1.1, paint.outline);
  pixelEllipse(ctx, head.x, head.y, rx, ry, paint.torsoLight);
  polygon(ctx, [
    { x: head.x - rx * 0.88, y: head.y - ry * 0.45 },
    { x: head.x - rx * 0.62, y: head.y - ry * 0.88 },
    { x: head.x + rx * 0.64, y: head.y - ry * 0.88 },
    { x: head.x + rx * 0.92, y: head.y - ry * 0.38 },
  ], paint.torso);
  const faceRx = 7.4 * localScale;
  const faceRy = 6.8 * localScale;
  pixelEllipse(ctx, head.x, head.y + 1.7 * localScale, faceRx + 1, faceRy + 1, paint.outline);
  pixelEllipse(ctx, head.x, head.y + 1.8 * localScale, faceRx, faceRy, paint.fur);
  if (!paint.details) return;

  pixelRect(ctx, head.x - 6.6 * localScale, head.y - 3.8 * localScale, 13.2 * localScale, 3.1 * localScale, paint.hair);
  for (const offset of [-4.8, -1, 2.8]) {
    polygon(ctx, [
      { x: head.x + offset * localScale, y: head.y - 3.8 * localScale },
      { x: head.x + (offset + 3.8) * localScale, y: head.y - 3.8 * localScale },
      { x: head.x + (offset + 1.9) * localScale, y: head.y - 0.2 * localScale },
    ], paint.hair);
  }
  pixelEllipse(ctx, head.x - 6.2 * localScale, head.y - 6.1 * localScale, 1.3 * localScale, 2.2 * localScale, paint.outline);
  pixelEllipse(ctx, head.x + 6.2 * localScale, head.y - 6.1 * localScale, 1.3 * localScale, 2.2 * localScale, paint.outline);
  pixelRect(ctx, head.x - 6.5 * localScale, head.y - 7.1 * localScale, 1, 1, paint.furHighlight);
  pixelRect(ctx, head.x + 5.9 * localScale, head.y - 7.1 * localScale, 1, 1, paint.furHighlight);
  polygon(ctx, [
    { x: head.x - 1.6 * localScale, y: head.y - 8.7 * localScale },
    { x: head.x + 1.6 * localScale, y: head.y - 8.7 * localScale },
    { x: head.x + 1.1 * localScale, y: head.y - 3.2 * localScale },
    { x: head.x, y: head.y - 1.8 * localScale },
    { x: head.x - 1.1 * localScale, y: head.y - 3.2 * localScale },
  ], paint.accent);
  drawFace(ctx, { x: head.x, y: head.y + 1.7 * localScale }, rig, paint, localScale, 0.88);
}

function drawFace(ctx, head, rig, paint, scale, faceScale = 1) {
  const eyeX = 3.6 * scale * faceScale;
  const eyeY = head.y + 0.8 * scale * faceScale;
  if (rig.expression === "wide") {
    pixelEllipse(ctx, head.x - eyeX, eyeY, 1.25 * scale * faceScale, 1.85 * scale * faceScale, paint.outline);
    pixelEllipse(ctx, head.x + eyeX, eyeY, 1.25 * scale * faceScale, 1.85 * scale * faceScale, paint.outline);
    pixelRect(ctx, head.x - eyeX - 0.3, eyeY - 1.2 * scale, 1, 1, "#ffffff");
    pixelRect(ctx, head.x + eyeX - 0.3, eyeY - 1.2 * scale, 1, 1, "#ffffff");
  } else {
    pixelRect(ctx, head.x - eyeX - 1, eyeY, 3 * scale * faceScale, 1.5, paint.outline);
    pixelRect(ctx, head.x + eyeX - 1, eyeY, 3 * scale * faceScale, 1.5, paint.outline);
  }
  pixelRect(ctx, head.x - 1, head.y + 4 * scale * faceScale, 2, 1, "#9d3f62");
  pixelRect(ctx, head.x - 6 * scale * faceScale, head.y + 3 * scale * faceScale, 2, 1, "#ce4772");
  pixelRect(ctx, head.x + 4 * scale * faceScale, head.y + 3 * scale * faceScale, 2, 1, "#ce4772");
}

function drawShadow(ctx, rig, x, floorY, scale, dancer, silhouette) {
  const height = Math.max(0, -rig.centerOfMass.y - 9);
  const width = Math.max(9, 22 - height * 0.25);
  ctx.save();
  ctx.globalAlpha *= silhouette ? 0.18 : 0.3;
  pixelEllipse(ctx, x + rig.centerOfMass.x * scale * 0.15, floorY + 2, width, 5, "#090b1b");
  if (!silhouette && dancer.family === "freeze") pixelEllipse(ctx, x, floorY + 1, 10, 3, "#63d6b3");
  ctx.restore();
}

function drawMotionArc(ctx, rig, x, floorY, scale, paint, ghost) {
  const center = scalePoint(rig.centerOfMass, x, floorY, scale);
  ctx.save();
  ctx.globalAlpha *= ghost ? 0.13 : 0.18;
  ctx.strokeStyle = paint.accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, 24 * scale, 10 * scale, rig.bodyAngle * 0.08, -0.3, Math.PI * 1.35);
  ctx.stroke();
  ctx.restore();
}

function drawContactAccents(ctx, dancer, x, floorY, scale, paint) {
  for (const contact of dancer.contacts?.contacts ?? []) {
    const anchor = scalePoint(contact.anchor, x, floorY, scale);
    ctx.save();
    ctx.globalAlpha = 0.28;
    pixelRect(ctx, anchor.x - 2, anchor.y + 1, 5, 1, paint.accent);
    ctx.restore();
  }
}

function drawRigDebug(ctx, rig, contacts, x, floorY, scale, debug) {
  const a = mapAnchors(rig.anchors, x, floorY, scale);
  if (debug.skeleton) {
    ctx.save();
    ctx.globalAlpha = 0.88;
    for (const [from, to] of [
      ["head", "neck"], ["neck", "chest"], ["chest", "pelvis"],
      ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"], ["leftWrist", "leftHand"],
      ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"], ["rightWrist", "rightHand"],
      ["leftHip", "leftKnee"], ["leftKnee", "leftAnkle"], ["leftAnkle", "leftFoot"],
      ["rightHip", "rightKnee"], ["rightKnee", "rightAnkle"], ["rightAnkle", "rightFoot"],
    ]) {
      pixelLine(ctx, a[from], a[to], 1, "#63d6b3");
    }
    for (const name of DEBUG_JOINTS) {
      pixelRect(ctx, a[name].x - 1, a[name].y - 1, 3, 3, "#f46b45");
    }
    ctx.restore();
  }
  if (debug.jointNames) {
    for (const name of DEBUG_JOINTS) {
      drawPixelText(ctx, JOINT_LABELS[name], a[name].x + 2, a[name].y - 5, {
        color: "#f5e9c9",
        shadow: "#090b1b",
        scale: 1,
      });
    }
  }
  if (debug.com) {
    const com = scalePoint(rig.centerOfMass, x, floorY, scale);
    pixelLine(ctx, { x: com.x - 4, y: com.y }, { x: com.x + 4, y: com.y }, 1, "#f4c95d");
    pixelLine(ctx, { x: com.x, y: com.y - 4 }, { x: com.x, y: com.y + 4 }, 1, "#f4c95d");
  }
  if (debug.contacts) {
    for (const contact of contacts?.contacts ?? []) {
      const anchor = scalePoint(contact.anchor, x, floorY, scale);
      pixelEllipse(ctx, anchor.x, anchor.y, 3, 2, "#f46b45");
      drawPixelText(ctx, contact.limb, anchor.x, anchor.y + 4, {
        align: "center",
        color: "#f46b45",
        shadow: "#090b1b",
        scale: 1,
      });
    }
  }
  if (debug.zOrder) {
    const farSide = rig.depthFront === "left" ? "right" : "left";
    const nearSide = farSide === "left" ? "right" : "left";
    ctx.save();
    ctx.globalAlpha = 0.78;
    drawDepthPath(ctx, a, farSide, "#4db8e8");
    drawDepthPath(ctx, a, nearSide, "#e178a5");
    ctx.restore();
  }
  if (debug.boneWarnings && (rig.maxBoneLengthError > 1e-6 || rig.warnings?.length)) {
    drawPixelText(ctx, "BONE LENGTH", 192, 12, {
      align: "center",
      color: "#f46b45",
      shadow: "#090b1b",
      scale: 1,
    });
  }
}

function drawDepthPath(ctx, a, side, color) {
  for (const [from, to] of [
    [`${side}Shoulder`, `${side}Elbow`],
    [`${side}Elbow`, `${side}Wrist`],
    [`${side}Hip`, `${side}Knee`],
    [`${side}Knee`, `${side}Ankle`],
  ]) {
    pixelLine(ctx, a[from], a[to], 2, color);
  }
}

function makePaint(profile, { ghost, silhouette }) {
  const palette = profile.palette;
  if (ghost || silhouette) {
    const color = silhouette ? "#eef0dd" : palette.accent;
    return Object.freeze(new Proxy({
      details: false,
      outline: color,
      accent: color,
    }, {
      get(target, key) {
        return key === "details" ? false : target[key] ?? color;
      },
    }));
  }
  return Object.freeze({
    ...palette,
    details: true,
  });
}

function drawTaperedVolume(ctx, from, to, startWidth, endWidth, fill, outline) {
  const direction = normalizedVector(from, to);
  const normal = { x: -direction.y, y: direction.x };
  const points = taperedPoints(from, to, normal, startWidth, endWidth);
  const outlinePoints = taperedPoints(from, to, normal, startWidth + 2.2, endWidth + 2.2);
  polygon(ctx, outlinePoints, outline);
  polygon(ctx, points, fill);
}

function taperedPoints(from, to, normal, startWidth, endWidth) {
  return [
    addVector(from, normal, startWidth * 0.5),
    addVector(to, normal, endWidth * 0.5),
    addVector(to, normal, -endWidth * 0.5),
    addVector(from, normal, -startWidth * 0.5),
  ];
}

function drawJointPatch(ctx, center, radius, fill, outline) {
  const outer = [
    { x: center.x - radius, y: center.y },
    { x: center.x - radius * 0.45, y: center.y - radius * 0.78 },
    { x: center.x + radius * 0.45, y: center.y - radius * 0.78 },
    { x: center.x + radius, y: center.y },
    { x: center.x + radius * 0.45, y: center.y + radius * 0.78 },
    { x: center.x - radius * 0.45, y: center.y + radius * 0.78 },
  ];
  drawOutlinedPolygon(ctx, outer, fill, outline, 1);
}

function drawCuff(ctx, from, joint, width, fill, outline) {
  const direction = normalizedVector(from, joint);
  const normal = { x: -direction.y, y: direction.x };
  const center = interpolatePoint(from, joint, 0.9);
  const halfLength = Math.max(1, width * 0.26);
  const halfWidth = width * 0.58;
  const points = [
    addPoint(center, normal, halfWidth, direction, -halfLength),
    addPoint(center, normal, -halfWidth, direction, -halfLength),
    addPoint(center, normal, -halfWidth * 0.9, direction, halfLength),
    addPoint(center, normal, halfWidth * 0.9, direction, halfLength),
  ];
  drawOutlinedPolygon(ctx, points, fill, outline, 0.8);
}

function drawCrossBand(ctx, center, axis, halfWidth, halfThickness, color) {
  const normal = { x: -axis.y, y: axis.x };
  polygon(ctx, [
    addPoint(center, normal, halfWidth, axis, -halfThickness),
    addPoint(center, normal, -halfWidth, axis, -halfThickness),
    addPoint(center, normal, -halfWidth, axis, halfThickness),
    addPoint(center, normal, halfWidth, axis, halfThickness),
  ], color);
}

function drawTinyCord(ctx, origin, direction, length, color) {
  const end = addVector(origin, direction, length);
  const normal = { x: -direction.y, y: direction.x };
  polygon(ctx, [
    addVector(origin, normal, 0.5),
    addVector(end, normal, 0.5),
    addVector(end, normal, -0.5),
    addVector(origin, normal, -0.5),
  ], color);
  pixelRect(ctx, end.x - 1, end.y - 1, 2, 2, color);
}

function drawOutlinedPolygon(ctx, points, fill, outline, border = 1) {
  const center = points.reduce((sum, point) => ({
    x: sum.x + point.x / points.length,
    y: sum.y + point.y / points.length,
  }), { x: 0, y: 0 });
  const expanded = points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    return {
      x: point.x + dx / length * border,
      y: point.y + dy / length * border,
    };
  });
  polygon(ctx, expanded, outline);
  polygon(ctx, points, fill);
}

function mapAnchors(anchors, x, y, scale) {
  return Object.fromEntries(
    Object.entries(anchors).map(([key, value]) => [key, scalePoint(value, x, y, scale)]),
  );
}

function normalizedVector(from, to, fallback = { x: 0, y: -1 }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length > 1e-6
    ? { x: dx / length, y: dy / length }
    : fallback;
}

function interpolatePoint(from, to, amount) {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

function addVector(point, vector, amount) {
  return { x: point.x + vector.x * amount, y: point.y + vector.y * amount };
}

function addPoint(center, normal, normalAmount, axis, axisAmount) {
  return {
    x: center.x + normal.x * normalAmount + axis.x * axisAmount,
    y: center.y + normal.y * normalAmount + axis.y * axisAmount,
  };
}
