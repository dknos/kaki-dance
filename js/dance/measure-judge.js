import { clamp } from "../core/math.js";

export const MEASURE_GRADES = Object.freeze([
  "PURRFECT",
  "CLEAN",
  "IN THE POCKET",
  "SHAKY",
  "LOST THE BEAT",
]);

export class MeasureJudge {
  constructor({
    pattern,
    responseStartBeat,
    bpm = 100,
    timingWindows = { perfect: 0.045, clean: 0.09, accepted: 0.15 },
  } = {}) {
    if (!pattern?.targetTicks?.length) throw new TypeError("MeasureJudge requires target ticks.");
    this.pattern = pattern;
    this.responseStartBeat = Number(responseStartBeat) || 0;
    this.bpm = Number(bpm) || 100;
    this.timingWindows = timingWindows;
    this.windowBeats = this.secondsToBeats(timingWindows.accepted);
    this.targets = pattern.targetTicks.map((tick, index) => ({
      index,
      tick,
      strength: pattern.targetStrengths?.[index] ?? 1,
      beat: this.responseStartBeat + tick / 4,
      status: "pending",
      errorMs: null,
      judgment: "",
      inputBeat: null,
    }));
    this.optional = (pattern.optionalStyleTicks ?? []).map((tick, index) => ({
      index,
      tick,
      beat: this.responseStartBeat + tick / 4,
      status: "pending",
      errorMs: null,
      judgment: "",
      inputBeat: null,
    }));
    this.extras = [];
    this.inputs = [];
    this.finalized = false;
    this.result = null;
  }

  judgeInput(beat, {
    style = false,
    device = "keyboard",
  } = {}) {
    if (this.finalized) return Object.freeze({ type: "ignored", reason: "finalized" });
    const inputBeat = Number(beat);
    if (!Number.isFinite(inputBeat)) return Object.freeze({ type: "ignored", reason: "invalid-time" });
    this.advance(inputBeat);
    const targetCandidate = closestUnmatched(this.targets, inputBeat, this.windowBeats);
    const optionalCandidate = style
      ? closestUnmatched(this.optional, inputBeat, this.windowBeats)
      : null;
    let candidate = null;
    let type = "target";
    if (style && optionalCandidate) {
      candidate = optionalCandidate;
      type = "style";
    } else if (targetCandidate && optionalCandidate) {
      const targetDistance = Math.abs(inputBeat - targetCandidate.beat);
      const optionalDistance = Math.abs(inputBeat - optionalCandidate.beat);
      if (optionalDistance + this.secondsToBeats(0.012) < targetDistance) {
        candidate = optionalCandidate;
        type = "style";
      } else {
        candidate = targetCandidate;
      }
    } else if (targetCandidate) {
      candidate = targetCandidate;
    } else if (style && optionalCandidate) {
      candidate = optionalCandidate;
      type = "style";
    }
    const input = {
      beat: inputBeat,
      device,
      style: Boolean(style),
      type,
      matchedIndex: candidate?.index ?? -1,
    };
    this.inputs.push(input);
    if (!candidate) {
      const extra = Object.freeze({
        type: "extra",
        beat: inputBeat,
        tick: (inputBeat - this.responseStartBeat) * 4,
        device,
      });
      this.extras.push(extra);
      return extra;
    }
    const errorSeconds = this.beatsToSeconds(inputBeat - candidate.beat);
    const errorMs = Math.round(errorSeconds * 1000 * 100) / 100;
    const judgment = judgmentForError(Math.abs(errorSeconds), this.timingWindows);
    candidate.status = "hit";
    candidate.errorMs = errorMs;
    candidate.judgment = judgment;
    candidate.inputBeat = inputBeat;
    return Object.freeze({
      type,
      index: candidate.index,
      tick: candidate.tick,
      strength: candidate.strength ?? 0.55,
      errorMs,
      timing: errorMs < 0 ? "early" : errorMs > 0 ? "late" : "center",
      judgment,
      beat: inputBeat,
    });
  }

  advance(beat) {
    const current = Number(beat);
    if (!Number.isFinite(current)) return;
    for (const target of [...this.targets, ...this.optional]) {
      if (target.status !== "pending") continue;
      if (current > target.beat + this.windowBeats) target.status = "miss";
    }
  }

  finalize(beat = this.responseStartBeat + 4 + this.windowBeats) {
    if (this.finalized) return this.result;
    this.advance(beat);
    for (const target of [...this.targets, ...this.optional]) {
      if (target.status === "pending") target.status = "miss";
    }
    const hits = this.targets.filter((target) => target.status === "hit");
    const misses = this.targets.length - hits.length;
    const errors = hits.map((target) => Math.abs(target.errorMs));
    const accuracy = hits.length / this.targets.length;
    const meanAbsoluteErrorMs = errors.length
      ? errors.reduce((sum, value) => sum + value, 0) / errors.length
      : Infinity;
    const worstErrorMs = errors.length ? Math.max(...errors) : Infinity;
    const optionalHits = this.optional.filter((target) => target.status === "hit").length;
    const optionalAccuracy = this.optional.length ? optionalHits / this.optional.length : 1;
    const completion = accuracy >= 0.65 && misses <= Math.ceil(this.targets.length * 0.35);
    const grade = gradeMeasure({
      accuracy,
      meanAbsoluteErrorMs,
      worstErrorMs,
      misses,
      extras: this.extras.length,
    });
    this.finalized = true;
    this.result = Object.freeze({
      patternId: this.pattern.id,
      targetAccuracy: round4(accuracy),
      meanAbsoluteErrorMs: Number.isFinite(meanAbsoluteErrorMs) ? round2(meanAbsoluteErrorMs) : null,
      worstErrorMs: Number.isFinite(worstErrorMs) ? round2(worstErrorMs) : null,
      missedTargets: misses,
      extraTaps: this.extras.length,
      optionalStyleAccuracy: round4(optionalAccuracy),
      optionalStyleHits: optionalHits,
      measureCompletion: completion,
      grade,
      targets: freezeEvents(this.targets),
      optional: freezeEvents(this.optional),
      extras: Object.freeze([...this.extras]),
    });
    return this.result;
  }

  getSnapshot() {
    return Object.freeze({
      patternId: this.pattern.id,
      responseStartBeat: this.responseStartBeat,
      windowSeconds: this.timingWindows.accepted,
      targets: freezeEvents(this.targets),
      optional: freezeEvents(this.optional),
      extras: Object.freeze([...this.extras]),
      finalized: this.finalized,
      result: this.result,
    });
  }

  secondsToBeats(seconds) {
    return Number(seconds) * this.bpm / 60;
  }

  beatsToSeconds(beats) {
    return Number(beats) * 60 / this.bpm;
  }
}

export function gradeMeasure({
  accuracy = 0,
  meanAbsoluteErrorMs = Infinity,
  worstErrorMs = Infinity,
  misses = Infinity,
  extras = Infinity,
} = {}) {
  if (accuracy === 1 && misses === 0 && extras === 0 && meanAbsoluteErrorMs <= 48 && worstErrorMs <= 78) {
    return "PURRFECT";
  }
  if (accuracy >= 0.88 && misses <= 1 && extras <= 1 && meanAbsoluteErrorMs <= 92) {
    return "CLEAN";
  }
  if (accuracy >= 0.68 && extras <= 2 && meanAbsoluteErrorMs <= 145) {
    return "IN THE POCKET";
  }
  if (accuracy >= 0.42) return "SHAKY";
  return "LOST THE BEAT";
}

export function timingCellState(target) {
  if (!target) return "empty";
  if (target.status === "miss") return "miss";
  if (target.status !== "hit") return "target";
  if (target.judgment === "perfect") return "perfect";
  if (target.judgment === "clean") return "clean";
  return "pocket";
}

function closestUnmatched(events, beat, windowBeats) {
  let closest = null;
  let distance = Infinity;
  for (const event of events) {
    if (event.status !== "pending") continue;
    const nextDistance = Math.abs(beat - event.beat);
    if (nextDistance > windowBeats + 1e-9) continue;
    if (nextDistance < distance - 1e-9 || (Math.abs(nextDistance - distance) <= 1e-9 && event.tick < closest.tick)) {
      closest = event;
      distance = nextDistance;
    }
  }
  return closest;
}

function judgmentForError(seconds, timingWindows) {
  if (seconds <= timingWindows.perfect + 1e-9) return "perfect";
  if (seconds <= timingWindows.clean + 1e-9) return "clean";
  return "pocket";
}

function freezeEvents(events) {
  return Object.freeze(events.map((event) => Object.freeze({ ...event })));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(clamp(value, 0, 1) * 10000) / 10000;
}
