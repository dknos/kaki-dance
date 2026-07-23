import { clamp } from "../core/math.js";
import { nearestAccent } from "../audio/beatmap.js";

export const SCORE_CATEGORIES = Object.freeze([
  "musicality",
  "vocabulary",
  "originality",
  "technique",
  "execution",
]);

export function timingJudgment(beat, bpm, windows, beatmap = null) {
  const phase = ((beat % 1) + 1) % 1;
  const signedBeatDistance = phase <= 0.5 ? phase : phase - 1;
  const deltaSeconds = signedBeatDistance * 60 / bpm;
  const absolute = Math.abs(deltaSeconds);
  let label = "late";
  let factor = 0.35;
  if (absolute <= windows.perfect) {
    label = "perfect";
    factor = 1;
  } else if (absolute <= windows.clean) {
    label = "clean";
    factor = 0.78;
  } else if (absolute <= windows.accepted) {
    label = "accepted";
    factor = 0.55;
  }
  const accent = beatmap ? nearestAccent(beat, beatmap) : null;
  const secondsPerBeat = 60 / bpm;
  const accentDistanceSeconds = accent ? Math.abs(accent.deltaBeats) * secondsPerBeat : Infinity;
  const accentHit = accentDistanceSeconds <= windows.clean;
  return Object.freeze({
    label,
    factor,
    deltaSeconds,
    accentHit,
    accentStrength: accentHit ? accent.strength : 0,
    accentLabel: accentHit ? accent.label : "",
  });
}

export function repeatDecay(moveId, history = [], {
  direction = 1,
  transitionFrom = "idle",
} = {}) {
  const recent = history.slice(-8);
  let sameMove = 0;
  let sameSignature = 0;
  const signature = `${transitionFrom}>${moveId}:${Math.sign(direction) || 1}`;
  for (const entry of recent) {
    if (entry.moveId === moveId) sameMove += 1;
    if (entry.signature === signature) sameSignature += 1;
  }
  return clamp(1 * (0.67 ** sameMove) * (0.72 ** sameSignature), 0.12, 1);
}

export function scoreMoveEvent(move, {
  timing = { factor: 0.55, accentHit: false, accentStrength: 0 },
  history = [],
  direction = 1,
  transitionFrom = "idle",
  contactError = 0,
  balanceQuality = 1,
  extension = 0,
  responseBonus = 0,
  completed = true,
} = {}) {
  const properties = move.scoreProperties;
  const decay = repeatDecay(move.id, history, { direction, transitionFrom });
  const familySeen = new Set(history.slice(-10).map((entry) => entry.family));
  const moveSeen = history.slice(-10).some((entry) => entry.moveId === move.id);
  const transitionSignature = `${transitionFrom}>${move.id}`;
  const transitionSeen = history.slice(-12).some((entry) => entry.transitionSignature === transitionSignature);
  const contactQuality = clamp(1 - contactError / 3.5, 0.15, 1);
  const completion = completed ? 1 : 0.22;
  const difficulty = 0.35 + move.difficulty * 0.65;
  const accent = timing.accentHit ? 0.28 * timing.accentStrength : 0;
  const scores = {
    musicality: properties.base * properties.musicality * (timing.factor + accent) * decay,
    vocabulary: properties.base * properties.vocabulary * (familySeen.has(move.family) ? 0.7 : 1.15) * (moveSeen ? 0.72 : 1) * decay,
    originality: properties.base * properties.originality * (transitionSeen ? 0.62 : 1.16) * (1 + responseBonus) * decay,
    technique: properties.base * properties.technique * difficulty * (1 + extension * 0.1) * completion,
    execution: properties.base * properties.execution * contactQuality * balanceQuality * completion,
  };
  return Object.freeze({
    categories: Object.freeze(scores),
    decay,
    signature: `${transitionFrom}>${move.id}:${Math.sign(direction) || 1}`,
    transitionSignature,
    contactQuality,
  });
}

export class RoundScorer {
  constructor({ targetPerCategory = 540 } = {}) {
    this.targetPerCategory = targetPerCategory;
    this.reset();
  }

  reset() {
    this.categories = Object.fromEntries(SCORE_CATEGORIES.map((category) => [category, 0]));
    this.history = [];
    this.reasons = [];
    this.crowdHeat = 8;
    this.maxCrowdHeat = 8;
    this.invalidRequests = 0;
    this.failedMoves = 0;
    this.cleanFreezes = 0;
    this.perfectHits = 0;
    this.familySet = new Set();
  }

  recordMove(move, context = {}) {
    const result = scoreMoveEvent(move, { ...context, history: this.history });
    for (const category of SCORE_CATEGORIES) this.categories[category] += result.categories[category];
    const entry = Object.freeze({
      moveId: move.id,
      family: move.family,
      beat: context.beat ?? 0,
      timing: context.timing?.label ?? "accepted",
      signature: result.signature,
      transitionSignature: result.transitionSignature,
      direction: context.direction ?? 1,
      decay: result.decay,
    });
    this.history.push(entry);
    this.familySet.add(move.family);
    if (context.timing?.label === "perfect") this.perfectHits += 1;
    if (move.family === "freeze" && context.balanceQuality > 0.78) this.cleanFreezes += 1;
    const heatGain = move.crowdResponsePotential * 15
      * (0.45 + context.timing?.factor * 0.55)
      * result.decay;
    this.crowdHeat = clamp(this.crowdHeat + heatGain, 0, 100);
    this.maxCrowdHeat = Math.max(this.maxCrowdHeat, this.crowdHeat);
    if (result.decay < 0.42) this.reasons.push(`Repeat decay reduced ${move.displayName}.`);
    if (context.timing?.accentHit) this.reasons.push(`${move.displayName} answered the ${context.timing.accentLabel || "accent"}.`);
    return result;
  }

  recordExtension(move, { accented = false } = {}) {
    this.categories.technique += move.scoreProperties.base * 0.08;
    this.categories.musicality += accented ? move.scoreProperties.base * 0.1 : 0;
    this.crowdHeat = clamp(this.crowdHeat + (accented ? 7 : 2), 0, 100);
  }

  recordInvalid() {
    this.invalidRequests += 1;
    this.categories.execution = Math.max(0, this.categories.execution - 2.5);
    this.crowdHeat = Math.max(0, this.crowdHeat - 1.5);
  }

  recordFailure() {
    this.failedMoves += 1;
    this.categories.execution = Math.max(0, this.categories.execution - 12);
    this.crowdHeat = Math.max(0, this.crowdHeat - 9);
  }

  cool(dt, indecisive = false) {
    this.crowdHeat = clamp(this.crowdHeat - dt * (indecisive ? 1.8 : 0.28), 0, 100);
  }

  getBreakdown() {
    const normalized = {};
    for (const category of SCORE_CATEGORIES) {
      normalized[category] = Math.round(clamp(this.categories[category] / this.targetPerCategory * 100, 0, 100));
    }
    const total = Math.round(SCORE_CATEGORIES.reduce((sum, category) => sum + normalized[category], 0) / SCORE_CATEGORIES.length);
    const strongest = SCORE_CATEGORIES.reduce((best, category) => normalized[category] > normalized[best] ? category : best, SCORE_CATEGORIES[0]);
    const weakest = SCORE_CATEGORIES.reduce((worst, category) => normalized[category] < normalized[worst] ? category : worst, SCORE_CATEGORIES[0]);
    return Object.freeze({
      ...normalized,
      total,
      raw: Object.freeze({ ...this.categories }),
      strongest,
      weakest,
      moves: this.history.length,
      families: this.familySet.size,
      perfectHits: this.perfectHits,
      cleanFreezes: this.cleanFreezes,
      invalidRequests: this.invalidRequests,
      failedMoves: this.failedMoves,
      maxCrowdHeat: Math.round(this.maxCrowdHeat),
      reasons: Object.freeze(this.summaryReasons(strongest, weakest)),
      phraseSignatures: Object.freeze(buildPhraseSignatures(this.history)),
    });
  }

  summaryReasons(strongest, weakest) {
    const reasons = [];
    if (this.perfectHits) reasons.push(`${this.perfectHits} perfect musical hit${this.perfectHits === 1 ? "" : "s"}.`);
    if (this.cleanFreezes) reasons.push(`${this.cleanFreezes} controlled freeze${this.cleanFreezes === 1 ? "" : "s"}.`);
    if (this.familySet.size >= 5) reasons.push("Full-family vocabulary: standing, floor, power, freeze, and recovery.");
    if (this.invalidRequests > 2) reasons.push("Late or incompatible transitions lowered execution.");
    const repeated = this.history.filter((entry) => entry.decay < 0.42).length;
    if (repeated) reasons.push(`${repeated} repeated path${repeated === 1 ? "" : "s"} lost originality.`);
    reasons.push(`Strongest: ${title(strongest)}. Next focus: ${title(weakest)}.`);
    return reasons;
  }
}

export function buildPhraseSignatures(history, phraseLength = 4) {
  const signatures = [];
  for (let index = 0; index < history.length; index += phraseLength) {
    signatures.push(history.slice(index, index + phraseLength).map((entry) => entry.moveId).join(">"));
  }
  return signatures;
}

function title(value) {
  return value[0].toUpperCase() + value.slice(1);
}
