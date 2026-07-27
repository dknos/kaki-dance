import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "../config.js";
import { drawBackCrowd, drawForegroundCrowd, drawSideCrowd } from "./crowd.js";
import { EffectsRenderer } from "./effects.js";
import { AppalachianThreeRenderer } from "./appalachian-three-renderer.js";
import { FrolicAtlasRenderer } from "./frolic-atlas.js";
import { AtlasHeroRenderer } from "./hero-atlas.js";
import { drawHud } from "./hud.js";
import { drawStage } from "./stage.js";

export class KakiDanceRenderer {
  constructor(canvas, {
    settings = {},
    seed = 0x4b414b49,
  } = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("KakiDanceRenderer requires a canvas.");
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.ctx.imageSmoothingEnabled = false;
    this.settings = settings;
    this.effects = new EffectsRenderer(seed);
    this.heroes = new AtlasHeroRenderer();
    this.frolicHeroes = new FrolicAtlasRenderer();
    this.appalachian3d = null;
    this.appalachianRenderMode = queryRenderMode();
    this.lastSnapshot = null;
    this.lastFrolicVisual = null;
    this.frolicQaMode = false;
    this.debug = null;
  }

  setSettings(settings) {
    this.settings = settings;
  }

  setDebug(debug) {
    this.debug = debug;
    this.appalachian3d?.setDebug(debug?.frolic ?? {});
  }

  setFrolicQaMode(enabled) {
    this.frolicQaMode = Boolean(enabled);
    this.effects.reset();
  }

  async setFrolicReviewVariant(value, character, style = "flatfoot") {
    this.frolicHeroes.setReviewVariant(value);
    return this.frolicHeroes.preload(character, style);
  }

  setFrolicDebugOverlay(enabled) {
    this.debug = enabled
      ? {
          ...(this.debug ?? {}),
          frolic: {
            skeleton: true,
            contacts: true,
            centerOfMass: true,
            pivot: true,
          },
        }
      : null;
    this.appalachian3d?.setDebug(this.debug?.frolic ?? {
      skeleton: false,
      contacts: false,
      centerOfMass: false,
      rootTrail: false,
    });
  }

  setAppalachianRenderMode(value) {
    this.appalachianRenderMode = ["live", "atlas"].includes(value) ? value : "live";
    return this.appalachianRenderMode;
  }

  getAppalachianDiagnostics() {
    return this.appalachian3d?.getDiagnostics?.() ?? Object.freeze({
      ready: false,
      error: "",
      backend: Object.freeze({ actual: "atlas" }),
    });
  }

  setAppalachianCameraPreset(value) {
    return this.appalachian3d?.setCameraPreset?.(value) ?? "gameplay";
  }

  setAppalachianFreeCamera(enabled) {
    return this.appalachian3d?.setFreeCamera?.(enabled) ?? false;
  }

  orbitAppalachianCamera(yawDelta, pitchDelta, zoomDelta) {
    return this.appalachian3d?.orbitCamera?.(yawDelta, pitchDelta, zoomDelta) ?? false;
  }

  preloadCharacter(character) {
    return this.heroes.preload(character);
  }

  async enterMode(mode, character, style = "flatfoot") {
    if (mode === "frolic" || mode === "tradeLicks" || mode === "stepShed") {
      const fallbackStyle = "flatfoot";
      const rival = character === "kitty" ? "soder" : "kitty";
      this.heroes.library.releaseAll?.();
      this.frolicHeroes.library.releaseExcept(character, fallbackStyle);
      if (!this.appalachian3d || this.appalachian3d.disposed) {
        this.appalachian3d = new AppalachianThreeRenderer();
        this.appalachian3d.setDebug(this.debug?.frolic ?? {});
      }
      return Promise.all([
        this.frolicHeroes.preload(character, fallbackStyle),
        ...(mode === "tradeLicks" ? [this.frolicHeroes.preload(rival, fallbackStyle)] : []),
        this.appalachian3d.load(character, style),
      ]);
    }
    this.frolicHeroes.releaseAll();
    this.appalachian3d?.dispose();
    this.appalachian3d = null;
    return this.heroes.preload(character);
  }

  reset() {
    this.effects.reset();
    this.lastSnapshot = null;
  }

  update(dt, snapshot) {
    this.lastSnapshot = snapshot;
    this.effects.update(dt, snapshot, this.settings);
  }

  onEvent(event, snapshot) {
    if (this.frolicQaMode && snapshot?.frolic) return;
    const visual = snapshot?.frolic
      ? this.frolicHeroes.select(
        snapshot?.dancer,
        snapshot?.character,
        snapshot?.frolic?.style,
        heroPhase(snapshot, snapshot?.dancer, this.settings.visualLatencyMs),
      )
      : this.heroes.select(
        snapshot?.dancer,
        snapshot?.character,
        heroPhase(snapshot, snapshot?.dancer),
      );
    this.effects.onEvent(event, snapshot, this.settings, visual);
  }

  render(snapshot = this.lastSnapshot) {
    if (!snapshot) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.translate(this.effects.camera.x, this.effects.camera.y);
    drawStage(ctx, snapshot, this.settings);
    if (snapshot.frolic) {
      this.renderFrolic(ctx, snapshot);
      ctx.restore();
      return;
    }
    drawBackCrowd(ctx, snapshot);
    this.drawWaitingDancer(ctx, snapshot);
    drawSideCrowd(ctx, snapshot);
    this.effects.drawBehind(ctx);
    this.drawReplayTrails(ctx, snapshot);
    this.heroes.draw(ctx, snapshot.dancer, snapshot.character, {
      x: 192,
      floorY: 158,
      scale: 1,
      phase: heroPhase(snapshot, snapshot.dancer),
      debug: this.debug?.atlas ?? null,
    });
    this.effects.drawFront(ctx);
    drawForegroundCrowd(ctx, snapshot, this.settings.reducedMotion);
    drawHud(ctx, snapshot, this.settings);
    ctx.restore();
  }

  renderFrolic(ctx, snapshot) {
    if (!this.frolicQaMode) this.effects.drawBehind(ctx);
    this.renderTradeCaller(ctx, snapshot);
    const useLive = this.appalachianRenderMode === "live"
      && this.appalachian3d?.ready
      && this.appalachian3d.render(snapshot);
    if (useLive) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.appalachian3d.canvas, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.restore();
      this.lastFrolicVisual = Object.freeze({
        renderer: "live-3d",
        backend: this.appalachian3d.backend.actual,
        bounds: Object.freeze({ x: 0, y: 0, width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT }),
      });
    } else {
      this.renderFrolicAtlas(ctx, snapshot);
    }
    if (!this.frolicQaMode) this.effects.drawFront(ctx);
    drawHud(ctx, snapshot, this.settings);
  }

  renderTradeCaller(ctx, snapshot) {
    if (snapshot.mode !== "tradeLicks" || !snapshot.opponent || !snapshot.waitingCharacter) return;
    const calling = snapshot.frolic?.state === "TRADE_CALL";
    this.frolicHeroes.draw(ctx, snapshot.opponent, snapshot.waitingCharacter, "flatfoot", {
      x: 306,
      floorY: 145,
      scale: calling ? 0.72 : 0.64,
      alpha: calling ? 1 : 0.58,
      phase: heroPhase(snapshot, snapshot.opponent),
    });
  }

  renderFrolicAtlas(ctx, snapshot) {
    const visualLatency = Number(this.settings.visualLatencyMs) || 0;
    this.lastFrolicVisual = this.frolicHeroes.draw(ctx, snapshot.dancer, snapshot.character, "flatfoot", {
      x: 192 + (snapshot.dancer.rootX ?? 0),
      floorY: 178,
      scale: 1.05,
      phase: heroPhase(snapshot, snapshot.dancer, visualLatency),
      debug: this.debug?.frolic ?? null,
    });
    if (this.lastFrolicVisual) {
      this.lastFrolicVisual = Object.freeze({
        ...this.lastFrolicVisual,
        renderer: "atlas-fallback",
        requestedStyle: snapshot.frolic.style,
        fallbackStyle: "flatfoot",
      });
    }
  }

  drawReplayTrails(ctx, snapshot) {
    if (this.settings.reducedMotion) return;
    this.effects.replayTrail.slice(1).forEach((trail, index) => {
      this.heroes.draw(ctx, trail.dancer, trail.character, {
        x: 192 - snapshot.dancer.direction * (index + 1) * 2,
        floorY: 158,
        scale: 1,
        alpha: Math.max(0, 0.18 - index * 0.035),
        ghost: true,
        phase: heroPhase(snapshot, trail.dancer),
      });
    });
  }

  drawWaitingDancer(ctx, snapshot) {
    if (snapshot.mode !== "battle") return;
    const waiting = snapshot.performer === "player" ? snapshot.opponent : snapshot.player;
    this.heroes.draw(ctx, waiting, snapshot.waitingCharacter, {
      x: snapshot.performer === "player" ? 298 : 86,
      floorY: 132,
      scale: 0.62,
      alpha: 0.82,
      phase: heroPhase(snapshot, waiting),
    });
  }

  destroy() {
    this.appalachian3d?.dispose();
    this.appalachian3d = null;
    this.frolicHeroes.releaseAll();
  }
}

function heroPhase(snapshot, dancer, visualLatencyMs = 0) {
  if (Number.isFinite(dancer?.presentationPhase)) {
    if (!snapshot?.frolic || !visualLatencyMs) return dancer.presentationPhase;
    const ticksPerSecond = (snapshot.beat?.bpm ?? 120) / 60 * 96;
    const durationTicks = dancer.family === "transition" ? 24 : 192;
    return ((dancer.presentationPhase + visualLatencyMs / 1000 * ticksPerSecond / durationTicks) % 1 + 1) % 1;
  }
  if (dancer?.moveId) return dancer.phase;
  const beat = snapshot.beat?.beat ?? 0;
  return ((beat % 2) + 2) % 2 / 2;
}

function queryRenderMode() {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get("dancer") === "atlas"
      ? "atlas"
      : "live";
  } catch {
    return "live";
  }
}
