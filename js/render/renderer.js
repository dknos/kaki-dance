import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "../config.js";
import { drawBackCrowd, drawForegroundCrowd, drawSideCrowd } from "./crowd.js";
import { EffectsRenderer } from "./effects.js";
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
    this.lastSnapshot = null;
    this.debug = null;
  }

  setSettings(settings) {
    this.settings = settings;
  }

  setDebug(debug) {
    this.debug = debug;
  }

  preloadCharacter(character) {
    return this.heroes.preload(character);
  }

  async enterMode(mode, character, style = "flatfoot") {
    if (mode === "frolic" || mode === "stepShed") {
      this.heroes.library.releaseAll?.();
      this.frolicHeroes.library.releaseExcept(character, style);
      return this.frolicHeroes.preload(character, style);
    }
    this.frolicHeroes.releaseAll();
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
    this.effects.drawBehind(ctx);
    const visualLatency = Number(this.settings.visualLatencyMs) || 0;
    this.frolicHeroes.draw(ctx, snapshot.dancer, snapshot.character, snapshot.frolic.style, {
      x: 192 + (snapshot.dancer.rootX ?? 0),
      floorY: 178,
      scale: 1.25,
      phase: heroPhase(snapshot, snapshot.dancer, visualLatency),
      debug: this.debug?.frolic ?? null,
    });
    this.effects.drawFront(ctx);
    drawHud(ctx, snapshot, this.settings);
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
