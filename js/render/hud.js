import { characterMoveName } from "../dance/character-catalog.js";
import { getMoveDefinition } from "../dance/move-catalog.js";
import { clamp } from "../core/math.js";
import { drawPixelText } from "./pixel-font.js";
import { pixelEllipse, pixelRect } from "./primitives.js";

export function drawHud(ctx, snapshot, settings) {
  if (!snapshot?.started) return;
  drawTopRail(ctx, snapshot);
  drawStamina(ctx, snapshot.dancer.stamina);
  drawCrowdHeat(ctx, snapshot.crowdHeat);
  drawMoveChain(ctx, snapshot);
  if (snapshot.mode === "practice") drawPracticeCoach(ctx, snapshot, settings);
  if (settings.beatPulse && snapshot.mode === "practice") drawBeatPips(ctx, snapshot);
  if (snapshot.callout) drawCallout(ctx, snapshot.callout, snapshot.calloutAge);
}

function drawTopRail(ctx, snapshot) {
  ctx.save();
  ctx.globalAlpha = 0.88;
  pixelRect(ctx, 7, 7, 92, 14, "#090b1b");
  pixelRect(ctx, 8, 8, 90, 12, "#1c2143");
  const mode = snapshot.mode === "battle"
    ? `${snapshot.performer === "player" ? "YOUR" : "MIKAN"} R${snapshot.round}`
    : snapshot.mode.toUpperCase();
  drawPixelText(ctx, mode, 12, 11, { color: "#f5e9c9", scale: 1 });
  if (Number.isFinite(snapshot.remainingBeats)) {
    const remainingBars = Math.max(0, Math.ceil(snapshot.remainingBeats / 4));
    drawPixelText(ctx, `${remainingBars} BARS`, 372, 11, { align: "right", color: "#f5e9c9", scale: 1, shadow: "#090b1b" });
  } else {
    drawPixelText(ctx, "OPEN FLOOR", 372, 11, { align: "right", color: "#f5e9c9", scale: 1, shadow: "#090b1b" });
  }
  ctx.restore();
}

function drawStamina(ctx, value) {
  pixelRect(ctx, 9, 25, 52, 6, "#090b1b");
  pixelRect(ctx, 10, 26, 50, 4, "#27254a");
  const width = Math.round(clamp(value / 100, 0, 1) * 50);
  pixelRect(ctx, 10, 26, width, 4, value < 24 ? "#ce4772" : "#63d6b3");
  drawPixelText(ctx, "STAM", 64, 26, { color: "#c9bda6", scale: 1 });
}

function drawCrowdHeat(ctx, heat) {
  pixelRect(ctx, 323, 25, 52, 6, "#090b1b");
  pixelRect(ctx, 324, 26, 50, 4, "#27254a");
  pixelRect(ctx, 324, 26, Math.round(clamp(heat / 100, 0, 1) * 50), 4, heat > 72 ? "#f46b45" : "#8f86d9");
  drawPixelText(ctx, "HEAT", 319, 26, { align: "right", color: "#c9bda6", scale: 1 });
}

function drawMoveChain(ctx, snapshot) {
  const move = snapshot.dancer.moveId ? getMoveDefinition(snapshot.dancer.moveId) : null;
  if (!move) return;
  const name = characterMoveName(snapshot.character, move);
  const progress = snapshot.dancer.phase;
  const width = Math.max(66, Math.min(142, name.length * 4 + 18));
  pixelRect(ctx, 192 - width / 2, 190, width, 18, "#090b1b");
  pixelRect(ctx, 193 - width / 2, 191, width - 2, 16, "#1c2143");
  drawPixelText(ctx, name, 192, 194, { align: "center", color: "#f5e9c9", scale: 1 });
  pixelRect(ctx, 196 - width / 2, 202, width - 8, 2, "#34305a");
  pixelRect(ctx, 196 - width / 2, 202, Math.round((width - 8) * progress), 2, move.family === "power" ? "#f46b45" : "#63d6b3");
  if (snapshot.dancer.extensions) {
    drawPixelText(ctx, `X${snapshot.dancer.extensions + 1}`, 192 + width / 2 - 4, 194, { align: "right", color: "#f4c95d", scale: 1 });
  }
}

function drawPracticeCoach(ctx, snapshot, settings) {
  const next = getMoveDefinition(snapshot.practiceNext);
  if (!next) return;
  const y = snapshot.inputDevice === "touch" ? 35 : 178;
  pixelRect(ctx, 8, y, 111, 28, "#090b1b");
  pixelRect(ctx, 9, y + 1, 109, 26, "#24264b");
  drawPixelText(ctx, "GOLDEN CHAIN", 14, y + 5, { color: "#63d6b3", scale: 1 });
  drawPixelText(ctx, `NEXT ${next.displayName}`, 14, y + 15, { color: "#f5e9c9", scale: 1 });
  const prompt = promptForMove(next.id, snapshot.inputDevice);
  drawPixelText(ctx, prompt, 14, y + 22, { color: "#b9b1d9", scale: 1 });
}

function drawBeatPips(ctx, snapshot) {
  const beatInBar = snapshot.beat?.beatInBar ?? 0;
  for (let index = 0; index < 4; index += 1) {
    pixelEllipse(ctx, 177 + index * 10, 14, index === beatInBar ? 2 : 1, index === beatInBar ? 2 : 1, index === beatInBar ? "#f46b45" : "#8f86d9");
  }
}

function drawCallout(ctx, message, age) {
  const alpha = age < 0.15 ? age / 0.15 : age > 0.82 ? Math.max(0, (1.1 - age) / 0.28) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  const scale = message.length < 11 ? 2 : 1;
  drawPixelText(ctx, message, 192, 42, { align: "center", color: "#f5e9c9", scale, shadow: "#090b1b" });
  ctx.restore();
}

function promptForMove(id, device = "keyboard") {
  const keyboard = {
    basicRock: "ACTION",
    basicGoDown: "DOWN + ACTION",
    sixStep: "ACTION ON FLOOR",
    windmill: "POWER",
    babyFreeze: "FREEZE",
    cleanGetUp: "UP + ACTION",
  };
  const gamepad = {
    basicRock: "A",
    basicGoDown: "DOWN + A",
    sixStep: "A ON FLOOR",
    windmill: "Y",
    babyFreeze: "B",
    cleanGetUp: "UP + A",
  };
  const touch = {
    basicRock: "A",
    basicGoDown: "DOWN + A",
    sixStep: "A ON FLOOR",
    windmill: "P",
    babyFreeze: "F",
    cleanGetUp: "UP + A",
  };
  const prompts = device === "gamepad" ? gamepad : device === "touch" ? touch : keyboard;
  return prompts[id] ?? prompts.basicRock;
}
