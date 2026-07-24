import { clamp } from "../core/math.js";

const CHARACTER_IDS = Object.freeze(["kitty", "soder"]);
const ATLAS_URLS = Object.freeze(Object.fromEntries(CHARACTER_IDS.map((id) => [
  id,
  new URL(`../../assets/heroes/${id}/atlas.json`, import.meta.url),
])));

const MOVE_TO_CLIP = Object.freeze({
  basicRock: "basicRock",
  crossStep: "basicRock",
  indianStep: "basicRock",
  salsaStep: "basicRock",
  kickStep: "basicRock",
  basicGoDown: "basicGoDown",
  sixStep: "sixStep",
  cc: "sixStep",
  sweep: "sixStep",
  coffeeGrinder: "sixStep",
  windmill: "windmill",
  flare: "windmill",
  swipe: "windmill",
  backspin: "windmill",
  headspin: "windmill",
  babyFreeze: "babyFreeze",
  chairFreeze: "babyFreeze",
  turtleFreeze: "babyFreeze",
  headstandFreeze: "babyFreeze",
  cleanGetUp: "cleanGetUp",
});

export class HeroAtlasLibrary {
  constructor({
    fetchImpl = globalThis.fetch?.bind(globalThis),
    imageFactory = () => new Image(),
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.imageFactory = imageFactory;
    this.records = new Map();
  }

  preload(character) {
    const id = normalizeAtlasCharacter(character);
    const existing = this.records.get(id);
    if (existing?.promise) return existing.promise;
    const record = { status: "loading", metadata: null, pages: [], error: null, promise: null };
    record.promise = this.loadRecord(id, record);
    this.records.set(id, record);
    return record.promise;
  }

  get(character) {
    return this.records.get(normalizeAtlasCharacter(character)) ?? null;
  }

  releaseAll() {
    this.records.clear();
  }

  activeKeys() {
    return Object.freeze([...this.records.keys()]);
  }

  async loadRecord(id, record) {
    try {
      if (!this.fetchImpl) throw new Error("Fetch is unavailable.");
      const metadataUrl = ATLAS_URLS[id];
      const response = await this.fetchImpl(metadataUrl);
      if (!response.ok) throw new Error(`Hero atlas metadata failed: ${response.status}`);
      const metadata = await response.json();
      const errors = validateAtlasMetadata(metadata);
      if (errors.length) throw new Error(errors.join(" "));
      const pages = await Promise.all(metadata.pages.map((filename) => loadImage(
        this.imageFactory,
        new URL(filename, metadataUrl).href,
      )));
      record.metadata = Object.freeze(metadata);
      record.pages = Object.freeze(pages);
      record.status = "ready";
      return record;
    } catch (error) {
      record.status = "error";
      record.error = error;
      return record;
    }
  }
}

export const sharedHeroAtlasLibrary = new HeroAtlasLibrary();

export class AtlasHeroRenderer {
  constructor(options = {}) {
    this.library = options.library ?? sharedHeroAtlasLibrary;
    this.scratch = null;
  }

  preload(character) {
    return this.library.preload(character);
  }

  select(dancer, character, phase = null) {
    const id = normalizeAtlasCharacter(character);
    const record = this.library.get(id);
    if (!record) {
      this.preload(id);
      return null;
    }
    if (record.status !== "ready") return null;
    return Object.freeze({
      character: id,
      ...selectAtlasFrame(record.metadata, dancer, phase),
    });
  }

  draw(ctx, dancer, character, {
    x = 192,
    floorY = 158,
    scale = 1,
    alpha = 1,
    ghost = false,
    phase = null,
    debug = null,
    silhouette = false,
  } = {}) {
    const selection = this.select(dancer, character, phase);
    if (!selection) return null;
    const id = selection.character;
    const record = this.library.get(id);
    const frame = selection.frame;
    const page = record.pages[frame.page];
    if (!page) return null;
    const mirror = Boolean(dancer?.mirror && selection.clip.mirroringSafe);
    const accent = clamp(Number(dancer?.accentQuality) || 0, 0, 1);
    const impact = accent >= 0.6 ? (accent - 0.6) / 0.4 : 0;
    const scaleX = scale * (1 + impact * 0.025);
    const scaleY = scale * (1 - impact * 0.03);
    const drawX = Math.round(x - frame.pivot[0] * scaleX);
    const drawY = Math.round(floorY - frame.pivot[1] * scaleY);
    const drawWidth = Math.round(frame.w * scaleX);
    const drawHeight = Math.round(frame.h * scaleY);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = clamp(alpha, 0, 1) * (ghost ? 0.7 : 1);
    if (ghost) ctx.globalCompositeOperation = "screen";
    if (mirror) {
      ctx.translate(Math.round(x * 2), 0);
      ctx.scale(-1, 1);
    }
    if (silhouette) {
      const sprite = this.silhouetteFrame(page, frame);
      ctx.drawImage(sprite, 0, 0, frame.w, frame.h, drawX, drawY, drawWidth, drawHeight);
    } else {
      ctx.drawImage(
        page,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
      );
    }
    if ((dancer?.missAccent ?? 0) > 0.25) {
      drawMissExpression(ctx, frame, {
        drawX,
        drawY,
        scaleX,
        scaleY,
      });
    }
    if (debug) drawAtlasDebug(ctx, frame, { x, floorY, scale, drawX, drawY, debug });
    ctx.restore();
    return Object.freeze({
      character: id,
      clipId: selection.clipId,
      frameIndex: selection.frameIndex,
      frame,
      mirror,
    });
  }

  silhouetteFrame(page, frame) {
    if (!this.scratch) this.scratch = document.createElement("canvas");
    const scratch = this.scratch;
    scratch.width = frame.w;
    scratch.height = frame.h;
    const context = scratch.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, frame.w, frame.h);
    context.drawImage(page, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = "#f5e9c9";
    context.fillRect(0, 0, frame.w, frame.h);
    context.globalCompositeOperation = "source-over";
    return scratch;
  }
}

function drawMissExpression(ctx, frame, {
  drawX,
  drawY,
  scaleX,
  scaleY,
}) {
  const head = frame.effectAnchors?.head;
  if (!head) return;
  const x = Math.round(drawX + head[0] * scaleX + 7 * scaleX);
  const y = Math.round(drawY + head[1] * scaleY - 5 * scaleY);
  ctx.fillStyle = "#8f86d9";
  ctx.fillRect(x, y, 2, 2);
  ctx.fillRect(x + 1, y + 2, 1, 2);
}

export function selectAtlasFrame(metadata, dancer = {}, phaseOverride = null) {
  const clipId = resolveAtlasClip(dancer);
  const clip = metadata.clips[clipId] ?? metadata.clips.idleGroove;
  const rawPhase = phaseOverride
    ?? dancer.presentationPhase
    ?? dancer.atlasPhase
    ?? dancer.phase
    ?? 0;
  const phase = clamp(Number(rawPhase) || 0, 0, 1);
  const frameIndex = Math.min(
    clip.frames.length - 1,
    Math.max(0, Math.floor(phase * clip.frames.length)),
  );
  return Object.freeze({
    clipId,
    clip,
    frameIndex,
    frame: clip.frames[frameIndex],
    phase,
  });
}

export function resolveAtlasClip(dancer = {}) {
  if (dancer.presentationClip) return dancer.presentationClip;
  if (dancer.atlasClip) return dancer.atlasClip;
  if (MOVE_TO_CLIP[dancer.moveId]) return MOVE_TO_CLIP[dancer.moveId];
  if (dancer.family === "toprock") return "basicRock";
  if (dancer.family === "footwork") return "sixStep";
  if (dancer.family === "power") return "windmill";
  if (dancer.family === "freeze") return "babyFreeze";
  if (dancer.family === "recovery") return "missRecovery";
  if (dancer.victory) return "victory";
  return "idleGroove";
}

export function validateAtlasMetadata(value) {
  const errors = [];
  if (!value || typeof value !== "object") return ["Atlas metadata must be an object."];
  if (value.schemaVersion !== 1) errors.push("Atlas schemaVersion must be 1.");
  if (value.topology !== "biped") errors.push("Atlas topology must be biped.");
  if (!CHARACTER_IDS.includes(value.character)) errors.push("Unknown atlas character.");
  if (!Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > 2) {
    errors.push("Atlas requires one or two pages.");
  }
  if (!value.clips || typeof value.clips !== "object") errors.push("Atlas clips are required.");
  for (const [clipId, clip] of Object.entries(value.clips ?? {})) {
    if (!(Number(clip.durationBeats) > 0)) errors.push(`${clipId} durationBeats must be positive.`);
    if (!clip.entryStance || !clip.exitStance) {
      errors.push(`${clipId} requires entryStance and exitStance.`);
    }
    if (typeof clip.mirroringSafe !== "boolean") {
      errors.push(`${clipId} requires a mirroringSafe declaration.`);
    }
    if (!Array.isArray(clip.accentPhases) || !clip.accentPhases.every(Number.isFinite)) {
      errors.push(`${clipId} requires finite accentPhases.`);
    }
    if (!Array.isArray(clip.frames) || !clip.frames.length) {
      errors.push(`${clipId} requires frames.`);
      continue;
    }
    for (const [index, frame] of clip.frames.entries()) {
      if (![frame.x, frame.y, frame.w, frame.h, ...frame.pivot].every(Number.isFinite)) {
        errors.push(`${clipId}[${index}] has invalid bounds or pivot.`);
      }
      if (!frame.semanticAnchors?.root || !frame.effectAnchors?.head) {
        errors.push(`${clipId}[${index}] lacks semantic/effect anchors.`);
      }
      if (!Array.isArray(frame.markers)) {
        errors.push(`${clipId}[${index}] lacks animation markers.`);
      }
      if (Object.keys(frame.segmentDepth ?? {}).length !== 12) {
        errors.push(`${clipId}[${index}] needs twelve segment depth values.`);
      }
    }
  }
  return errors;
}

function normalizeAtlasCharacter(value) {
  const id = typeof value === "string" ? value : value?.id ?? value?.profileId;
  return id === "soder" ? "soder" : "kitty";
}

function loadImage(imageFactory, source) {
  return new Promise((resolve, reject) => {
    const image = imageFactory();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Hero atlas page failed: ${source}`));
    image.src = source;
  });
}

function drawAtlasDebug(ctx, frame, {
  x,
  floorY,
  scale,
  drawX,
  drawY,
  debug,
}) {
  if (debug.bounds) {
    ctx.strokeStyle = "#f4c95d";
    ctx.lineWidth = 1;
    ctx.strokeRect(drawX + 0.5, drawY + 0.5, frame.w * scale - 1, frame.h * scale - 1);
  }
  if (debug.pivot) {
    ctx.fillStyle = "#f46b45";
    ctx.fillRect(Math.round(x) - 2, Math.round(floorY), 5, 1);
    ctx.fillRect(Math.round(x), Math.round(floorY) - 2, 1, 5);
  }
  if (debug.anchors) {
    for (const [name, anchor] of Object.entries(frame.semanticAnchors)) {
      const px = drawX + anchor[0] * scale;
      const py = drawY + anchor[1] * scale;
      ctx.fillStyle = name.startsWith("left") ? "#63d6b3" : name.startsWith("right") ? "#f46b45" : "#f4c95d";
      ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
    }
  }
}
