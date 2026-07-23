import { SeededRandom } from "../core/random.js";
import { getMoveDefinition, MOVE_CATALOG, movesByFamily } from "./move-catalog.js";
import { legalTransitions } from "./transition-graph.js";

export const AI_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ timingJitter: 0.22, planning: 0.45, risk: 0.32, variety: 0.5, correction: 0.6 }),
  normal: Object.freeze({ timingJitter: 0.11, planning: 0.7, risk: 0.58, variety: 0.76, correction: 0.82 }),
  hard: Object.freeze({ timingJitter: 0.045, planning: 0.92, risk: 0.82, variety: 0.94, correction: 0.96 }),
});

export class DanceAI {
  constructor({
    session,
    difficulty = "normal",
    seed = 0x4d494b41,
  } = {}) {
    this.session = session;
    this.tuning = AI_DIFFICULTIES[difficulty] ?? AI_DIFFICULTIES.normal;
    this.random = new SeededRandom(seed);
    this.nextDecisionBeat = 0;
    this.lastRequested = "";
    this.playerPhrase = [];
  }

  observePlayer(history = []) {
    this.playerPhrase = history.slice(-4);
  }

  update(beatSnapshot) {
    const snapshot = this.session.getSnapshot();
    if (snapshot.family === "freeze") {
      return {
        balanceX: -Math.sign(snapshot.balance.offset) * this.tuning.correction,
        freezeHeld: snapshot.stamina > 18 && snapshot.balance.wobble < 0.82,
      };
    }
    if (beatSnapshot.beat + 1e-8 < this.nextDecisionBeat) {
      return { balanceX: 0, freezeHeld: false };
    }
    const shouldPlan = !snapshot.moveId || snapshot.phase > 0.72;
    if (!shouldPlan) return { balanceX: 0, freezeHeld: false };

    if (snapshot.family === "power" && snapshot.stamina > 28 && this.random.chance(this.tuning.risk * 0.46)) {
      this.session.extendCurrent("power", {
        beat: beatSnapshot.beat,
        accented: beatSnapshot.beatPhase < 0.12 || beatSnapshot.beatPhase > 0.88,
      });
      this.nextDecisionBeat = beatSnapshot.beat + 0.6;
      return { balanceX: 0, freezeHeld: false };
    }

    const candidates = legalTransitions(MOVE_CATALOG, {
      tags: snapshot.moveId
        ? getMoveDefinition(snapshot.moveId).exitTags
        : snapshot.tags,
      precedingFamily: snapshot.moveId ? snapshot.family : this.session.precedingFamily,
      stamina: snapshot.stamina,
      currentMove: snapshot.moveId ? getMoveDefinition(snapshot.moveId) : null,
      phase: snapshot.phase,
    });
    const picked = this.chooseMove(candidates, snapshot, beatSnapshot);
    if (picked) {
      const jitter = this.random.range(-this.tuning.timingJitter, this.tuning.timingJitter);
      this.session.requestMove(picked.id, {
        beat: beatSnapshot.beat + jitter,
        timing: {
          label: Math.abs(jitter) < 0.05 ? "perfect" : Math.abs(jitter) < 0.11 ? "clean" : "accepted",
          factor: Math.abs(jitter) < 0.05 ? 1 : Math.abs(jitter) < 0.11 ? 0.78 : 0.55,
          accentHit: beatSnapshot.beatPhase < 0.12 || beatSnapshot.beatPhase > 0.88,
          accentStrength: beatSnapshot.beatInBar === 0 ? 1 : 0.55,
          accentLabel: beatSnapshot.beatInBar === 0 ? "downbeat" : "beat",
        },
        direction: this.random.chance(0.46) ? -snapshot.direction : snapshot.direction,
        mirror: this.random.chance(0.5),
        responseBonus: this.responseBonus(picked),
      });
      this.lastRequested = picked.id;
    }
    this.nextDecisionBeat = beatSnapshot.beat + this.random.range(0.25, 0.55);
    return { balanceX: 0, freezeHeld: false };
  }

  chooseMove(candidates, snapshot, beatSnapshot) {
    if (!candidates.length) return null;
    const playerFamilies = new Set(this.playerPhrase.map((entry) => entry.family));
    const recentAi = this.session.scorer?.history.slice(-5) ?? [];
    const weights = candidates.map((move) => {
      let weight = 1;
      if (move.id === this.lastRequested) weight *= 0.15;
      if (recentAi.some((entry) => entry.moveId === move.id)) weight *= 1 - this.tuning.variety * 0.55;
      if (beatSnapshot.beatInBar === 3 && move.family === "freeze") weight *= 2.4;
      if (snapshot.family === "toprock" && move.family === "transition") weight *= 1.8;
      if (snapshot.family === "footwork" && move.family === "power") weight *= 1.5 + this.tuning.risk;
      if (playerFamilies.has("power") && move.family === "footwork") weight *= 1.5;
      if (playerFamilies.has("freeze") && move.family === "freeze") weight *= 1.35;
      weight *= 0.7 + move.difficulty * this.tuning.risk;
      if (move.difficulty > this.tuning.planning + 0.18) weight *= 0.18;
      return Math.max(0.01, weight);
    });
    return weightedPick(candidates, weights, this.random);
  }

  responseBonus(move) {
    if (!this.playerPhrase.length) return 0;
    const families = new Set(this.playerPhrase.map((entry) => entry.family));
    if (families.has("power") && move.family === "footwork") return 0.16;
    if (families.has("freeze") && move.family === "freeze") return 0.12;
    return 0.04;
  }
}

function weightedPick(items, weights, random) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = random.range(0, total);
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return items[index];
  }
  return items.at(-1);
}
