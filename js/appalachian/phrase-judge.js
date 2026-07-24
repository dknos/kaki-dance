import { clamp } from "../core/math.js";
import { normalizeFrolicStyle } from "./footwork-catalog.js";
import {
  APPALACHIAN_TUNE_MAP,
  FROLIC_PPQ,
  FROLIC_TICKS_PER_BAR,
  localTickInBar,
} from "./tune-map.js";

export class AppalachianPhraseJudge {
  constructor({
    tuneMap = APPALACHIAN_TUNE_MAP,
    style = "flatfoot",
    difficulty = "standard",
  } = {}) {
    this.tuneMap = tuneMap;
    this.style = normalizeFrolicStyle(style);
    this.difficulty = tuneMap.difficultyLayers[difficulty] ? difficulty : "standard";
    this.events = [];
    this.transitions = [];
    this.turnarounds = [];
  }

  recordInput(value) {
    const event = normalizeEvent(value);
    this.events.push(event);
    return event;
  }

  recordTransition(value) {
    const transition = Object.freeze({
      tick: Number(value?.tick) || 0,
      fromId: String(value?.fromId ?? ""),
      toId: String(value?.toId ?? ""),
      legal: value?.legal !== false,
      reset: Boolean(value?.reset),
    });
    this.transitions.push(transition);
    return transition;
  }

  recordTurnaround(value) {
    const entry = Object.freeze({
      tick: Number(value?.tick) || 0,
      moveId: String(value?.moveId ?? ""),
      validWindow: Boolean(value?.validWindow),
      controlled: value?.controlled !== false,
    });
    this.turnarounds.push(entry);
    return entry;
  }

  getResult() {
    return scoreAppalachianRoutine(this.events, {
      tuneMap: this.tuneMap,
      style: this.style,
      difficulty: this.difficulty,
      transitions: this.transitions,
      turnarounds: this.turnarounds,
    });
  }
}

export function evaluateCallResponse(call, responseEvents, {
  difficulty = "standard",
  toleranceTicks = difficulty === "easy" ? 28 : difficulty === "advanced" ? 14 : 20,
} = {}) {
  if (!call) return Object.freeze({ accepted: false, type: "none", score: 0, anchorAccuracy: 0 });
  const responseTicks = responseEvents.map((value) => localTickInBar(value.tick ?? value)).sort((a, b) => a - b);
  const rhythmMatches = matchTicks(call.rhythmTicks, responseTicks, toleranceTicks);
  const anchorMatches = matchTicks(call.anchorTicks, responseTicks, toleranceTicks);
  const complementMatches = matchTicks(call.complementTicks ?? [], responseTicks, toleranceTicks);
  const rhythmAccuracy = call.rhythmTicks.length ? rhythmMatches / call.rhythmTicks.length : 0;
  const anchorAccuracy = call.anchorTicks.length ? anchorMatches / call.anchorTicks.length : 0;
  const complementAccuracy = call.complementTicks?.length
    ? complementMatches / call.complementTicks.length
    : 0;
  const exactCount = responseTicks.length === call.rhythmTicks.length;
  const exact = exactCount && rhythmAccuracy === 1;
  const identityHeld = anchorAccuracy >= 2 / 3;
  const varied = identityHeld && !exact && responseTicks.length >= call.anchorTicks.length;
  const simplified = identityHeld && responseTicks.length <= call.rhythmTicks.length;
  const complementary = difficulty !== "easy" && complementAccuracy >= 0.6 && anchorAccuracy >= 1 / 3;
  let type = "incorrect";
  let score = Math.round(anchorAccuracy * 44 + rhythmAccuracy * 36);
  if (exact) {
    type = "exact";
    score = difficulty === "advanced" ? 86 : 94;
  } else if (varied) {
    type = "variation";
    score = difficulty === "advanced" ? 98 : difficulty === "easy" ? 84 : 92;
  } else if (simplified) {
    type = "simplified";
    score = difficulty === "advanced" ? 80 : 88;
  } else if (complementary) {
    type = "complementary";
    score = difficulty === "advanced" ? 92 : 84;
  }
  return Object.freeze({
    accepted: type !== "incorrect",
    type,
    score,
    rhythmAccuracy: round(rhythmAccuracy),
    anchorAccuracy: round(anchorAccuracy),
    complementAccuracy: round(complementAccuracy),
  });
}

export function restraintFactor(events) {
  if (!events.length) return 1;
  const ordered = [...events].sort((a, b) => a.tick - b.tick);
  const spanBeats = Math.max(1, (ordered.at(-1).tick - ordered[0].tick) / FROLIC_PPQ + 1);
  const density = ordered.length / spanBeats;
  const counts = frequency(ordered.map((value) => value.moveId));
  const mostRepeated = Math.max(...counts.values()) / ordered.length;
  const accentedRatio = ordered.filter((value) => value.intensity >= 0.82).length / ordered.length;
  const densityPenalty = density <= 2.25 ? 1 : clamp(1 - (density - 2.25) * 0.16, 0.28, 1);
  const repeatPenalty = mostRepeated <= 0.42 ? 1 : clamp(1 - (mostRepeated - 0.42) * 0.9, 0.45, 1);
  const accentPenalty = accentedRatio <= 0.5 ? 1 : clamp(1 - (accentedRatio - 0.5) * 0.8, 0.6, 1);
  return round(densityPenalty * repeatPenalty * accentPenalty);
}

export function motifRepetitionValue(events) {
  const bars = new Map();
  for (const event of events) {
    const bar = Math.floor(event.tick / FROLIC_TICKS_PER_BAR) + 1;
    if (!bars.has(bar)) bars.set(bar, []);
    bars.get(bar).push(Math.round(localTickInBar(event.tick) / 12) * 12);
  }
  let comparisons = 0;
  let rewarded = 0;
  for (const [leftBar, rightBar] of [[1, 9], [2, 10], [17, 25], [18, 26]]) {
    const left = bars.get(leftBar);
    const right = bars.get(rightBar);
    if (!left?.length || !right?.length) continue;
    comparisons += 1;
    const matches = matchTicks(left, right, 12);
    const ratio = matches / Math.max(left.length, right.length);
    if (ratio >= 0.55) rewarded += ratio;
  }
  return comparisons ? round(rewarded / comparisons) : 0;
}

export function scoreAppalachianRoutine(events, {
  tuneMap = APPALACHIAN_TUNE_MAP,
  style = "flatfoot",
  difficulty = "standard",
  transitions = [],
  turnarounds = [],
} = {}) {
  const normalized = events.map(normalizeEvent).sort((a, b) => a.tick - b.tick);
  const restraint = restraintFactor(normalized);
  const timingQuality = average(normalized.map((event) => {
    const absolute = Math.abs(event.timingOffsetTicks);
    const tolerance = tuneMap.difficultyLayers[difficulty]?.timingToleranceTicks ?? 20;
    return clamp(1 - absolute / Math.max(1, tolerance * 2.4), 0, 1);
  }));
  const callResults = [];
  for (const call of tuneMap.calls) {
    const start = (call.responseBar - 1) * FROLIC_TICKS_PER_BAR;
    const end = start + FROLIC_TICKS_PER_BAR;
    const response = normalized.filter((event) => event.tick >= start && event.tick < end);
    if (response.length) callResults.push(evaluateCallResponse(call, response, { difficulty }));
  }
  const callQuality = callResults.length ? average(callResults.map((value) => value.score / 100)) : 0.55;
  const legalFlow = transitions.length
    ? transitions.filter((value) => value.legal && !value.reset).length / transitions.length
    : normalized.length ? 0.72 : 0;
  const moveVariety = uniqueRatio(normalized.map((value) => value.moveId), 7);
  const articulationVariety = uniqueRatio(normalized.map((value) => value.articulation), 6);
  const styleFit = normalized.length
    ? normalized.filter((event) => event.style === normalizeFrolicStyle(style)).length / normalized.length
    : 0;
  const motif = motifRepetitionValue(normalized);
  const validTurnarounds = turnarounds.filter((value) => value.validWindow && value.controlled).length;
  const invalidTurnarounds = turnarounds.filter((value) => !value.validWindow).length;
  const turnaroundQuality = clamp(validTurnarounds * 0.22 - invalidTurnarounds * 0.12, 0, 1);
  const accentMusicality = average(normalized.map((event) => {
    const localBeatTick = localTickInBar(event.tick);
    const nearestQuarter = Math.round(localBeatTick / FROLIC_PPQ) * FROLIC_PPQ;
    const downbeatDistance = Math.abs(localBeatTick - nearestQuarter);
    const intentionalOffbeat = Math.abs(localBeatTick % (FROLIC_PPQ / 2)) <= 10;
    return clamp(1 - downbeatDistance / FROLIC_PPQ, 0, 1) * 0.6 + (intentionalOffbeat ? 0.4 : 0);
  }));

  const time = score100(timingQuality * 0.9 + restraint * 0.1);
  const tune = score100((callQuality * 0.5 + accentMusicality * 0.32 + turnaroundQuality * 0.18) * restraint);
  const flow = score100((legalFlow * 0.72 + timingQuality * 0.18 + Math.min(1, normalized.length / 16) * 0.1) * (0.75 + restraint * 0.25));
  const footwork = score100((articulationVariety * 0.4 + styleFit * 0.35 + timingQuality * 0.25) * (0.72 + restraint * 0.28));
  const spirit = score100((moveVariety * 0.42 + motif * 0.23 + turnaroundQuality * 0.2 + callQuality * 0.15) * restraint);
  const total = Math.round((time + tune + flow + footwork + spirit) / 5);
  const reasons = [];
  if (restraint < 0.62) reasons.push("Too many dense or repeated accents crowded the tune.");
  else if (motif >= 0.55) reasons.push("A returning motif made the repeated strain feel intentional.");
  if (callResults.some((value) => value.type === "variation")) reasons.push("Your variation kept the call's anchor accents.");
  else if (callResults.some((value) => value.type === "exact")) reasons.push("You answered a trade cleanly.");
  if (validTurnarounds) reasons.push("The phrase resolved inside a turnaround window.");
  if (!reasons.length) reasons.push("Leave space, vary the feet, and answer the phrase ending.");
  return deepFreeze({
    time,
    tune,
    flow,
    footwork,
    spirit,
    restraint,
    total,
    callResponses: callResults,
    reasons,
    eventCount: normalized.length,
    uniqueMoves: new Set(normalized.map((value) => value.moveId)).size,
    validTurnarounds,
  });
}

function normalizeEvent(value = {}) {
  return Object.freeze({
    tick: Number(value.tick) || 0,
    moveId: String(value.moveId || "walkingStep"),
    articulation: String(value.articulation || "flat"),
    intensity: clamp(Number(value.intensity) || 0.5, 0, 1),
    timingOffsetTicks: Number(value.timingOffsetTicks) || 0,
    style: normalizeFrolicStyle(value.style),
    foot: value.foot === "right" ? "right" : value.foot === "both" ? "both" : "left",
    inputKind: String(value.inputKind || "step"),
  });
}

function matchTicks(targets, values, tolerance) {
  const available = [...values];
  let matches = 0;
  for (const target of targets) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    available.forEach((value, index) => {
      const distance = circularDistance(target, value, FROLIC_TICKS_PER_BAR);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestDistance <= tolerance) {
      matches += 1;
      available.splice(bestIndex, 1);
    }
  }
  return matches;
}

function circularDistance(left, right, range) {
  const raw = Math.abs(left - right);
  return Math.min(raw, range - raw);
}

function uniqueRatio(values, target) {
  return values.length ? clamp(new Set(values).size / target, 0, 1) : 0;
}

function frequency(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function score100(value) {
  return Math.round(clamp(value, 0, 1) * 100);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
