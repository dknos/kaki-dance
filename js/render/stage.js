import { COLORS, FROLIC_STAGE, STAGE } from "../config.js";
import { hashNoise, pixelEllipse, pixelLine, pixelRect, polygon, withAlpha } from "./primitives.js";
import { drawPixelText } from "./pixel-font.js";

export function drawStage(ctx, snapshot, presentation = {}) {
  if (snapshot?.frolic) {
    drawAppalachianStage(ctx, snapshot, presentation);
    return;
  }
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

export function drawAppalachianStage(ctx, snapshot, presentation = {}) {
  const beat = snapshot?.beat?.beat ?? 0;
  const phase = snapshot?.beat?.beatPhase ?? 0;
  const heat = snapshot?.crowdHeat ?? 0;
  const strainEnding = (snapshot?.frolic?.bar ?? 1) % 8 === 0;
  const response = strainEnding ? Math.max(0, 1 - phase * 2.8) : 0;
  const palette = {
    pine: "#151a18",
    pine2: "#2b2a23",
    cedar: "#6a3527",
    cedarLight: "#ad6842",
    amber: "#f2bd65",
    chalk: "#f1dfbf",
    indigo: "#35405a",
    fiddle: "#b64d32",
    board: "#b97443",
    boardLight: "#e0a167",
  };

  pixelRect(ctx, 0, 0, 384, 216, palette.pine);
  pixelRect(ctx, 0, 17, 384, 105, palette.pine2);
  // Warm clapboard hall with dark structural framing and a quiet center field.
  for (let y = 25; y < 122; y += 11) {
    pixelRect(ctx, 0, y, 384, 1, y % 22 ? "#3c392e" : "#1e211d");
  }
  pixelRect(ctx, 0, 116, 384, 6, "#171817");
  polygon(ctx, [{ x: 0, y: 0 }, { x: 67, y: 0 }, { x: 134, y: 91 }, { x: 123, y: 91 }], "#0d1211");
  polygon(ctx, [{ x: 384, y: 0 }, { x: 317, y: 0 }, { x: 250, y: 91 }, { x: 261, y: 91 }], "#0d1211");
  pixelRect(ctx, 188, 0, 8, 72, "#0d1211");
  drawSideQuilts(ctx, palette);
  drawHallLights(ctx, beat, palette);
  drawFrolicSign(ctx, palette);
  drawStringBand(ctx, beat, response, heat, palette);
  drawHallAudience(ctx, beat, response, heat, palette);

  // Floorboards recede toward the purpose-built resonant board.
  pixelRect(ctx, 0, 122, 384, 94, "#57352b");
  for (let y = 126; y < 216; y += 11) {
    pixelRect(ctx, 0, y, 384, 1, "#2b211e");
    const stagger = Math.floor((y - 126) / 11) % 2 ? 17 : 0;
    for (let x = stagger; x < 384; x += 48) {
      pixelRect(ctx, x, y + 1, 1, 10, "#3d2924");
      if ((x + y) % 3 === 0) pixelEllipse(ctx, x + 19, y + 6, 2, 1, "#6d4434");
    }
  }
  for (let x = -120; x < 500; x += 36) {
    pixelLine(ctx, { x: 192 + (x - 192) * 0.43, y: 122 }, { x, y: 216 }, 1, "#392622");
  }
  pixelEllipse(ctx, 192, 184, 96, 18, "#201817");
  const boardFlex = 0;
  polygon(ctx, [
    { x: 107, y: FROLIC_STAGE.boardBottom },
    { x: 277, y: FROLIC_STAGE.boardBottom },
    { x: 270, y: FROLIC_STAGE.boardBottom + 6 },
    { x: 114, y: FROLIC_STAGE.boardBottom + 6 },
  ], "#5a3024");
  polygon(ctx, [
    { x: FROLIC_STAGE.boardLeft, y: FROLIC_STAGE.boardTop + boardFlex },
    { x: FROLIC_STAGE.boardRight, y: FROLIC_STAGE.boardTop + boardFlex },
    { x: 277, y: FROLIC_STAGE.boardBottom },
    { x: 107, y: FROLIC_STAGE.boardBottom },
  ], palette.board);
  pixelLine(
    ctx,
    { x: FROLIC_STAGE.boardLeft, y: FROLIC_STAGE.boardTop + boardFlex },
    { x: FROLIC_STAGE.boardRight, y: FROLIC_STAGE.boardTop + boardFlex },
    2,
    palette.boardLight,
  );
  for (let y = FROLIC_STAGE.boardTop + 6; y < FROLIC_STAGE.boardBottom - 2; y += 7) {
    const inset = Math.round((y - FROLIC_STAGE.boardTop) * 0.19);
    pixelLine(
      ctx,
      { x: FROLIC_STAGE.boardLeft - inset, y },
      { x: FROLIC_STAGE.boardRight + inset, y },
      1,
      y % 2 ? "#8f5335" : "#ca8150",
    );
  }
  for (let x = 132; x < FROLIC_STAGE.boardRight; x += 22) {
    pixelLine(
      ctx,
      { x, y: FROLIC_STAGE.boardTop + 2 },
      { x: x + (x < 192 ? -8 : 8), y: FROLIC_STAGE.boardBottom - 2 },
      1,
      "#6e3f2d",
    );
  }
  pixelLine(ctx, { x: 114, y: 190 }, { x: 270, y: 190 }, 1, "#ca8150");
}

function drawHallLights(ctx, beat, palette) {
  for (const [index, x] of [64, 124, 260, 320].entries()) {
    pixelLine(ctx, { x, y: 0 }, { x, y: 26 }, 1, "#171713");
    const pulse = 0.82 + Math.max(0, Math.sin(beat * Math.PI + index)) * 0.18;
    withAlpha(ctx, pulse, () => {
      pixelEllipse(ctx, x, 30, 5, 5, palette.amber);
      pixelRect(ctx, x - 2, 25, 4, 3, palette.chalk);
    });
  }
}

function drawFrolicSign(ctx, palette) {
  polygon(ctx, [{ x: 136, y: 18 }, { x: 248, y: 18 }, { x: 243, y: 47 }, { x: 141, y: 47 }], "#5b2f27");
  pixelRect(ctx, 142, 22, 100, 21, palette.cedarLight);
  drawPixelText(ctx, "CEDAR RIDGE", 192, 25, { align: "center", color: palette.chalk, scale: 1 });
  drawPixelText(ctx, "FROLIC", 192, 34, { align: "center", color: palette.amber, scale: 1 });
}

function drawStringBand(ctx, beat, response, heat, palette) {
  drawBandPlayer(ctx, 126, 88, "fiddle", beat, response, palette);
  drawBandPlayer(ctx, 164, 90, "banjo", beat, response, palette);
  drawBandPlayer(ctx, 235, 89, "guitar", beat, response, palette);
  drawBandPlayer(ctx, 273, 91, "bass", beat, response, palette);
  const railLift = response > 0.2 || heat > 70 ? -1 : 0;
  pixelRect(ctx, 105, 112 + railLift, 188, 5, "#301f1b");
  pixelRect(ctx, 110, 110 + railLift, 178, 2, palette.cedarLight);
}

function drawBandPlayer(ctx, x, y, instrument, beat, response, palette) {
  const bow = Math.round(Math.sin(beat * Math.PI * (instrument === "fiddle" ? 2 : 1)) * (instrument === "fiddle" ? 3 : 1));
  const nod = (Math.floor(beat * 2) % 2 ? 1 : 0) - Math.round(response);
  const skin = instrument === "banjo" ? "#8f624d" : "#c7946d";
  pixelEllipse(ctx, x, y - 19 + nod, 6, 7, "#171615");
  pixelEllipse(ctx, x, y - 18 + nod, 5, 6, skin);
  polygon(ctx, [
    { x: x - 7, y: y - 12 + nod }, { x: x + 7, y: y - 12 + nod },
    { x: x + 9, y: y + 7 }, { x: x - 8, y: y + 7 },
  ], instrument === "bass" ? "#415b4d" : palette.indigo);
  pixelLine(ctx, { x: x - 5, y: y - 7 }, { x: x - 11, y: y + 4 + bow }, 4, skin);
  pixelLine(ctx, { x: x + 5, y: y - 7 }, { x: x + 11, y: y + 2 - bow }, 4, skin);
  if (instrument === "fiddle") {
    pixelEllipse(ctx, x + 3, y - 5, 8, 4, "#6b2c22");
    pixelEllipse(ctx, x + 3, y - 5, 6, 3, palette.fiddle);
    pixelLine(ctx, { x: x + 8, y: y - 6 }, { x: x + 15, y: y - 10 }, 2, "#6b3524");
    pixelLine(ctx, { x: x - 11, y: y - 8 + bow }, { x: x + 14, y: y - 1 - bow }, 1, palette.chalk);
  } else if (instrument === "banjo") {
    pixelEllipse(ctx, x + 2, y - 2, 8, 8, "#51362a");
    pixelEllipse(ctx, x + 2, y - 2, 6, 6, palette.chalk);
    pixelEllipse(ctx, x + 2, y - 2, 2, 2, "#5f4939");
    pixelLine(ctx, { x: x + 7, y: y - 4 }, { x: x + 15, y: y - 10 }, 2, "#9c5736");
  } else if (instrument === "guitar") {
    pixelEllipse(ctx, x - 2, y, 6, 7, "#743022");
    pixelEllipse(ctx, x + 4, y - 2, 7, 8, palette.fiddle);
    pixelEllipse(ctx, x + 2, y - 1, 2, 2, "#2b211e");
    pixelLine(ctx, { x: x + 7, y: y - 5 }, { x: x + 15, y: y - 12 }, 3, "#8c4b32");
  } else {
    pixelEllipse(ctx, x + 6, y - 1, 9, 15, "#6d2d22");
    pixelEllipse(ctx, x + 6, y - 1, 7, 13, palette.fiddle);
    pixelEllipse(ctx, x + 6, y - 3, 2, 3, "#2b211e");
    pixelLine(ctx, { x: x + 6, y: y - 12 }, { x: x + 7, y: y - 31 }, 2, "#8c4b32");
  }
  pixelLine(ctx, { x: x - 4, y: y + 6 }, { x: x - 6, y: y + 18 }, 4, "#1b1817");
  pixelLine(ctx, { x: x + 4, y: y + 6 }, { x: x + 6, y: y + 18 }, 4, "#1b1817");
  pixelRect(ctx, x - 9, y + 17, 7, 2, "#0d1010");
  pixelRect(ctx, x + 3, y + 17, 7, 2, "#0d1010");
}

function drawHallAudience(ctx, beat, response, heat, palette) {
  const people = [
    [18, 104, "#34483d"], [39, 112, "#4f3441"], [61, 105, "#2d3c50"], [82, 113, "#4b4430"],
    [304, 111, "#34483d"], [326, 104, "#54362e"], [348, 111, "#2d3c50"], [370, 103, "#493248"],
  ];
  const energy = response + heat / 180;
  for (const [index, [x, y, shirt]] of people.entries()) {
    const nod = Math.sin(beat * Math.PI + index * 0.7) > 0.25 ? -Math.round(energy) : 0;
    drawAudienceFigure(ctx, x, y + nod, shirt, index, response);
  }
}

function drawAudienceFigure(ctx, x, y, shirt, index, response) {
  const skin = index % 3 === 0 ? "#95664e" : index % 3 === 1 ? "#c18c68" : "#ddad83";
  const seated = index % 2 === 0;
  pixelEllipse(ctx, x, y - 17, 6, 7, "#161717");
  pixelEllipse(ctx, x, y - 16, 5, 6, skin);
  if (index % 3 === 0) pixelRect(ctx, x - 5, y - 22, 10, 3, "#3a2822");
  polygon(ctx, [
    { x: x - 7, y: y - 10 }, { x: x + 7, y: y - 10 },
    { x: x + 6, y: y + 6 }, { x: x - 6, y: y + 6 },
  ], shirt);
  if (response > 0.45 && (index === 1 || index === 6)) {
    pixelLine(ctx, { x: x - 5, y: y - 7 }, { x: x - 10, y: y - 21 }, 3, skin);
  } else {
    pixelLine(ctx, { x: x - 5, y: y - 7 }, { x: x - 9, y: y + 2 }, 3, skin);
  }
  pixelLine(ctx, { x: x + 5, y: y - 7 }, { x: x + 9, y: y + 1 }, 3, skin);
  if (seated) {
    pixelLine(ctx, { x: x - 4, y: y + 5 }, { x: x - 9, y: y + 10 }, 4, "#242521");
    pixelLine(ctx, { x: x + 4, y: y + 5 }, { x: x + 9, y: y + 10 }, 4, "#242521");
  } else {
    pixelLine(ctx, { x: x - 3, y: y + 5 }, { x: x - 4, y: y + 13 }, 4, "#242521");
    pixelLine(ctx, { x: x + 3, y: y + 5 }, { x: x + 4, y: y + 13 }, 4, "#242521");
  }
}

function drawSideQuilts(ctx, palette) {
  for (const startX of [8, 344]) {
    pixelRect(ctx, startX, 48, 32, 32, "#171817");
    pixelRect(ctx, startX + 2, 50, 28, 28, "#d7c28e");
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        const x = startX + 3 + column * 14;
        const y = 51 + row * 14;
        const color = (row + column) % 2 ? palette.fiddle : palette.indigo;
        polygon(ctx, [
          { x: x + 7, y }, { x: x + 13, y: y + 7 },
          { x: x + 7, y: y + 13 }, { x, y: y + 7 },
        ], color);
        pixelEllipse(ctx, x + 7, y + 7, 2, 2, palette.amber);
      }
    }
  }
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
