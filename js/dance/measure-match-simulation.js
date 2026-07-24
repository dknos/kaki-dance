import { MOVE_CLIPS } from "../animation/move-clips.js";
import { samplePoseTimeline } from "../animation/pose-timeline.js";
import { solveCharacterRig } from "../animation/kaki-rig.js";
import { DEFAULT_BEATMAP, patternForBar, tickInBar } from "../audio/beatmap.js";
import { clamp } from "../core/math.js";
import { characterDefinition } from "./character-catalog.js";
import { ContactSolver } from "./contact-solver.js";
import { MeasureJudge } from "./measure-judge.js";
import { getMoveDefinition } from "./move-catalog.js";

const CHOREOGRAPHY = Object.freeze({
  "basic-rock-a": {
    clip: "basicRock",
    moveId: "basicRock",
    family: "toprock",
    targetPhases: [0, 0.25, 0.5, 0.75],
  },
  "basic-rock-b": {
    clip: "basicRock",
    moveId: "basicRock",
    family: "toprock",
    targetPhases: [0, 0.25, 0.5, 0.75],
  },
  "go-down-a": {
    clip: "basicGoDown",
    moveId: "basicGoDown",
    family: "toprock",
    targetPhases: [0, 0.18, 0.43, 0.58, 0.78],
  },
  "six-step-a": {
    clip: "sixStep",
    moveId: "sixStep",
    family: "footwork",
    targetPhases: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6],
  },
  "six-step-b": {
    clip: "sixStep",
    moveId: "sixStep",
    family: "footwork",
    targetPhases: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1],
  },
  "windmill-a": {
    clip: "windmill",
    moveId: "windmill",
    family: "power",
    targetPhases: [0, 0.25, 0.5, 0.75, 1],
  },
  "windmill-freeze": {
    clip: "windmill",
    moveId: "windmill",
    family: "power",
    targetPhases: [0, 0.25, 0.5, 0.75, 1],
  },
});

const GRADE_HEAT = Object.freeze({
  PURRFECT: 18,
  CLEAN: 13,
  "IN THE POCKET": 9,
  SHAKY: 3,
  "LOST THE BEAT": -5,
});

export class MeasureMatchSimulation {
  constructor({
    mode = "measure",
    character = "kitty",
    beatmap = DEFAULT_BEATMAP,
    timingWindows,
    reducedMotion = false,
  } = {}) {
    this.mode = mode;
    this.character = characterDefinition(character);
    this.beatmap = beatmap;
    this.timingWindows = timingWindows;
    this.reducedMotion = reducedMotion;
    this.events = [];
    this.replay = [];
    this.results = [];
    this.started = false;
    this.complete = false;
    this.result = null;
    this.startBeat = 0;
    this.lastSnapshot = null;
    this.currentJudge = null;
    this.currentPattern = null;
    this.judgedPatternIds = new Set();
    this.newMissKeys = new Set();
    this.phraseStreak = 0;
    this.bestPhraseStreak = 0;
    this.crowdHeat = 12;
    this.maxCrowdHeat = 12;
    this.inputDevice = "keyboard";
    this.direction = 1;
    this.styleAccent = 0;
    this.missAccent = 0;
    this.lastHit = null;
    this.callout = "";
    this.calloutAge = 0;
    this.previousRig = null;
    this.contactSolver = new ContactSolver();
    this.dancerSnapshot = null;
    this.presentation = null;
  }

  begin(beatSnapshot) {
    this.started = true;
    this.complete = false;
    this.result = null;
    this.startBeat = beatSnapshot.beat;
    this.lastSnapshot = beatSnapshot;
    this.currentJudge = null;
    this.currentPattern = null;
    this.results = [];
    this.replay = [];
    this.judgedPatternIds.clear();
    this.newMissKeys.clear();
    this.phraseStreak = 0;
    this.bestPhraseStreak = 0;
    this.crowdHeat = 12;
    this.maxCrowdHeat = 12;
    this.styleAccent = 0;
    this.missAccent = 0;
    this.lastHit = null;
    this.callout = "";
    this.calloutAge = 0;
    this.previousRig = null;
    this.contactSolver.reset();
    this.updatePresentation(beatSnapshot);
    this.emit("roundStarted", { mode: this.mode, performer: "player", round: 1 });
  }

  update(dt, beatSnapshot, input) {
    if (!this.started || this.complete) return;
    if (input?.device) this.inputDevice = input.device;
    this.calloutAge += dt;
    this.styleAccent = Math.max(0, this.styleAccent - dt * 3.2);
    this.missAccent = Math.max(0, this.missAccent - dt * 1.8);
    if (this.calloutAge > 1.15) this.callout = "";
    const bar = Math.floor(beatSnapshot.beat / this.beatmap.beatsPerBar) + 1;
    const pattern = patternForBar(bar, this.beatmap);
    this.prepareJudge(pattern, bar);
    this.advanceJudge(beatSnapshot.beat);
    this.handleInput(input, beatSnapshot, pattern, bar);
    this.finishJudgeOutsideResponse(bar, beatSnapshot.beat);
    this.updatePresentation(beatSnapshot);
    this.recordReplay(beatSnapshot, input);
    this.lastSnapshot = beatSnapshot;
    if (beatSnapshot.beat >= this.sequenceBeats() - 1e-8) {
      this.finishSequence(beatSnapshot.beat);
    }
  }

  prepareJudge(pattern, bar) {
    if (!pattern || bar !== pattern.responseBar) return;
    if (this.currentJudge?.pattern.id === pattern.id) return;
    this.currentPattern = pattern;
    this.currentJudge = new MeasureJudge({
      pattern,
      responseStartBeat: (pattern.responseBar - 1) * this.beatmap.beatsPerBar,
      bpm: this.beatmap.bpm,
      timingWindows: this.timingWindows,
    });
    this.newMissKeys.clear();
    this.setCallout(pattern.responseBar === 3 ? "YOUR TURN - SPACE" : "COPY");
    this.emit("copyStarted", {
      patternId: pattern.id,
      choreographyId: pattern.choreographyId,
      bar: pattern.responseBar,
    });
  }

  advanceJudge(beat) {
    if (!this.currentJudge) return;
    this.currentJudge.advance(beat);
    const snapshot = this.currentJudge.getSnapshot();
    for (const target of snapshot.targets) {
      const key = `${snapshot.patternId}:${target.index}`;
      if (target.status !== "miss" || this.newMissKeys.has(key)) continue;
      this.newMissKeys.add(key);
      this.missAccent = 1;
      this.emit("rhythmMiss", {
        patternId: snapshot.patternId,
        index: target.index,
        tick: target.tick,
      });
    }
  }

  handleInput(input, beatSnapshot, pattern, bar) {
    if (!input) return;
    if (Math.abs(input.x) > 0.2) this.direction = Math.sign(input.x);
    const pressed = input.actionPressed || input.stylePressed || input.powerPressed || input.freezePressed;
    if (!pressed) return;
    if (!pattern || bar !== pattern.responseBar || !this.currentJudge) {
      this.emit("practiceTap", {
        beat: beatSnapshot.beat,
        bar,
        harmless: true,
      });
      return;
    }
    const style = Boolean(input.stylePressed);
    const result = this.currentJudge.judgeInput(beatSnapshot.beat, {
      style,
      device: input.device,
    });
    if (result.type === "target" || result.type === "style") {
      this.lastHit = Object.freeze({ ...result, age: 0 });
      this.styleAccent = result.type === "style" ? 1 : result.judgment === "perfect" ? 0.75 : 0.35;
      this.setCallout(
        result.type === "style"
          ? "STYLE!"
          : result.judgment === "perfect"
            ? "PURRFECT"
            : result.judgment === "clean"
              ? "CLEAN"
              : "POCKET",
      );
      const { type: matchType, ...hit } = result;
      this.emit("rhythmHit", {
        ...hit,
        matchType,
        patternId: pattern.id,
        message: result.type === "style" ? "Optional style accent." : "",
      });
    } else if (result.type === "extra") {
      this.emit("extraTap", { ...result, patternId: pattern.id });
    }
  }

  finishJudgeOutsideResponse(bar, beat) {
    if (!this.currentJudge || bar === this.currentJudge.pattern.responseBar) return;
    this.completeCurrentMeasure(beat);
  }

  completeCurrentMeasure(beat) {
    if (!this.currentJudge) return null;
    const pattern = this.currentJudge.pattern;
    if (this.judgedPatternIds.has(pattern.id)) {
      this.currentJudge = null;
      return null;
    }
    const result = this.currentJudge.finalize(beat);
    this.judgedPatternIds.add(pattern.id);
    this.results.push(result);
    const onboardingGrace = pattern.id === "pocket-quarters" && result.targetAccuracy >= 0.25;
    const completed = result.measureCompletion || onboardingGrace;
    this.phraseStreak = completed ? this.phraseStreak + 1 : 0;
    this.bestPhraseStreak = Math.max(this.bestPhraseStreak, this.phraseStreak);
    this.crowdHeat = clamp(
      this.crowdHeat + (GRADE_HEAT[result.grade] ?? 0) + (onboardingGrace ? 4 : 0),
      0,
      100,
    );
    this.maxCrowdHeat = Math.max(this.maxCrowdHeat, this.crowdHeat);
    this.setCallout(onboardingGrace && !result.measureCompletion ? "YOU GOT IT!" : result.grade);
    this.emit("measureCompleted", {
      result,
      phraseStreak: this.phraseStreak,
      onboardingGrace,
      message: `${result.grade}.`,
    });
    if (pattern.id === "pocket-quarters" && result.targetAccuracy === 0) {
      this.emit("tutorialReplay", {
        patternId: pattern.id,
        callBar: pattern.callBar,
        message: "Hear that bar once more.",
      });
    }
    this.currentJudge = null;
    this.currentPattern = null;
    return result;
  }

  updatePresentation(beatSnapshot) {
    const plan = presentationAtBeat(beatSnapshot.beat, this.beatmap);
    this.presentation = plan;
    const semanticClip = MOVE_CLIPS[plan.semanticClip] ?? MOVE_CLIPS.basicRock;
    const sampled = samplePoseTimeline(semanticClip, plan.phase, {
      bpm: this.beatmap.bpm,
      durationBeats: plan.durationBeats,
      reducedMotion: this.reducedMotion,
      sampleCadence: 12,
    });
    const move = plan.moveId ? getMoveDefinition(plan.moveId) : null;
    const contacts = move
      ? this.contactSolver.resolve(move, plan.phase, {
          mirror: false,
          baseX: 0,
          baseY: 0,
          loop: 0,
        })
      : this.contactSolver.resolve(null, 0);
    const rig = solveCharacterRig(this.character, sampled.pose, contacts, {
      mirror: false,
      balance: 0,
      wobble: 0,
      previousRig: this.previousRig,
    });
    this.previousRig = rig;
    const measured = this.contactSolver.measure(rig, contacts.contacts);
    this.dancerSnapshot = Object.freeze({
      moveId: plan.moveId,
      moveName: plan.displayName,
      family: plan.family,
      phase: plan.phase,
      presentationClip: plan.clip,
      presentationPhase: plan.phase,
      scheduled: true,
      startBeat: plan.startBeat,
      endBeat: plan.endBeat,
      loop: 0,
      extensions: 0,
      tags: Object.freeze(plan.tags),
      stamina: 100,
      momentum: plan.family === "power" ? 0.6 * this.direction : 0,
      direction: this.direction,
      mirror: false,
      balance: Object.freeze({ offset: 0, wobble: 0, failed: false }),
      pose: sampled,
      rig,
      contacts: Object.freeze({ ...contacts, measured }),
      queuedMove: "",
      accentQuality: this.styleAccent,
      missAccent: this.missAccent,
      lastHit: this.lastHit,
      victory: plan.clip === "victory",
    });
  }

  recordReplay(beatSnapshot, input) {
    this.replay.push(Object.freeze({
      step: this.replay.length,
      beat: Math.round(beatSnapshot.beat * 1e6) / 1e6,
      bar: Math.floor(beatSnapshot.beat / 4) + 1,
      tick: Math.round(tickInBar(beatSnapshot.beat, this.beatmap) * 1e4) / 1e4,
      actionPressed: Boolean(input?.actionPressed),
      stylePressed: Boolean(input?.stylePressed),
      patternId: this.currentJudge?.pattern.id ?? "",
      clip: this.presentation?.clip ?? "idleGroove",
      phase: Math.round((this.presentation?.phase ?? 0) * 1e6) / 1e6,
    }));
  }

  finishSequence(beat) {
    if (this.complete) return;
    this.completeCurrentMeasure(beat);
    this.complete = true;
    this.result = buildSequenceResult(this.results, {
      bestPhraseStreak: this.bestPhraseStreak,
      maxCrowdHeat: this.maxCrowdHeat,
    });
    this.emit("complete", { result: this.result });
  }

  setCallout(message) {
    this.callout = message;
    this.calloutAge = 0;
  }

  emit(type, detail = {}) {
    this.events.push(Object.freeze({ ...detail, type }));
  }

  consumeEvents(callback) {
    while (this.events.length) callback(this.events.shift());
  }

  getHighlightSnapshot() {
    return null;
  }

  getSnapshot(beatSnapshot = this.lastSnapshot) {
    const displayBeat = Math.max(0, beatSnapshot?.beat ?? 0);
    const bar = Math.floor(displayBeat / this.beatmap.beatsPerBar) + 1;
    const pattern = patternForBar(bar, this.beatmap);
    const state = measureState(bar, pattern, this.beatmap);
    const tick = tickInBar(displayBeat, this.beatmap);
    const judge = this.currentJudge?.getSnapshot() ?? null;
    const aggregate = aggregateProgress(this.results);
    const callTicks = pattern?.callTicks ?? [];
    const targetTicks = pattern?.targetTicks ?? [];
    const activeCells = buildCells({
      state,
      callTicks,
      targetTicks,
      targetStrengths: pattern?.targetStrengths ?? [],
      optionalStyleTicks: pattern?.optionalStyleTicks ?? [],
      judge,
    });
    return Object.freeze({
      mode: this.mode,
      started: this.started,
      complete: this.complete,
      performer: "player",
      character: this.character,
      waitingCharacter: null,
      dancer: this.dancerSnapshot,
      player: this.dancerSnapshot,
      opponent: null,
      beat: beatSnapshot,
      elapsedBeats: (beatSnapshot?.beat ?? 0) - this.startBeat,
      remainingBeats: Math.max(0, this.sequenceBeats() - (beatSnapshot?.beat ?? 0)),
      round: 1,
      battlePhase: 0,
      crowdHeat: this.crowdHeat,
      playerScore: this.result?.player ?? aggregate,
      opponentScore: null,
      callout: this.callout,
      calloutAge: this.calloutAge,
      practiceChainIndex: Math.min(this.results.length, 6),
      practiceNext: "",
      inputDevice: this.inputDevice,
      result: this.result,
      replayLength: this.replay.length,
      measureMatch: Object.freeze({
        state,
        label: labelForState(state, bar),
        bar,
        tick,
        playheadTick: Math.min(15.999, Math.max(0, tick)),
        pattern: pattern ?? null,
        cells: activeCells,
        phraseStreak: this.phraseStreak,
        bestPhraseStreak: this.bestPhraseStreak,
        lastResult: this.results.at(-1) ?? null,
        currentJudge: judge,
        progress: this.results.length / (this.beatmap.patterns?.length || 1),
        inputPrompt: this.inputDevice === "gamepad" ? "A" : this.inputDevice === "touch" ? "PAW" : "SPACE",
        onboarding: bar <= 5,
      }),
    });
  }

  sequenceBeats() {
    return this.mode === "practice"
      ? 5 * this.beatmap.beatsPerBar
      : this.beatmap.loopBars * this.beatmap.beatsPerBar;
  }
}

export function presentationAtBeat(beat, beatmap = DEFAULT_BEATMAP) {
  const beatsPerBar = beatmap.beatsPerBar ?? 4;
  const bar = Math.floor(beat / beatsPerBar) + 1;
  const localBeat = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const tick = localBeat * 4;
  const pattern = patternForBar(bar, beatmap);
  if (bar <= 1) {
    return plan("idleGroove", "basicRock", "idle", localBeat / beatsPerBar, bar, "Count In");
  }
  if (bar === beatmap.finale?.bar) {
    if (tick < beatmap.finale.getUpTick) {
      const phase = 0.2 + tick / Math.max(1, beatmap.finale.getUpTick) * 0.55;
      return plan("babyFreeze", "babyFreeze", "freeze", phase, bar, "Baby Freeze");
    }
    if (tick < beatmap.finale.victoryTick) {
      const phase = (tick - beatmap.finale.getUpTick)
        / Math.max(1, beatmap.finale.victoryTick - beatmap.finale.getUpTick);
      return plan("cleanGetUp", "cleanGetUp", "recovery", phase, bar, "Clean Get-Up");
    }
    return plan(
      "victory",
      "basicRock",
      "victory",
      (tick - beatmap.finale.victoryTick) / Math.max(1, 16 - beatmap.finale.victoryTick),
      bar,
      "Victory",
    );
  }
  const choreography = pattern ? CHOREOGRAPHY[pattern.choreographyId] : null;
  if (!choreography) {
    return plan("idleGroove", "basicRock", "idle", localBeat / beatsPerBar, bar, "Groove");
  }
  if (bar === pattern.callBar) {
    return plan(
      choreography.clip,
      choreography.moveId,
      choreography.family,
      0,
      bar,
      "Prepare",
    );
  }
  let phase = scheduledPhase(tick, pattern.targetTicks, choreography.targetPhases);
  let clip = choreography.clip;
  let moveId = choreography.moveId;
  let family = choreography.family;
  if (pattern.id === "power-to-freeze" && tick >= 12) {
    clip = "babyFreeze";
    moveId = "babyFreeze";
    family = "freeze";
    phase = scheduledPhase(tick, [12, 14, 16], [0, 0.2, 0.2]);
  }
  return plan(clip, moveId, family, phase, bar, displayName(moveId));
}

function scheduledPhase(tick, targetTicks, targetPhases) {
  const ticks = [...(targetTicks ?? [])];
  const phases = [...(targetPhases ?? [])];
  if (!ticks.length || ticks.length !== phases.length) return clamp(tick / 16, 0, 1);
  const points = ticks.map((value, index) => ({
    tick: value,
    phase: phases[index],
  }));
  if (points[0].tick > 0) points.unshift({ tick: 0, phase: 0 });
  if (points.at(-1).tick < 16) {
    points.push({ tick: 16, phase: 1 });
  }
  if (tick <= points[0].tick) return clamp(points[0].phase, 0, 1);
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    if (tick > right.tick) continue;
    const left = points[index - 1];
    const span = Math.max(1e-9, right.tick - left.tick);
    const amount = clamp((tick - left.tick) / span, 0, 1);
    return clamp(left.phase + (right.phase - left.phase) * amount, 0, 1);
  }
  return clamp(points.at(-1).phase, 0, 1);
}

function plan(clip, semanticClip, family, phase, bar, display) {
  const moveId = semanticClip === "basicRock" && family === "idle" ? "" : semanticClip;
  return Object.freeze({
    clip,
    semanticClip,
    moveId,
    family,
    phase: clamp(phase, 0, 1),
    durationBeats: 4,
    startBeat: (bar - 1) * 4,
    endBeat: bar * 4,
    displayName: display,
    tags: family === "idle" || family === "toprock"
      ? ["standing", "goDownReady"]
      : family === "freeze"
        ? ["floor", "freeze"]
        : ["floor", "twoHandsAvailable"],
  });
}

function measureState(bar, pattern, beatmap) {
  if (bar <= 1) return "countIn";
  if (bar === beatmap.finale?.bar) return "freeze";
  if (!pattern) return "groove";
  return bar === pattern.callBar ? "call" : "copy";
}

function labelForState(state, bar) {
  if (state === "countIn") return String(((bar - 1) % 4) + 1);
  if (state === "call") return "LISTEN";
  if (state === "copy") return bar === 3 ? "YOUR TURN - SPACE" : "COPY";
  if (state === "freeze") return "FREEZE - HOLD";
  return "KEEP THE GROOVE";
}

function buildCells({
  state,
  callTicks,
  targetTicks,
  targetStrengths,
  optionalStyleTicks,
  judge,
}) {
  const targets = state === "call" ? callTicks : targetTicks;
  const cells = Array.from({ length: 16 }, (_, tick) => ({
    tick,
    target: targets.includes(tick),
    strength: targetStrengths[targets.indexOf(tick)] ?? 0.7,
    optional: optionalStyleTicks.includes(tick),
    status: targets.includes(tick) ? "target" : "empty",
    errorMs: null,
  }));
  if (state !== "copy" || !judge) return Object.freeze(cells.map(Object.freeze));
  for (const target of judge.targets) {
    cells[target.tick] = {
      ...cells[target.tick],
      target: true,
      strength: target.strength,
      status: target.status,
      errorMs: target.errorMs,
      judgment: target.judgment,
    };
  }
  for (const style of judge.optional) {
    cells[style.tick] = {
      ...cells[style.tick],
      optional: true,
      status: style.status === "hit" ? "style" : cells[style.tick].status,
      errorMs: style.errorMs,
    };
  }
  return Object.freeze(cells.map(Object.freeze));
}

function aggregateProgress(results) {
  if (!results.length) {
    return Object.freeze({
      musicality: 0,
      vocabulary: 0,
      originality: 0,
      technique: 0,
      execution: 0,
      total: 0,
      maxCrowdHeat: 12,
      reasons: Object.freeze(["Listen to one bar, then echo it."]),
    });
  }
  const accuracy = average(results.map((result) => result.targetAccuracy)) * 100;
  const timing = average(results.map((result) => (
    result.meanAbsoluteErrorMs == null ? 0 : clamp(1 - result.meanAbsoluteErrorMs / 190, 0, 1)
  ))) * 100;
  const style = average(results.map((result) => result.optionalStyleAccuracy)) * 100;
  const completion = results.filter((result) => result.measureCompletion).length / results.length * 100;
  const total = Math.round(accuracy * 0.48 + timing * 0.32 + completion * 0.15 + style * 0.05);
  return Object.freeze({
    musicality: Math.round(accuracy),
    vocabulary: Math.round(completion),
    originality: Math.round(style),
    technique: Math.round(timing),
    execution: Math.round((accuracy + timing) / 2),
    total,
    maxCrowdHeat: 0,
    reasons: Object.freeze([]),
  });
}

function buildSequenceResult(results, {
  bestPhraseStreak,
  maxCrowdHeat,
}) {
  const aggregate = aggregateProgress(results);
  const gradeCounts = Object.fromEntries(
    ["PURRFECT", "CLEAN", "IN THE POCKET", "SHAKY", "LOST THE BEAT"]
      .map((grade) => [grade, results.filter((result) => result.grade === grade).length]),
  );
  const player = Object.freeze({
    ...aggregate,
    measures: results.length,
    completedMeasures: results.filter((result) => result.measureCompletion).length,
    bestPhraseStreak,
    maxCrowdHeat: Math.round(maxCrowdHeat),
    gradeCounts: Object.freeze(gradeCounts),
    measureResults: Object.freeze([...results]),
    reasons: Object.freeze([
      `${results.filter((result) => result.measureCompletion).length}/${results.length} bars copied.`,
      `Best phrase streak: ${bestPhraseStreak}.`,
      gradeCounts.PURRFECT ? `${gradeCounts.PURRFECT} PURRFECT bar${gradeCounts.PURRFECT === 1 ? "" : "s"}.` : "Keep the echo inside the lit cells.",
    ]),
  });
  return Object.freeze({
    winner: player.total >= 55 ? "player" : "session",
    player,
    opponent: null,
    categoryWinners: Object.freeze({}),
    margin: player.total,
  });
}

function displayName(moveId) {
  return {
    basicRock: "Basic Rock",
    basicGoDown: "Go Down",
    sixStep: "6-Step",
    windmill: "Windmill",
    babyFreeze: "Baby Freeze",
    cleanGetUp: "Clean Get-Up",
  }[moveId] ?? "Groove";
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
