import { COLORS, STAGE } from "../config.js";
import { hashNoise, pixelEllipse, pixelLine, pixelRect, polygon, withAlpha } from "./primitives.js";
import { drawPixelText } from "./pixel-font.js";

export function drawStage(ctx, snapshot, presentation = {}) {
  const beat = snapshot?.beat?.beat ?? 0;
  const phase = snapshot?.beat?.beatPhase ?? 0;
  const heat = snapshot?.crowdHeat ?? 0;
  drawSky(ctx, beat);
  drawSkyline(ctx, beat);
  drawFence(ctx);
  drawBanners(ctx);
  drawDJBooth(ctx, beat, phase, heat);
  drawSpeakers(ctx, beat, heat);
  drawDanceFloor(ctx, beat, phase, heat, presentation);
}

function drawSky(ctx, beat) {
  pixelRect(ctx, 0, 0, 384, 35, "#10142f");
  pixelRect(ctx, 0, 35, 384, 28, "#1a2040");
  pixelRect(ctx, 0, 63, 384, 30, "#25264b");
  pixelRect(ctx, 0, 93, 384, 42, "#302847");
  for (let index = 0; index < 22; index += 1) {
    const x = Math.floor(hashNoise(index * 4.17) * 384);
    const y = 5 + Math.floor(hashNoise(index * 8.31) * 52);
    const pulse = Math.sin(beat * 0.6 + index) > 0.82;
    pixelRect(ctx, x, y, pulse ? 2 : 1, 1, index % 4 ? "#8f86d9" : "#f5e9c9");
  }
  pixelEllipse(ctx, 310, 27, 19, 19, "#c9c8ed");
  pixelEllipse(ctx, 304, 22, 12, 13, "#eee3d2");
  pixelRect(ctx, 294, 22, 2, 2, "#b1acd8");
  pixelRect(ctx, 316, 33, 3, 2, "#aaa6d1");
}

function drawSkyline(ctx, beat) {
  const drift = Math.floor(beat * 0.03) % 7;
  const buildings = [
    [0, 64, 32, 47, "#171b37"], [28, 53, 25, 58, "#151a36"], [49, 67, 36, 44, "#1b1d3c"],
    [82, 44, 27, 67, "#151831"], [105, 61, 44, 50, "#181b39"], [145, 38, 32, 73, "#13162f"],
    [174, 58, 46, 53, "#1a1b39"], [218, 47, 27, 64, "#14172f"], [242, 65, 43, 46, "#1a1d3a"],
    [281, 41, 37, 70, "#15172f"], [315, 57, 36, 54, "#191b37"], [348, 49, 36, 62, "#12162d"],
  ];
  for (const [x, y, width, height, color] of buildings) {
    pixelRect(ctx, x, y, width, height, color);
    pixelRect(ctx, x + 3, y + 3, width - 6, 2, "#28274a");
    for (let wx = x + 5; wx < x + width - 3; wx += 8) {
      for (let wy = y + 10; wy < y + height - 4; wy += 9) {
        if ((wx + wy + drift) % 3) pixelRect(ctx, wx, wy, 2, 2, (wx + wy) % 4 ? "#7d6e92" : "#e4ae74");
      }
    }
  }
  pixelRect(ctx, 0, 105, 384, 12, "#11142d");
  pixelRect(ctx, 0, 111, 384, 3, "#090b1b");
}

function drawFence(ctx) {
  ctx.save();
  ctx.globalAlpha = 0.36;
  pixelRect(ctx, 0, 86, 384, 2, "#8f86d9");
  pixelRect(ctx, 0, 112, 384, 2, "#8f86d9");
  for (let x = -20; x < 404; x += 12) {
    pixelLine(ctx, { x, y: 86 }, { x: x + 27, y: 112 }, 1, "#8f86d9");
    pixelLine(ctx, { x: x + 27, y: 86 }, { x, y: 112 }, 1, "#8f86d9");
  }
  ctx.restore();
}

function drawBanners(ctx) {
  polygon(ctx, [{ x: 18, y: 71 }, { x: 71, y: 74 }, { x: 67, y: 92 }, { x: 20, y: 89 }], "#9d3f62");
  pixelRect(ctx, 23, 76, 40, 2, "#f5e9c9");
  drawPixelText(ctx, "PAW WORK", 45, 81, { align: "center", color: "#f5e9c9", scale: 1 });
  polygon(ctx, [{ x: 318, y: 70 }, { x: 370, y: 66 }, { x: 372, y: 86 }, { x: 321, y: 90 }], "#3d7b76");
  drawPixelText(ctx, "OEKAKI", 346, 76, { align: "center", color: "#f5e9c9", scale: 1 });
  for (let index = 0; index < 7; index += 1) {
    const x = 101 + index * 28;
    polygon(ctx, [{ x, y: 63 }, { x: x + 10, y: 66 }, { x: x + 5, y: 74 }], index % 2 ? COLORS.persimmon : COLORS.mint);
  }
}

function drawDJBooth(ctx, beat, phase, heat) {
  const bounce = phase < 0.15 ? -1 : 0;
  pixelRect(ctx, 159, 77, 68, 28, "#090b1b");
  pixelRect(ctx, 162, 79, 62, 23, "#34345f");
  pixelRect(ctx, 166, 83, 25, 16, "#1c2143");
  pixelRect(ctx, 194, 83, 25, 16, "#1c2143");
  pixelEllipse(ctx, 178, 91, 8, 5, "#090b1b");
  pixelEllipse(ctx, 207, 91, 8, 5, "#090b1b");
  pixelEllipse(ctx, 178, 91, 4, 2, "#63d6b3");
  pixelEllipse(ctx, 207, 91, 4, 2, "#f46b45");
  pixelRect(ctx, 190, 86, 4, 2, "#f4c95d");
  pixelRect(ctx, 190, 91, 4, 1, "#8f86d9");

  const djY = 72 + bounce;
  pixelEllipse(ctx, 192, djY, 9, 8, "#f5e9c9");
  pixelRect(ctx, 184, djY + 4, 17, 11, "#9d3f62");
  polygon(ctx, [{ x: 183, y: djY - 3 }, { x: 187, y: djY - 12 }, { x: 192, y: djY - 5 }], "#f46b45");
  polygon(ctx, [{ x: 201, y: djY - 3 }, { x: 197, y: djY - 12 }, { x: 192, y: djY - 5 }], "#f46b45");
  pixelRect(ctx, 187, djY - 1, 3, 2, "#090b1b");
  pixelRect(ctx, 195, djY - 1, 3, 2, "#090b1b");
  if (heat > 55) pixelLine(ctx, { x: 183, y: djY + 7 }, { x: 175, y: djY - 2 }, 3, "#f5e9c9");
  const recordAngle = beat * Math.PI / 2;
  pixelLine(ctx, { x: 178, y: 91 }, { x: 178 + Math.cos(recordAngle) * 6, y: 91 + Math.sin(recordAngle) * 3 }, 1, "#f5e9c9");
}

function drawSpeakers(ctx, beat, heat) {
  const pulse = Math.max(0, 1 - Math.min(1, ((beat % 1) + 1) % 1 * 4));
  const size = heat > 45 ? pulse : pulse * 0.5;
  for (const x of [118, 246]) {
    pixelRect(ctx, x, 72, 27, 38, "#090b1b");
    pixelRect(ctx, x + 3, 75, 21, 32, "#24264b");
    pixelEllipse(ctx, x + 13, 84, 6 + size, 6 + size, "#090b1b");
    pixelEllipse(ctx, x + 13, 84, 3, 3, "#8f86d9");
    pixelEllipse(ctx, x + 13, 99, 8 + size, 7 + size, "#090b1b");
    pixelEllipse(ctx, x + 13, 99, 4, 3, x < 190 ? "#63d6b3" : "#f46b45");
    pixelRect(ctx, x + 4, 108, 19, 2, "#11142d");
  }
}

function drawDanceFloor(ctx, beat, phase, heat, presentation) {
  pixelEllipse(ctx, STAGE.floorCenterX, STAGE.floorCenterY + 2, STAGE.floorRadiusX + 12, STAGE.floorRadiusY + 8, "#090b1b");
  pixelEllipse(ctx, STAGE.floorCenterX, STAGE.floorCenterY, STAGE.floorRadiusX + 8, STAGE.floorRadiusY + 4, "#423455");
  pixelEllipse(ctx, STAGE.floorCenterX, STAGE.floorCenterY, STAGE.floorRadiusX, STAGE.floorRadiusY, "#191a36");
  const ringColors = ["#28264a", "#34305a", "#252447", "#3a3157"];
  for (let ring = 0; ring < 8; ring += 1) {
    ctx.strokeStyle = ringColors[ring % ringColors.length];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(STAGE.floorCenterX, STAGE.floorCenterY, 14 + ring * 11, 4 + ring * 3.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const beatPulse = presentation.beatPulse !== false ? Math.max(0, 1 - phase * 3.8) : 0;
  if (beatPulse > 0) {
    ctx.save();
    ctx.globalAlpha = 0.22 + beatPulse * 0.42;
    ctx.strokeStyle = heat > 70 ? COLORS.persimmon : COLORS.mint;
    ctx.lineWidth = beatPulse > 0.65 ? 2 : 1;
    ctx.beginPath();
    ctx.ellipse(STAGE.floorCenterX, STAGE.floorCenterY, 68 + beatPulse * 17, 22 + beatPulse * 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // Kaki record label.
  pixelEllipse(ctx, STAGE.floorCenterX, STAGE.floorCenterY, 24, 9, "#6f3152");
  pixelEllipse(ctx, STAGE.floorCenterX, STAGE.floorCenterY, 17, 6, "#f46b45");
  pixelEllipse(ctx, STAGE.floorCenterX, STAGE.floorCenterY, 4, 2, "#11142d");
  pixelEllipse(ctx, STAGE.floorCenterX - 7, STAGE.floorCenterY - 1, 3, 2, "#f5e9c9");
  pixelEllipse(ctx, STAGE.floorCenterX + 7, STAGE.floorCenterY - 1, 3, 2, "#f5e9c9");
  pixelRect(ctx, STAGE.floorCenterX - 2, STAGE.floorCenterY + 2, 4, 1, "#090b1b");
  // Scratched-in directional lines make the floor's vinyl metaphor functional.
  const scratchX = Math.round(Math.sin(beat * 0.5) * 18);
  withAlpha(ctx, 0.4, () => {
    pixelLine(ctx, { x: 142 + scratchX, y: 170 }, { x: 174 + scratchX, y: 165 }, 1, "#8f86d9");
    pixelLine(ctx, { x: 212 - scratchX, y: 157 }, { x: 239 - scratchX, y: 153 }, 1, "#63d6b3");
  });
}
