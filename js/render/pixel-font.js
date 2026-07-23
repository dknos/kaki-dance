import { pixelRect } from "./primitives.js";

const GLYPHS = Object.freeze({
  A: ["010","101","111","101","101"], B: ["110","101","110","101","110"],
  C: ["011","100","100","100","011"], D: ["110","101","101","101","110"],
  E: ["111","100","110","100","111"], F: ["111","100","110","100","100"],
  G: ["011","100","101","101","011"], H: ["101","101","111","101","101"],
  I: ["111","010","010","010","111"], J: ["001","001","001","101","010"],
  K: ["101","101","110","101","101"], L: ["100","100","100","100","111"],
  M: ["101","111","111","101","101"], N: ["101","111","111","111","101"],
  O: ["010","101","101","101","010"], P: ["110","101","110","100","100"],
  Q: ["010","101","101","111","011"], R: ["110","101","110","101","101"],
  S: ["011","100","010","001","110"], T: ["111","010","010","010","010"],
  U: ["101","101","101","101","111"], V: ["101","101","101","101","010"],
  W: ["101","101","111","111","101"], X: ["101","101","010","101","101"],
  Y: ["101","101","010","010","010"], Z: ["111","001","010","100","111"],
  0: ["111","101","101","101","111"], 1: ["010","110","010","010","111"],
  2: ["110","001","010","100","111"], 3: ["110","001","010","001","110"],
  4: ["101","101","111","001","001"], 5: ["111","100","110","001","110"],
  6: ["011","100","110","101","010"], 7: ["111","001","010","010","010"],
  8: ["010","101","010","101","010"], 9: ["010","101","011","001","110"],
  "!": ["1","1","1","0","1"], "?": ["110","001","010","000","010"],
  ":": ["0","1","0","1","0"], ".": ["0","0","0","0","1"], "-": ["0","0","111","0","0"],
  "/": ["001","001","010","100","100"], "+": ["0","010","111","010","0"],
  " ": ["0","0","0","0","0"],
});

export function drawPixelText(ctx, text, x, y, {
  color = "#fff",
  scale = 1,
  align = "left",
  shadow = "",
  spacing = 1,
} = {}) {
  const content = String(text ?? "").toUpperCase();
  const width = measurePixelText(content, scale, spacing);
  let cursor = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  for (const character of content) {
    const glyph = GLYPHS[character] ?? GLYPHS["?"];
    if (shadow) drawGlyph(ctx, glyph, cursor + scale, y + scale, scale, shadow);
    drawGlyph(ctx, glyph, cursor, y, scale, color);
    cursor += (glyphWidth(glyph) + spacing) * scale;
  }
  return width;
}

export function measurePixelText(text, scale = 1, spacing = 1) {
  let width = 0;
  for (const character of String(text ?? "").toUpperCase()) {
    width += (glyphWidth(GLYPHS[character] ?? GLYPHS["?"]) + spacing) * scale;
  }
  return Math.max(0, width - spacing * scale);
}

function drawGlyph(ctx, glyph, x, y, scale, color) {
  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] === "1") pixelRect(ctx, x + column * scale, y + row * scale, scale, scale, color);
    }
  }
}

function glyphWidth(glyph) {
  return Math.max(...glyph.map((row) => row.length));
}
