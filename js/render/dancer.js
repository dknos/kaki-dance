import { pixelEllipse, pixelLine, pixelRect, polygon, scalePoint, withAlpha } from "./primitives.js";

export function drawDancer(ctx, dancerSnapshot, character, {
  x = 192,
  floorY = 158,
  scale = 1.45,
  alpha = 1,
  ghost = false,
  debug = null,
} = {}) {
  const rig = dancerSnapshot?.rig;
  if (!rig) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const palette = character.palette;
  drawShadow(ctx, rig, x, floorY, scale, dancerSnapshot);
  if (dancerSnapshot.family === "power" || ghost) drawMotionArc(ctx, rig, x, floorY, scale, palette, ghost);
  if (rig.topology === "soder") drawSoder(ctx, rig, palette, x, floorY, scale, ghost);
  else drawKitty(ctx, rig, palette, x, floorY, scale, ghost);
  drawContactAccents(ctx, dancerSnapshot, x, floorY, scale, palette);
  if (debug) drawRigDebug(ctx, rig, dancerSnapshot.contacts, x, floorY, scale, debug);
  ctx.restore();
}

function drawShadow(ctx, rig, x, floorY, scale, dancer) {
  const height = Math.max(0, -rig.centerOfMass.y - 9);
  const width = Math.max(9, 22 - height * 0.25);
  ctx.save();
  ctx.globalAlpha *= 0.34;
  pixelEllipse(ctx, x + rig.centerOfMass.x * scale * 0.15, floorY + 2, width, 5, "#090b1b");
  if (dancer.family === "freeze") pixelEllipse(ctx, x, floorY + 1, 10, 3, "#63d6b3");
  ctx.restore();
}

function drawMotionArc(ctx, rig, x, floorY, scale, palette, ghost) {
  const center = scalePoint(rig.centerOfMass, x, floorY, scale);
  ctx.save();
  ctx.globalAlpha *= ghost ? 0.18 : 0.36;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, 27 * scale, 12 * scale, rig.bodyAngle * 0.1, -0.3, Math.PI * 1.45);
  ctx.stroke();
  ctx.strokeStyle = "#63d6b3";
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, 20 * scale, 8 * scale, rig.bodyAngle * 0.1, 2.4, 5.3);
  ctx.stroke();
  ctx.restore();
}

function drawKitty(ctx, rig, palette, x, floorY, scale, ghost) {
  const a = mapAnchors(rig.anchors, x, floorY, scale);
  const farSide = rig.depthFront === "left" ? "right" : "left";
  drawTail(ctx, a.tailBase, a.tailTip, palette, scale, ghost);
  drawLimbSet(ctx, a, farSide, palette, scale, ghost);
  drawHoodie(ctx, a, rig, palette, scale, ghost);
  drawLimbSet(ctx, a, rig.depthFront, palette, scale, ghost);
  drawKittyHead(ctx, a, rig, palette, scale, ghost);
}

function drawLimbSet(ctx, a, side, palette, scale, ghost) {
  const color = ghost ? palette.accent : palette.hoodie;
  const outline = ghost ? palette.accent : palette.outline;
  const upper = a[`${side}Shoulder`];
  const elbow = a[`${side}Elbow`];
  const paw = a[`${side}Paw`];
  const hip = a[`${side}Hip`];
  const knee = a[`${side}Knee`];
  const foot = a[`${side}Foot`];
  outlined(ctx, upper, elbow, 5 * scale, color, outline);
  outlined(ctx, elbow, paw, 4.6 * scale, palette.fur, outline);
  pixelEllipse(ctx, paw.x, paw.y, 3.5 * scale, 3 * scale, outline);
  pixelEllipse(ctx, paw.x, paw.y, 2.4 * scale, 2 * scale, palette.fur);
  outlined(ctx, hip, knee, 6 * scale, color, outline);
  outlined(ctx, knee, foot, 5.5 * scale, color, outline);
  pixelEllipse(ctx, foot.x, foot.y, 4.5 * scale, 2.8 * scale, outline);
  pixelEllipse(ctx, foot.x, foot.y, 3.3 * scale, 1.8 * scale, palette.hoodieLight);
}

function drawHoodie(ctx, a, rig, palette, scale, ghost) {
  const outline = ghost ? palette.accent : palette.outline;
  const hoodie = ghost ? palette.accent : palette.hoodie;
  const spread = 8 * scale * (1 - rig.squash * 0.06);
  polygon(ctx, [
    { x: a.leftShoulder.x - 2, y: a.leftShoulder.y - 2 },
    { x: a.rightShoulder.x + 2, y: a.rightShoulder.y - 2 },
    { x: a.pelvis.x + spread, y: a.pelvis.y + 5 * scale },
    { x: a.pelvis.x - spread, y: a.pelvis.y + 5 * scale },
  ], outline);
  polygon(ctx, [
    { x: a.leftShoulder.x, y: a.leftShoulder.y },
    { x: a.rightShoulder.x, y: a.rightShoulder.y },
    { x: a.pelvis.x + spread - 2, y: a.pelvis.y + 3 * scale },
    { x: a.pelvis.x - spread + 2, y: a.pelvis.y + 3 * scale },
  ], hoodie);
  if (!ghost) {
    pixelLine(ctx, { x: a.chest.x, y: a.chest.y + 2 }, { x: a.pelvis.x, y: a.pelvis.y + 3 * scale }, 1, palette.hoodieLight);
    pixelRect(ctx, a.chest.x - 4 * scale, a.chest.y + 4 * scale, 2, 5 * scale, palette.fur);
    pixelRect(ctx, a.chest.x + 3 * scale, a.chest.y + 4 * scale, 2, 5 * scale, palette.fur);
  }
}

function drawKittyHead(ctx, a, rig, palette, scale, ghost) {
  const outline = ghost ? palette.accent : palette.outline;
  const fur = ghost ? palette.accent : palette.fur;
  const head = a.head;
  const earWidth = 4.5 * scale;
  polygon(ctx, [
    { x: a.leftEar.x - earWidth, y: a.leftEar.y + 3 * scale },
    { x: a.leftEar.x, y: a.leftEar.y - 4 * scale },
    { x: a.leftEar.x + earWidth, y: a.leftEar.y + 3 * scale },
  ], outline);
  polygon(ctx, [
    { x: a.rightEar.x - earWidth, y: a.rightEar.y + 3 * scale },
    { x: a.rightEar.x, y: a.rightEar.y - 4 * scale },
    { x: a.rightEar.x + earWidth, y: a.rightEar.y + 3 * scale },
  ], outline);
  if (!ghost) {
    polygon(ctx, [
      { x: a.leftEar.x - 2.7 * scale, y: a.leftEar.y + 2 * scale },
      { x: a.leftEar.x, y: a.leftEar.y - 2.8 * scale },
      { x: a.leftEar.x + 2.7 * scale, y: a.leftEar.y + 2 * scale },
    ], palette.hair);
    polygon(ctx, [
      { x: a.rightEar.x - 2.7 * scale, y: a.rightEar.y + 2 * scale },
      { x: a.rightEar.x, y: a.rightEar.y - 2.8 * scale },
      { x: a.rightEar.x + 2.7 * scale, y: a.rightEar.y + 2 * scale },
    ], palette.hair);
  }
  pixelEllipse(ctx, head.x, head.y, 10.5 * scale, 9.5 * scale, outline);
  pixelEllipse(ctx, head.x, head.y + 0.3 * scale, 9.2 * scale, 8.2 * scale, fur);
  if (ghost) return;
  // Blue bob and chunky bangs from the supplied KittyKaki plush.
  pixelRect(ctx, head.x - 9 * scale, head.y - 8 * scale, 18 * scale, 5 * scale, palette.hair);
  pixelRect(ctx, head.x - 9.5 * scale, head.y - 5 * scale, 3.2 * scale, 10 * scale, palette.hairShade);
  pixelRect(ctx, head.x + 6.5 * scale, head.y - 5 * scale, 3 * scale, 9 * scale, palette.hairShade);
  for (const offset of [-5, -1, 3]) {
    polygon(ctx, [
      { x: head.x + offset * scale, y: head.y - 5 * scale },
      { x: head.x + (offset + 4) * scale, y: head.y - 5 * scale },
      { x: head.x + (offset + 2) * scale, y: head.y - 1 * scale },
    ], palette.hair);
  }
  const eyeY = head.y + 1 * scale;
  if (rig.expression === "wide") {
    pixelEllipse(ctx, head.x - 3.6 * scale, eyeY, 1.5 * scale, 2.2 * scale, outline);
    pixelEllipse(ctx, head.x + 3.6 * scale, eyeY, 1.5 * scale, 2.2 * scale, outline);
    pixelRect(ctx, head.x - 4 * scale, eyeY - 1.2 * scale, 1, 1, "#fff");
    pixelRect(ctx, head.x + 3.2 * scale, eyeY - 1.2 * scale, 1, 1, "#fff");
  } else {
    pixelRect(ctx, head.x - 5 * scale, eyeY, 3 * scale, 2, outline);
    pixelRect(ctx, head.x + 2 * scale, eyeY, 3 * scale, 2, outline);
  }
  pixelRect(ctx, head.x - 1 * scale, head.y + 4 * scale, 2 * scale, 1, "#9d3f62");
  pixelRect(ctx, head.x - 6 * scale, head.y + 3 * scale, 2, 1, "#ce4772");
  pixelRect(ctx, head.x + 4 * scale, head.y + 3 * scale, 2, 1, "#ce4772");
}

function drawTail(ctx, base, tip, palette, scale, ghost) {
  const outline = ghost ? palette.accent : palette.outline;
  const color = ghost ? palette.accent : palette.furShade;
  outlined(ctx, base, tip, 4.5 * scale, color, outline);
  pixelEllipse(ctx, tip.x, tip.y, 2.8 * scale, 2.8 * scale, outline);
  pixelEllipse(ctx, tip.x, tip.y, 1.8 * scale, 1.8 * scale, color);
}

function drawSoder(ctx, rig, palette, x, floorY, scale, ghost) {
  const a = mapAnchors(rig.anchors, x, floorY, scale);
  const outline = ghost ? palette.accent : palette.outline;
  const green = ghost ? palette.accent : palette.hoodie;
  // Coil is a genuine weighted topology rather than hidden cat legs.
  for (let index = rig.coilSegments.length - 2; index >= 0; index -= 1) {
    const from = scalePoint(rig.coilSegments[index], x, floorY, scale);
    const to = scalePoint(rig.coilSegments[index + 1], x, floorY, scale);
    outlined(ctx, from, to, (rig.coilSegments[index].radius * 1.75) * scale, green, outline);
    if (!ghost && index % 2 === 0) {
      const center = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      pixelRect(ctx, center.x - 2, center.y - 1, 4, 2, palette.belly);
    }
  }
  const far = rig.depthFront === "left" ? "right" : "left";
  drawSoderArm(ctx, a, far, palette, scale, ghost);
  drawSoderHood(ctx, a, rig, palette, scale, ghost);
  drawSoderArm(ctx, a, rig.depthFront, palette, scale, ghost);
}

function drawSoderArm(ctx, a, side, palette, scale, ghost) {
  const outline = ghost ? palette.accent : palette.outline;
  const green = ghost ? palette.accent : palette.hoodie;
  outlined(ctx, a[`${side}Shoulder`], a[`${side}Elbow`], 5 * scale, green, outline);
  outlined(ctx, a[`${side}Elbow`], a[`${side}Paw`], 4.3 * scale, palette.fur, outline);
  pixelEllipse(ctx, a[`${side}Paw`].x, a[`${side}Paw`].y, 3 * scale, 2.7 * scale, outline);
  pixelEllipse(ctx, a[`${side}Paw`].x, a[`${side}Paw`].y, 2 * scale, 1.7 * scale, palette.fur);
}

function drawSoderHood(ctx, a, rig, palette, scale, ghost) {
  const head = a.head;
  const outline = ghost ? palette.accent : palette.outline;
  const green = ghost ? palette.accent : palette.hoodie;
  pixelEllipse(ctx, head.x, head.y, 12 * scale, 11 * scale, outline);
  pixelEllipse(ctx, head.x, head.y, 10.8 * scale, 9.8 * scale, green);
  if (ghost) return;
  // Snake hood eye patches and tongue crest.
  pixelEllipse(ctx, head.x - 6 * scale, head.y - 5 * scale, 1.6 * scale, 2.7 * scale, outline);
  pixelEllipse(ctx, head.x + 6 * scale, head.y - 5 * scale, 1.6 * scale, 2.7 * scale, outline);
  pixelRect(ctx, head.x - 2 * scale, head.y - 10 * scale, 4 * scale, 6 * scale, palette.accent);
  pixelRect(ctx, head.x - 7 * scale, head.y + 5 * scale, 14 * scale, 7 * scale, palette.fur);
  pixelRect(ctx, head.x - 6 * scale, head.y + 6 * scale, 12 * scale, 5 * scale, palette.hair);
  pixelRect(ctx, head.x - 4 * scale, head.y + 7 * scale, 2 * scale, 2, outline);
  pixelRect(ctx, head.x + 2 * scale, head.y + 7 * scale, 2 * scale, 2, outline);
  pixelRect(ctx, head.x - 1 * scale, head.y + 10 * scale, 2 * scale, 1, "#9d3f62");
  if (rig.expression === "wide") {
    pixelRect(ctx, head.x - 1 * scale, head.y + 11 * scale, 2 * scale, 4 * scale, palette.accent);
  }
}

function drawContactAccents(ctx, dancer, x, floorY, scale, palette) {
  for (const contact of dancer.contacts?.contacts ?? []) {
    const anchor = scalePoint(contact.anchor, x, floorY, scale);
    ctx.save();
    ctx.globalAlpha = 0.45;
    pixelEllipse(ctx, anchor.x, anchor.y + 1, 3, 1, palette.accent);
    ctx.restore();
  }
}

function drawRigDebug(ctx, rig, contacts, x, floorY, scale, debug) {
  const a = mapAnchors(rig.anchors, x, floorY, scale);
  if (debug.skeleton) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    for (const [from, to] of [
      ["head", "chest"], ["chest", "pelvis"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftPaw"],
      ["rightShoulder", "rightElbow"], ["rightElbow", "rightPaw"], ["leftHip", "leftKnee"], ["leftKnee", "leftFoot"],
      ["rightHip", "rightKnee"], ["rightKnee", "rightFoot"],
    ]) pixelLine(ctx, a[from], a[to], 1, "#63d6b3");
    for (const anchor of Object.values(a)) pixelRect(ctx, anchor.x - 1, anchor.y - 1, 3, 3, "#f46b45");
    ctx.restore();
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
    }
  }
}

function mapAnchors(anchors, x, y, scale) {
  return Object.fromEntries(Object.entries(anchors).map(([key, value]) => [key, scalePoint(value, x, y, scale)]));
}

function outlined(ctx, from, to, width, color, outline) {
  pixelLine(ctx, from, to, width + 2, outline);
  pixelLine(ctx, from, to, Math.max(1, width), color);
}
