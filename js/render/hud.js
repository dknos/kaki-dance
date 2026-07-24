import { characterMoveName } from "../dance/character-catalog.js";
import { getMoveDefinition } from "../dance/move-catalog.js";
import { clamp } from "../core/math.js";
import { drawPixelText } from "./pixel-font.js";
import { pixelEllipse, pixelRect } from "./primitives.js";

export function drawHud(ctx, snapshot, settings) {
  if (!snapshot?.started) return;
  if (snapshot.frolic) {
    drawFrolicHud(ctx, snapshot, settings);
    return;
  }
  if (snapshot.measureMatch) {
    drawMeasureMatchHud(ctx, snapshot, settings);
    return;
  }
  drawTopRail(ctx, snapshot);
  drawStamina(ctx, snapshot.dancer.stamina);
  drawCrowdHeat(ctx, snapshot.crowdHeat);
  drawMoveChain(ctx, snapshot);
  if (snapshot.mode === "practice") drawPracticeCoach(ctx, snapshot, settings);
  if (settings.beatPulse && snapshot.mode === "practice") drawBeatPips(ctx, snapshot);
  if (snapshot.callout) drawCallout(ctx, snapshot.callout, snapshot.calloutAge);
}

function drawFrolicHud(ctx, snapshot, settings) {
  const frolic = snapshot.frolic;
  const palette = {
    ink: "#0a1514",
    panel: "#182923",
    chalk: "#e8d9b9",
    amber: "#f2bd65",
    cedar: "#b64d32",
    mint: "#78b79b",
    indigo: "#59658d",
  };
  pixelRect(ctx, 6, 6, 124, 19, palette.ink);
  pixelRect(ctx, 7, 7, 122, 17, palette.panel);
  drawPixelText(ctx, snapshot.mode === "stepShed" ? "STEP SHED" : "APPALACHIAN FROLIC", 12, 10, {
    color: palette.amber,
    scale: 1,
  });
  drawPixelText(ctx, frolic.profile.displayName.toUpperCase(), 12, 17, {
    color: palette.chalk,
    scale: 1,
  });

  pixelRect(ctx, 279, 6, 99, 19, palette.ink);
  pixelRect(ctx, 280, 7, 97, 17, palette.panel);
  const bar = String(frolic.bar).padStart(2, "0");
  drawPixelText(ctx, `${frolic.strain.id} · BAR ${bar}/32`, 372, 10, {
    align: "right",
    color: palette.chalk,
    scale: 1,
  });
  drawPixelText(ctx, frolic.stateLabel, 372, 17, {
    align: "right",
    color: stateColor(frolic.state, palette),
    scale: 1,
  });

  drawFrolicPhraseRail(ctx, frolic, palette);
  if (frolic.countInBeat > 0) {
    drawPixelText(ctx, String(Math.min(8, frolic.countInBeat)), 192, 54, {
      align: "center",
      color: palette.amber,
      scale: 4,
      shadow: palette.ink,
    });
    drawPixelText(ctx, "TWO BARS · FIND THE PULSE", 192, 82, {
      align: "center",
      color: palette.chalk,
      scale: 1,
      shadow: palette.ink,
    });
  } else if (frolic.practice) {
    drawStepShedCoach(ctx, frolic.practice, palette);
  } else {
    drawMoveBadge(ctx, snapshot, palette);
    drawRestraintMeter(ctx, frolic.restraint, palette);
  }
  if (snapshot.callout && settings.timingLabels) drawCallout(ctx, snapshot.callout, snapshot.calloutAge, 59);
  if (settings.frolicDebug) drawFrolicDebug(ctx, snapshot, palette, settings);
}

function drawFrolicPhraseRail(ctx, frolic, palette) {
  const startX = 141;
  const y = 10;
  const strainIndex = ["A1", "A2", "B1", "B2"].indexOf(frolic.strain.id);
  for (let index = 0; index < 4; index += 1) {
    const active = index === strainIndex;
    pixelRect(ctx, startX + index * 27, y, 23, 6, active ? palette.amber : palette.ink);
    pixelRect(ctx, startX + index * 27 + 1, y + 1, 21, 4, active ? palette.cedar : palette.indigo);
  }
  const localBar = (frolic.bar - 1) % 8;
  for (let index = 0; index < 8; index += 1) {
    pixelEllipse(ctx, 151 + index * 12, 21, index === localBar ? 2 : 1, index === localBar ? 2 : 1, index === localBar ? palette.amber : palette.indigo);
  }
}

function drawMoveBadge(ctx, snapshot, palette) {
  const move = snapshot.dancer.moveName || "Walking Step";
  const queued = snapshot.frolic.queuedMove;
  const width = Math.min(94, Math.max(62, move.length * 4 + 12));
  pixelRect(ctx, 7, 35, width, queued ? 24 : 17, palette.ink);
  pixelRect(ctx, 8, 36, width - 2, queued ? 22 : 15, palette.panel);
  drawPixelText(ctx, move.toUpperCase(), 12, 40, { color: palette.chalk, scale: 1 });
  drawPixelText(ctx, `WEIGHT ${snapshot.frolic.supportingFoot.toUpperCase()}`, 12, 47, {
    color: palette.mint,
    scale: 1,
  });
  if (queued) drawPixelText(ctx, `NEXT ${queued.toUpperCase()}`, 12, 54, { color: palette.amber, scale: 1 });
}

function drawRestraintMeter(ctx, value, palette) {
  const normalized = clamp(Number(value) || 0, 0, 1);
  pixelRect(ctx, 309, 35, 68, 17, palette.ink);
  pixelRect(ctx, 310, 36, 66, 15, palette.panel);
  drawPixelText(ctx, "AIR IN THE TUNE", 372, 39, { align: "right", color: palette.chalk, scale: 1 });
  pixelRect(ctx, 316, 47, 55, 2, palette.indigo);
  pixelRect(ctx, 316, 47, Math.round(55 * normalized), 2, normalized < 0.55 ? palette.cedar : palette.mint);
}

function drawStepShedCoach(ctx, lesson, palette) {
  pixelRect(ctx, 7, 35, 153, 38, palette.ink);
  pixelRect(ctx, 8, 36, 151, 36, palette.panel);
  drawPixelText(ctx, `LESSON ${lesson.lesson}/${lesson.totalLessons}`, 13, 40, { color: palette.amber, scale: 1 });
  drawPixelText(ctx, lesson.title.toUpperCase(), 13, 48, { color: palette.chalk, scale: 1 });
  const instruction = lesson.instruction.length > 35
    ? `${lesson.instruction.slice(0, 34)}…`
    : lesson.instruction;
  drawPixelText(ctx, instruction.toUpperCase(), 13, 57, { color: palette.mint, scale: 1 });
  const progress = lesson.required ? lesson.progress / lesson.required : 0;
  pixelRect(ctx, 13, 67, 138, 2, palette.indigo);
  pixelRect(ctx, 13, 67, Math.round(138 * clamp(progress, 0, 1)), 2, palette.amber);
}

function drawFrolicDebug(ctx, snapshot, palette, settings) {
  const frolic = snapshot.frolic;
  pixelRect(ctx, 6, 78, 145, 51, "rgba(4,10,9,0.88)");
  const lines = [
    `${frolic.strain.id} ${frolic.state} T${Math.round(frolic.tick)}`,
    `NOW ${frolic.currentMove || "-"} > ${frolic.queuedMove || "-"}`,
    `SUPPORT ${frolic.supportingFoot} CONTACT ${frolic.lastInput?.articulation ?? "-"}`,
    `INPUT ${frolic.lastInput?.kind ?? "-"} OFF ${Math.round(frolic.lastInput?.timingOffsetTicks ?? 0)}`,
    `A/V ${settings.audioLatencyMs ?? 0}/${settings.visualLatencyMs ?? 0}MS`,
  ];
  lines.forEach((line, index) => drawPixelText(ctx, line.toUpperCase(), 10, 82 + index * 9, {
    color: index ? palette.chalk : palette.amber,
    scale: 1,
  }));
}

function stateColor(state, palette) {
  if (state === "TRADE_CALL") return palette.amber;
  if (state === "TRADE_RESPONSE") return palette.mint;
  if (state === "TURNAROUND" || state === "FINISH") return palette.cedar;
  return palette.chalk;
}

function drawMeasureMatchHud(ctx, snapshot, settings) {
  const measure = snapshot.measureMatch;
  drawMeasureTopRail(ctx, snapshot, measure);
  drawMeasureStrip(ctx, measure);
  drawMeasureInstruction(ctx, measure);
  if (snapshot.callout && settings.timingLabels) {
    if (measure.state === "call") {
      drawMeasureResultBadge(ctx, snapshot.callout, snapshot.calloutAge);
    } else {
      drawCallout(ctx, snapshot.callout, snapshot.calloutAge, 39);
    }
  }
}

function drawMeasureResultBadge(ctx, message, age) {
  const alpha = age < 0.15 ? age / 0.15 : age > 0.82 ? Math.max(0, (1.1 - age) / 0.28) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  const width = Math.min(87, Math.max(47, message.length * 4 + 10));
  pixelRect(ctx, 377 - width, 39, width, 11, "#090b1b");
  pixelRect(ctx, 378 - width, 40, width - 2, 9, "#24264b");
  drawPixelText(ctx, message, 372, 42, {
    align: "right",
    color: "#f4c95d",
    scale: 1,
  });
  ctx.restore();
}

function drawMeasureTopRail(ctx, snapshot, measure) {
  pixelRect(ctx, 7, 7, 103, 15, "#090b1b");
  pixelRect(ctx, 8, 8, 101, 13, "#1c2143");
  drawPixelText(ctx, "MEASURE MATCH", 13, 12, { color: "#63d6b3", scale: 1 });
  const bar = Math.max(1, Math.min(16, measure.bar));
  drawPixelText(ctx, `BAR ${String(bar).padStart(2, "0")}/16`, 372, 12, {
    align: "right",
    color: "#f5e9c9",
    scale: 1,
    shadow: "#090b1b",
  });
  if (measure.phraseStreak > 0) {
    pixelRect(ctx, 304, 25, 70, 11, "#090b1b");
    drawPixelText(ctx, `PHRASE ${measure.phraseStreak}`, 369, 28, {
      align: "right",
      color: "#f4c95d",
      scale: 1,
    });
  }
}

function drawMeasureInstruction(ctx, measure) {
  if (measure.state === "countIn") {
    const count = Math.min(4, Math.floor(measure.tick / 4) + 1);
    drawPixelText(ctx, String(count), 192, 31, {
      align: "center",
      color: "#f5e9c9",
      scale: 4,
      shadow: "#090b1b",
    });
    drawPixelText(ctx, "GET IN THE POCKET", 192, 60, {
      align: "center",
      color: "#8f86d9",
      scale: 1,
      shadow: "#090b1b",
    });
    return;
  }
  const color = measure.state === "call"
    ? "#f4c95d"
    : measure.state === "copy"
      ? "#63d6b3"
      : measure.state === "freeze"
        ? "#f46b45"
        : "#f5e9c9";
  drawPixelText(ctx, measure.label, 192, 25, {
    align: "center",
    color,
    scale: measure.state === "call" || measure.state === "copy" ? 2 : 1,
    shadow: "#090b1b",
  });
  if (measure.state === "call" && measure.onboarding) {
    drawPixelText(ctx, "HEAR ONE BAR", 192, 42, {
      align: "center",
      color: "#f5e9c9",
      scale: 1,
      shadow: "#090b1b",
    });
  } else if (measure.state === "copy" && measure.onboarding) {
    drawPixelText(ctx, `TAP ${measure.inputPrompt} ON THE LIT CELLS`, 192, 42, {
      align: "center",
      color: "#f5e9c9",
      scale: 1,
      shadow: "#090b1b",
    });
  }
}

function drawMeasureStrip(ctx, measure) {
  const cellWidth = 13;
  const cellHeight = 11;
  const gap = 1;
  const beatGap = 3;
  const totalWidth = 16 * cellWidth + 15 * gap + 3 * beatGap;
  const startX = Math.round((384 - totalWidth) / 2);
  const y = 188;
  pixelRect(ctx, startX - 6, y - 15, totalWidth + 12, cellHeight + 22, "#090b1b");
  pixelRect(ctx, startX - 5, y - 14, totalWidth + 10, cellHeight + 20, "#171b35");
  drawPixelText(ctx, measure.state === "call" ? "LISTEN" : measure.state === "copy" ? "COPY" : "ONE BAR", startX, y - 11, {
    color: measure.state === "call" ? "#f4c95d" : "#63d6b3",
    scale: 1,
  });
  drawPixelText(ctx, "[....] [....] [....] [....]", startX + totalWidth, y - 11, {
    align: "right",
    color: "#615b8d",
    scale: 1,
  });
  let x = startX;
  for (let index = 0; index < 16; index += 1) {
    const cell = measure.cells[index] ?? { status: "empty" };
    const playhead = Math.floor(measure.playheadTick) === index;
    const downbeat = index % 4 === 0;
    const fill = measureCellColor(cell, measure, index);
    pixelRect(ctx, x - 1, y - 1, cellWidth + 2, cellHeight + 2, playhead ? "#fff5dc" : downbeat ? "#514b78" : "#292647");
    pixelRect(ctx, x, y, cellWidth, cellHeight, fill);
    if (cell.target) {
      const strengthHeight = (cell.status === "hit" || cell.status === "style" ? 3 : 2)
        + Math.round((cell.strength ?? 0.7) * 3);
      pixelRect(ctx, x + 4, y + cellHeight - strengthHeight - 2, 5, strengthHeight, cellAccentColor(cell));
    }
    if (cell.status === "miss") {
      pixelRect(ctx, x + 2, y + 2, 2, 2, "#ce4772");
      pixelRect(ctx, x + cellWidth - 4, y + cellHeight - 4, 2, 2, "#ce4772");
    }
    if (cell.errorMs != null && Math.abs(cell.errorMs) > 45) {
      const markerX = cell.errorMs < 0 ? x + 2 : x + cellWidth - 3;
      pixelRect(ctx, markerX, y + 2, 1, cellHeight - 4, cell.errorMs < 0 ? "#8f86d9" : "#f46b45");
    }
    x += cellWidth + gap;
    if (index % 4 === 3 && index !== 15) x += beatGap;
  }
}

function measureCellColor(cell, measure, index) {
  if (cell.status === "hit") return cell.judgment === "perfect" ? "#397f74" : "#285f59";
  if (cell.status === "style") return "#5f5598";
  if (cell.status === "miss") return "#4b233e";
  if (cell.optional && !cell.target) return "#29264e";
  if (!cell.target) return "#161831";
  if (measure.state === "call" && measure.playheadTick >= index && measure.playheadTick < index + 0.85) return "#7d6535";
  return measure.state === "call" ? "#4e432e" : "#34464b";
}

function cellAccentColor(cell) {
  if (cell.status === "hit") return cell.judgment === "perfect" ? "#fff5dc" : "#63d6b3";
  if (cell.status === "style") return "#d2c4ff";
  if (cell.status === "miss") return "#ce4772";
  return cell.optional ? "#8f86d9" : "#f5e9c9";
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

function drawCallout(ctx, message, age, y = 42) {
  const alpha = age < 0.15 ? age / 0.15 : age > 0.82 ? Math.max(0, (1.1 - age) / 0.28) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  const scale = message.length < 11 ? 2 : 1;
  drawPixelText(ctx, message, 192, y, { align: "center", color: "#f5e9c9", scale, shadow: "#090b1b" });
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
