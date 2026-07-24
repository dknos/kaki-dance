import { clamp } from "../core/math.js";
import { normalizeFrolicStyle } from "../appalachian/footwork-catalog.js";

const CHARACTER_IDS = Object.freeze(["kitty", "soder"]);

export class FrolicAtlasLibrary {
  constructor({
    fetchImpl = globalThis.fetch?.bind(globalThis),
    imageFactory = () => new Image(),
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.imageFactory = imageFactory;
    this.records = new Map();
  }

  key(character, style) {
    return `${normalizeCharacter(character)}:${normalizeFrolicStyle(style)}`;
  }

  url(character, style) {
    const id = normalizeCharacter(character);
    const profile = normalizeFrolicStyle(style);
    return new URL(`../../assets/heroes/${id}/frolic/${profile}/atlas.json`, import.meta.url);
  }

  preload(character, style) {
    const key = this.key(character, style);
    const existing = this.records.get(key);
    if (existing?.promise) return existing.promise;
    const record = {
      key,
      status: "loading",
      metadata: null,
      pages: [],
      error: null,
      promise: null,
    };
    record.promise = this.loadRecord(character, style, record);
    this.records.set(key, record);
    return record.promise;
  }

  get(character, style) {
    return this.records.get(this.key(character, style)) ?? null;
  }

  releaseAll() {
    this.records.clear();
  }

  releaseExcept(character, style) {
    const keep = this.key(character, style);
    for (const key of this.records.keys()) {
      if (key !== keep) this.records.delete(key);
    }
  }

  activeKeys() {
    return Object.freeze([...this.records.keys()]);
  }

  async loadRecord(character, style, record) {
    try {
      if (!this.fetchImpl) throw new Error("Fetch is unavailable.");
      const metadataUrl = this.url(character, style);
      const response = await this.fetchImpl(metadataUrl);
      if (!response.ok) throw new Error(`Frolic atlas metadata failed: ${response.status}`);
      const metadata = await response.json();
      const errors = validateFrolicAtlasMetadata(metadata, {
        character: normalizeCharacter(character),
        style: normalizeFrolicStyle(style),
      });
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

export const sharedFrolicAtlasLibrary = new FrolicAtlasLibrary();

export class FrolicAtlasRenderer {
  constructor({ library = sharedFrolicAtlasLibrary } = {}) {
    this.library = library;
    this.scratch = null;
  }

  preload(character, style) {
    return this.library.preload(character, style);
  }

  releaseAll() {
    this.library.releaseAll();
  }

  select(dancer, character, style, phaseOverride = null) {
    const record = this.library.get(character, style);
    if (!record) {
      this.preload(character, style);
      return null;
    }
    if (record.status !== "ready") return null;
    const clipId = record.metadata.clips[dancer?.presentationClip]
      ? dancer.presentationClip
      : "walkingStep";
    const clip = record.metadata.clips[clipId];
    const rawPhase = phaseOverride
      ?? dancer?.presentationPhase
      ?? dancer?.phase
      ?? 0;
    const phase = clamp(Number(rawPhase) || 0, 0, 1);
    const frameIndex = Math.min(
      clip.frames.length - 1,
      Math.max(0, Math.floor(phase * clip.frames.length)),
    );
    return Object.freeze({
      clipId,
      clip,
      frame: clip.frames[frameIndex],
      frameIndex,
      phase,
      record,
    });
  }

  draw(ctx, dancer, character, style, {
    x = 192,
    floorY = 178,
    scale = 1.25,
    alpha = 1,
    phase = null,
    debug = null,
    silhouette = false,
  } = {}) {
    const selection = this.select(dancer, character, style, phase);
    if (!selection) return null;
    const { frame, clip, record } = selection;
    const page = record.pages[frame.page];
    if (!page) return null;
    const mirror = Boolean(dancer?.mirror && clip.mirroringSafe);
    const micro = clamp(Number(dancer?.microResponse) || 0, 0, 1);
    const scaleX = scale * (1 + micro * 0.018);
    const scaleY = scale * (1 - micro * 0.014);
    const drawX = Math.round(x - frame.pivot[0] * scaleX);
    const drawY = Math.round(floorY - frame.pivot[1] * scaleY);
    const drawWidth = Math.round(frame.w * scaleX);
    const drawHeight = Math.round(frame.h * scaleY);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    if (mirror) {
      ctx.translate(Math.round(x * 2), 0);
      ctx.scale(-1, 1);
    }
    if (silhouette) {
      ctx.drawImage(this.silhouetteFrame(page, frame), 0, 0, frame.w, frame.h, drawX, drawY, drawWidth, drawHeight);
    } else {
      ctx.drawImage(page, frame.x, frame.y, frame.w, frame.h, drawX, drawY, drawWidth, drawHeight);
    }
    if (debug) drawDebug(ctx, frame, { drawX, drawY, scaleX, scaleY, x, floorY, debug });
    ctx.restore();
    return Object.freeze({
      character: normalizeCharacter(character),
      style: normalizeFrolicStyle(style),
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

export function validateFrolicAtlasMetadata(value, expected = {}) {
  const errors = [];
  if (!value || typeof value !== "object") return ["Frolic atlas metadata must be an object."];
  if (value.schemaVersion !== 1) errors.push("Frolic atlas schemaVersion must be 1.");
  if (value.pack !== "appalachian-frolic") errors.push("Frolic atlas pack id is invalid.");
  if (value.topology !== "biped") errors.push("Frolic atlas topology must be biped.");
  if (!CHARACTER_IDS.includes(value.character)) errors.push("Unknown Frolic atlas character.");
  if (expected.character && value.character !== expected.character) errors.push("Frolic atlas character mismatch.");
  if (expected.style && value.style !== expected.style) errors.push("Frolic atlas style mismatch.");
  if (!Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > 2) {
    errors.push("Frolic atlas requires one or two pages.");
  }
  if (!value.clips?.walkingStep) errors.push("Frolic atlas needs a walkingStep clip.");
  for (const [clipId, clip] of Object.entries(value.clips ?? {})) {
    if (!(clip.durationBeats > 0)) errors.push(`${clipId} needs positive durationBeats.`);
    if (!Array.isArray(clip.frames) || !clip.frames.length) {
      errors.push(`${clipId} needs frames.`);
      continue;
    }
    for (const [index, frame] of clip.frames.entries()) {
      if (![frame.x, frame.y, frame.w, frame.h, ...(frame.pivot ?? [])].every(Number.isFinite)) {
        errors.push(`${clipId}[${index}] has invalid bounds.`);
      }
      if (!frame.semanticAnchors?.leftHand || !frame.semanticAnchors?.rightHand) {
        errors.push(`${clipId}[${index}] lacks paired hands.`);
      }
      if (!frame.semanticAnchors?.leftFoot || !frame.semanticAnchors?.rightFoot) {
        errors.push(`${clipId}[${index}] lacks paired feet.`);
      }
      if (Object.keys(frame.segmentDepth ?? {}).length !== 12) {
        errors.push(`${clipId}[${index}] needs twelve segment depths.`);
      }
      if (!["left", "right", "both", "none"].includes(frame.support)) {
        errors.push(`${clipId}[${index}] has invalid support.`);
      }
    }
  }
  return errors;
}

function normalizeCharacter(value) {
  const id = typeof value === "string" ? value : value?.id ?? value?.profileId;
  return id === "soder" ? "soder" : "kitty";
}

function loadImage(imageFactory, source) {
  return new Promise((resolve, reject) => {
    const image = imageFactory();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Frolic atlas page failed: ${source}`));
    image.src = source;
  });
}

function drawDebug(ctx, frame, {
  drawX,
  drawY,
  scaleX,
  scaleY,
  x,
  floorY,
  debug,
}) {
  if (debug.bounds) {
    ctx.strokeStyle = "#f2bd65";
    ctx.lineWidth = 1;
    ctx.strokeRect(drawX + 0.5, drawY + 0.5, frame.w * scaleX - 1, frame.h * scaleY - 1);
  }
  const screenPoint = (anchor) => [
    drawX + anchor[0] * scaleX,
    drawY + anchor[1] * scaleY,
  ];
  if (debug.skeleton) {
    const segments = [
      ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"], ["leftWrist", "leftHand"],
      ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"], ["rightWrist", "rightHand"],
      ["leftHip", "leftKnee"], ["leftKnee", "leftAnkle"], ["leftAnkle", "leftFoot"],
      ["rightHip", "rightKnee"], ["rightKnee", "rightAnkle"], ["rightAnkle", "rightFoot"],
      ["pelvis", "chest"], ["chest", "neck"], ["neck", "head"],
    ];
    for (const [startName, endName] of segments) {
      const start = screenPoint(frame.semanticAnchors[startName]);
      const end = screenPoint(frame.semanticAnchors[endName]);
      ctx.strokeStyle = startName.startsWith("left") ? "#63d6b3" : startName.startsWith("right") ? "#f46b45" : "#fff5dc";
      ctx.beginPath();
      ctx.moveTo(Math.round(start[0]) + 0.5, Math.round(start[1]) + 0.5);
      ctx.lineTo(Math.round(end[0]) + 0.5, Math.round(end[1]) + 0.5);
      ctx.stroke();
    }
  }
  if (debug.contacts) {
    for (const [name, anchor] of Object.entries(frame.contacts ?? {})) {
      const [px, py] = screenPoint(anchor);
      ctx.strokeStyle = name.startsWith("left") ? "#63d6b3" : "#f46b45";
      ctx.strokeRect(Math.round(px) - 2.5, Math.round(py) - 2.5, 5, 5);
    }
  }
  if (debug.centerOfMass && frame.centerOfMass) {
    const [px, py] = screenPoint(frame.centerOfMass);
    ctx.fillStyle = "#f2bd65";
    ctx.fillRect(Math.round(px) - 2, Math.round(py), 5, 1);
    ctx.fillRect(Math.round(px), Math.round(py) - 2, 1, 5);
    ctx.globalAlpha *= 0.45;
    ctx.fillRect(Math.round(px), Math.round(py), 1, Math.max(0, Math.round(floorY - py)));
  }
  if (debug.pivot) {
    ctx.fillStyle = "#f46b45";
    ctx.fillRect(Math.round(x) - 2, Math.round(floorY), 5, 1);
    ctx.fillRect(Math.round(x), Math.round(floorY) - 2, 1, 5);
  }
}
