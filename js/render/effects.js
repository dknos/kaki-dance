import { SeededRandom } from "../core/random.js";
import { clamp } from "../core/math.js";
import { pixelEllipse, pixelLine, pixelRect } from "./primitives.js";

const MAX_PARTICLES = 96;

export class EffectsRenderer {
  constructor(seed = 0x50415753) {
    this.random = new SeededRandom(seed);
    this.particles = Array.from({ length: MAX_PARTICLES }, createParticle);
    this.camera = { shake: 0, punch: 0, x: 0, y: 0 };
    this.flash = 0;
    this.replayTrail = [];
  }

  reset() {
    for (const particle of this.particles) particle.life = 0;
    this.camera.shake = 0;
    this.camera.punch = 0;
    this.camera.x = 0;
    this.camera.y = 0;
    this.flash = 0;
    this.replayTrail = [];
  }

  onEvent(event, snapshot, settings, visual = null) {
    if (event.type === "moveStarted") {
      if (event.family === "power") {
        this.spawnBurst(192, 157, 12, "#63d6b3", 0.75);
        this.camera.punch = Math.max(this.camera.punch, 2.2);
      }
      if (event.family === "freeze") {
        this.spawnBurst(192, 154, 16, "#f46b45", 0.9);
        this.camera.punch = 3;
        if (!settings.reduceFlashes) this.flash = event.timing === "perfect" ? 0.45 : 0.18;
      }
      if (event.timing === "perfect") this.spawnBurst(192, 150, 8, "#f4c95d", 0.55);
    }
    if (event.type === "extended") {
      this.spawnBurst(192, 151, 9, event.accented ? "#f4c95d" : "#8f86d9", 0.65);
    }
    if (event.type === "moveFailed") {
      this.spawnBurst(192, 159, 14, "#ce4772", 0.55);
      this.camera.shake = Math.max(this.camera.shake, 2);
    }
    if (event.type === "goldenChain") {
      this.spawnBurst(192, 140, 28, "#f4c95d", 1.1);
      this.flash = settings.reduceFlashes ? 0 : 0.55;
      this.camera.punch = 4;
    }
    if (event.type === "roundStarted") this.spawnBurst(192, 162, 18, "#8f86d9", 0.7);
    if (event.type === "rhythmHit") {
      const contact = visualImpactAnchor(visual, event.matchType);
      const x = contact?.x ?? 192;
      const y = contact?.y ?? 154;
      const perfect = event.judgment === "perfect";
      this.spawnBurst(
        x,
        y,
        perfect ? 7 : 3,
        perfect ? "#f4c95d" : event.matchType === "style" ? "#8f86d9" : "#63d6b3",
        perfect ? 0.46 : 0.28,
      );
      this.camera.punch = Math.max(this.camera.punch, perfect ? 0.7 : 0.2);
    }
    if (event.type === "measureCompleted" && event.result?.grade === "PURRFECT") {
      this.spawnBurst(192, 148, 12, "#f4c95d", 0.62);
    }
    if (event.type === "footContact") {
      const x = event.foot === "left" ? 174 : event.foot === "right" ? 210 : 192;
      const strong = Number(event.intensity) >= 0.8;
      this.spawnBurst(x, 178, strong ? 4 : 2, strong ? "#f2bd65" : "#d69254", strong ? 0.3 : 0.18);
      this.camera.punch = Math.max(this.camera.punch, strong ? 0.45 : 0.12);
    }
  }

  update(dt, snapshot, settings) {
    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= Math.pow(0.97, dt * 60);
    }
    this.camera.punch *= Math.pow(0.82, dt * 60);
    this.camera.shake *= Math.pow(0.78, dt * 60);
    const strength = (this.camera.shake + this.camera.punch * 0.35) * settings.screenShake;
    this.camera.x = Math.round((this.random.next() - 0.5) * strength);
    this.camera.y = Math.round((this.random.next() - 0.5) * strength);
    this.flash = Math.max(0, this.flash - dt * 3.8);

    if (snapshot?.dancer?.family === "power" && snapshot.dancer.rig) {
      this.replayTrail.unshift({
        age: 0,
        rig: snapshot.dancer.rig,
        dancer: snapshot.dancer,
        character: snapshot.character,
      });
      if (this.replayTrail.length > 5) this.replayTrail.length = 5;
    }
    for (const trail of this.replayTrail) trail.age += dt;
    this.replayTrail = this.replayTrail.filter((trail) => trail.age < 0.22);
  }

  spawnBurst(x, y, count, color, speed) {
    let spawned = 0;
    for (const particle of this.particles) {
      if (particle.life > 0) continue;
      const angle = this.random.range(-Math.PI, 0);
      const velocity = this.random.range(18, 46) * speed;
      Object.assign(particle, {
        x: x + this.random.range(-6, 6),
        y: y + this.random.range(-2, 2),
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        gravity: this.random.range(45, 80),
        life: this.random.range(0.24, 0.58),
        maxLife: 0.58,
        color,
        size: this.random.chance(0.28) ? 2 : 1,
        shape: this.random.chance(0.34) ? "cloth" : "dust",
      });
      spawned += 1;
      if (spawned >= count) break;
    }
  }

  drawBehind(ctx) {
    for (const particle of this.particles) {
      if (particle.life <= 0 || particle.shape !== "dust") continue;
      ctx.save();
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1) * 0.65;
      pixelEllipse(ctx, particle.x, particle.y, particle.size * 2, particle.size, particle.color);
      ctx.restore();
    }
  }

  drawFront(ctx) {
    for (const particle of this.particles) {
      if (particle.life <= 0 || particle.shape !== "cloth") continue;
      ctx.save();
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      pixelRect(ctx, particle.x, particle.y, particle.size + 1, particle.size, particle.color);
      ctx.restore();
    }
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = this.flash;
      pixelRect(ctx, 0, 0, 384, 216, "#f5e9c9");
      ctx.restore();
    }
  }
}

function visualImpactAnchor(visual, matchType) {
  const frame = visual?.frame;
  if (!frame) return null;
  const contact = matchType === "style" ? null : Object.values(frame.contacts ?? {})[0];
  const anchor = contact
    ?? (matchType === "style" ? frame.effectAnchors?.rightPaw : frame.effectAnchors?.leftFoot)
    ?? frame.effectAnchors?.root;
  if (!anchor) return null;
  return {
    x: 192 + anchor[0] - frame.pivot[0],
    y: 158 + anchor[1] - frame.pivot[1],
  };
}

function createParticle() {
  return { x: 0, y: 0, vx: 0, vy: 0, gravity: 0, life: 0, maxLife: 1, color: "#fff", size: 1, shape: "dust" };
}
