import { CROWD_PROFILES } from "../dance/character-catalog.js";
import { pixelEllipse, pixelLine, pixelRect, polygon, withAlpha } from "./primitives.js";

const COLORS = Object.freeze({
  blue: "#4db8e8", aqua: "#6ecbd2", cream: "#eadbbf", navy: "#343958",
  pink: "#ef9fbd", slate: "#7d89a9", brown: "#6f4b57", mint: "#9bc9ad",
  lavender: "#a89bdb", caramel: "#c98a5b", ice: "#b8d7e7", ink: "#17172f",
  moss: "#669b3f", plum: "#593b61", moon: "#f5e9c9", denim: "#455f9a",
  persimmon: "#c95a3d", gold: "#f4c95d", outline: "#090b1b",
});

const BACK_POSITIONS = Object.freeze([
  [55, 111, 0.82], [82, 106, 0.9], [111, 111, 0.83], [142, 103, 0.92],
  [242, 103, 0.92], [273, 111, 0.83], [302, 106, 0.9], [329, 111, 0.82],
]);

const SIDE_POSITIONS = Object.freeze([
  [39, 132, 1], [69, 134, 1.03], [315, 134, 1.03], [345, 132, 1],
]);

export function drawBackCrowd(ctx, snapshot) {
  const heat = snapshot?.crowdHeat ?? 0;
  const beat = snapshot?.beat?.beat ?? 0;
  BACK_POSITIONS.forEach(([x, y, scale], index) => {
    drawCrowdMember(ctx, CROWD_PROFILES[index], x, y, scale, beat, heat, index);
  });
}

export function drawSideCrowd(ctx, snapshot) {
  const heat = snapshot?.crowdHeat ?? 0;
  const beat = snapshot?.beat?.beat ?? 0;
  SIDE_POSITIONS.forEach(([x, y, scale], index) => {
    drawCrowdMember(ctx, CROWD_PROFILES[index + 8], x, y, scale, beat, heat, index + 8);
  });
}

export function drawForegroundCrowd(ctx, snapshot, reducedMotion = false) {
  const heat = snapshot?.crowdHeat ?? 0;
  if (heat < 42) return;
  const beat = snapshot?.beat?.beat ?? 0;
  const wave = reducedMotion ? 0 : Math.sin(beat * Math.PI) * Math.min(3, heat / 28);
  ctx.save();
  ctx.globalAlpha = 0.72;
  polygon(ctx, [{ x: 0, y: 173 }, { x: 21, y: 164 + wave }, { x: 38, y: 181 }, { x: 51, y: 216 }, { x: 0, y: 216 }], "#080a18");
  pixelEllipse(ctx, 21, 163 + wave, 10, 9, "#080a18");
  if (heat > 72) {
    pixelLine(ctx, { x: 17, y: 171 }, { x: 9, y: 146 + wave }, 7, "#080a18");
    pixelEllipse(ctx, 8, 144 + wave, 4, 4, "#080a18");
  }
  polygon(ctx, [{ x: 384, y: 170 }, { x: 363, y: 162 - wave }, { x: 344, y: 181 }, { x: 334, y: 216 }, { x: 384, y: 216 }], "#080a18");
  pixelEllipse(ctx, 363, 161 - wave, 10, 9, "#080a18");
  if (heat > 72) {
    pixelLine(ctx, { x: 366, y: 169 }, { x: 374, y: 144 - wave }, 7, "#080a18");
    pixelEllipse(ctx, 375, 142 - wave, 4, 4, "#080a18");
  }
  ctx.restore();
}

function drawCrowdMember(ctx, profile, x, y, scale, beat, heat, index) {
  const pulsePhase = ((beat + index * 0.13) % 1 + 1) % 1;
  const response = heat / 100 * profile.energy;
  const bounce = pulsePhase < 0.18 ? -Math.round(response * 2) : 0;
  const wave = heat > 58 && Math.sin(beat * Math.PI * 0.5 + index) > 0.2;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + bounce));
  ctx.scale(scale, scale);
  const outline = COLORS.outline;
  const hair = COLORS[profile.hair] ?? COLORS.pink;
  const outfit = COLORS[profile.outfit] ?? COLORS.denim;
  const accent = COLORS[profile.accent] ?? COLORS.moon;

  pixelRect(ctx, -7, 4, 14, 10, outline);
  pixelRect(ctx, -6, 4, 12, 9, outfit);
  if (wave) {
    pixelLine(ctx, { x: -5, y: 7 }, { x: -10, y: -7 }, 4, outline);
    pixelLine(ctx, { x: -5, y: 7 }, { x: -10, y: -7 }, 2, outfit);
    pixelEllipse(ctx, -10, -9, 2, 2, accent);
  }
  drawEars(ctx, profile.ears, hair, accent, outline);
  pixelEllipse(ctx, 0, 0, 8, 7, outline);
  pixelEllipse(ctx, 0, 0, 7, 6, "#eadbbf");
  drawHair(ctx, profile, hair, outline);
  pixelRect(ctx, -4, 0, 2, 2, outline);
  pixelRect(ctx, 3, 0, 2, 2, outline);
  if (heat > 32) pixelRect(ctx, -1, 4, 3, 1, "#9d3f62");
  else pixelRect(ctx, -1, 3, 2, 1, "#9d3f62");
  drawProp(ctx, profile.prop, accent, outfit, outline);
  ctx.restore();
}

function drawEars(ctx, ears, hair, accent, outline) {
  if (ears === "rabbit") {
    pixelRect(ctx, -7, -14, 5, 10, outline); pixelRect(ctx, 3, -14, 5, 10, outline);
    pixelRect(ctx, -6, -13, 3, 9, hair); pixelRect(ctx, 4, -13, 3, 9, hair);
    pixelRect(ctx, -5, -11, 1, 6, accent); pixelRect(ctx, 5, -11, 1, 6, accent);
  } else if (ears === "mouse") {
    pixelEllipse(ctx, -6, -6, 4, 4, outline); pixelEllipse(ctx, 6, -6, 4, 4, outline);
    pixelEllipse(ctx, -6, -6, 3, 3, hair); pixelEllipse(ctx, 6, -6, 3, 3, hair);
  } else if (ears === "ram") {
    pixelEllipse(ctx, -7, -4, 4, 4, outline); pixelEllipse(ctx, 7, -4, 4, 4, outline);
    pixelEllipse(ctx, -7, -4, 3, 3, accent); pixelEllipse(ctx, 7, -4, 3, 3, accent);
    pixelEllipse(ctx, -7, -4, 1, 1, outline); pixelEllipse(ctx, 7, -4, 1, 1, outline);
  } else if (ears === "hood") {
    pixelEllipse(ctx, 0, -1, 10, 10, outline); pixelEllipse(ctx, 0, -1, 9, 9, hair);
    pixelRect(ctx, -2, -11, 4, 7, accent);
  } else {
    polygon(ctx, [{ x: -8, y: -4 }, { x: -6, y: -12 }, { x: -1, y: -5 }], outline);
    polygon(ctx, [{ x: 8, y: -4 }, { x: 6, y: -12 }, { x: 1, y: -5 }], outline);
    polygon(ctx, [{ x: -7, y: -5 }, { x: -6, y: -10 }, { x: -2, y: -5 }], hair);
    polygon(ctx, [{ x: 7, y: -5 }, { x: 6, y: -10 }, { x: 2, y: -5 }], hair);
  }
}

function drawHair(ctx, profile, hair, outline) {
  if (profile.ears === "hood") return;
  pixelRect(ctx, -7, -5, 14, 5, hair);
  pixelRect(ctx, -7, -1, 3, 6, hair);
  pixelRect(ctx, 5, -1, 2, 6, hair);
  pixelRect(ctx, -4, -4, 2, 3, hair);
  pixelRect(ctx, 1, -4, 2, 2, hair);
  if (profile.prop === "bow") {
    pixelRect(ctx, -8, -8, 4, 4, outline); pixelRect(ctx, -4, -7, 3, 3, outline);
    pixelRect(ctx, -7, -7, 3, 2, "#a89bdb"); pixelRect(ctx, -4, -6, 2, 1, "#a89bdb");
  }
}

function drawProp(ctx, prop, accent, outfit, outline) {
  if (prop === "phones") {
    pixelRect(ctx, -9, -2, 3, 6, outline); pixelRect(ctx, 7, -2, 3, 6, outline);
    pixelRect(ctx, -8, -1, 2, 4, accent); pixelRect(ctx, 7, -1, 2, 4, accent);
  } else if (prop === "cap" || prop === "beanie") {
    pixelRect(ctx, -7, -8, 14, 3, outline); pixelRect(ctx, -6, -8, 12, 2, accent);
    if (prop === "cap") pixelRect(ctx, 4, -6, 6, 2, outline);
  } else if (prop === "cherries") {
    pixelEllipse(ctx, 6, -7, 2, 2, accent); pixelEllipse(ctx, 9, -5, 2, 2, accent);
    pixelLine(ctx, { x: 6, y: -9 }, { x: 8, y: -11 }, 1, "#669b3f");
  } else if (prop === "flower") {
    for (const [dx, dy] of [[0,-2],[2,0],[0,2],[-2,0]]) pixelEllipse(ctx, 7 + dx, -7 + dy, 1, 1, accent);
  } else if (prop === "poms" || prop === "paw") {
    pixelEllipse(ctx, prop === "paw" ? -9 : -7, -2, 3, 3, outline);
    pixelEllipse(ctx, prop === "paw" ? -9 : -7, -2, 2, 2, accent);
  } else if (prop === "mic") {
    pixelLine(ctx, { x: 7, y: 8 }, { x: 10, y: -4 }, 2, outline);
    pixelEllipse(ctx, 10, -5, 2, 2, accent);
  }
}
