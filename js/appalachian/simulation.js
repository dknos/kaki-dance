import { characterDefinition } from "../dance/character-catalog.js";
import { clamp } from "../core/math.js";
import {
  FROLIC_STYLE_PROFILES,
  getFootwork,
  normalizeFrolicStyle,
  resolvedContacts,
} from "./footwork-catalog.js";
import { AppalachianAnimationController } from "./animation-controller.js";
import { AppalachianPhraseJudge } from "./phrase-judge.js";
import { FootworkTransitionGraph } from "./transition-graph.js";
import {
  APPALACHIAN_TUNE_MAP,
  FROLIC_PPQ,
  FROLIC_RUN_TICKS,
  FROLIC_STATES,
  FROLIC_TICKS_PER_BAR,
  callAtTick,
  frolicStateAtTick,
  localTickInBar,
  nearestPulseTick,
  strainAtTick,
} from "./tune-map.js";

const INPUT_KINDS = Object.freeze(["step", "brush", "drive", "lick"]);
const TURNAROUND_BARS = new Set([8, 16, 24, 32]);
const PRACTICE_LESSONS = Object.freeze([
  Object.freeze({
    id: "pulse",
    title: "Step joins the band",
    instruction: "Tap STEP four times with the pulse.",
    inputKind: "step",
    required: 4,
  }),
  Object.freeze({
    id: "brush",
    title: "Brush between steps",
    instruction: "Add two BRUSH sounds between foundation steps.",
    inputKind: "brush",
    required: 2,
  }),
  Object.freeze({
    id: "drive",
    title: "Build a backstep",
    instruction: "Use DRIVE twice for a backstep or chug phrase.",
    inputKind: "drive",
    required: 2,
  }),
  Object.freeze({
    id: "answer",
    title: "Answer one bar",
    instruction: "Keep the three bright anchor beats in your answer.",
    inputKind: "answer",
    required: 3,
  }),
  Object.freeze({
    id: "finish",
    title: "Finish the turnaround",
    instruction: "Press LICK in the final beat of a bar.",
    inputKind: "lick",
    required: 1,
  }),
]);

const PROFILE_CHOICES = Object.freeze({
  flatfoot: Object.freeze({
    step: ["walkingStep", "slidingWalk"],
    brush: ["shuffle", "heelToeChange", "dragSlide"],
    drive: ["backstep", "chug", "rockStep"],
    lick: ["crisscross", "turnaround"],
  }),
  buck: Object.freeze({
    step: ["walkingStep", "slidingWalk"],
    brush: ["shuffle", "doubleShuffle", "heelToeChange"],
    drive: ["backstep", "chug", "doubleStep", "tripleStep", "rockStep"],
    lick: ["crisscross", "turnaround"],
  }),
  clog: Object.freeze({
    step: ["walkingStep"],
    brush: ["shuffle", "doubleShuffle", "heelToeChange"],
    drive: ["doubleStep", "tripleStep", "chug", "backstep", "rockStep"],
    lick: ["crisscross", "turnaround"],
  }),
});

export class AppalachianJamSimulation {
  constructor({
    mode = "frolic",
    character = "kitty",
    style = "flatfoot",
    tuneMap = APPALACHIAN_TUNE_MAP,
    difficulty = "standard",
    reducedMotion = false,
    seed = 0x46524f4c,
  } = {}) {
    this.mode = mode === "stepShed" ? "stepShed" : "frolic";
    this.character = characterDefinition(character);
    this.style = normalizeFrolicStyle(style);
    this.tuneMap = tuneMap;
    this.difficulty = tuneMap.difficultyLayers[difficulty] ? difficulty : "standard";
    this.reducedMotion = reducedMotion;
    this.seed = seed >>> 0;
    this.graph = new FootworkTransitionGraph({ style: this.style });
    this.animation = new AppalachianAnimationController({ style: this.style, graph: this.graph });
    this.judge = new AppalachianPhraseJudge({
      tuneMap,
      style: this.style,
      difficulty: this.difficulty,
    });
    this.events = [];
    this.replay = [];
    this.started = false;
    this.complete = false;
    this.result = null;
    this.lastSnapshot = null;
    this.lastTick = -Infinity;
    this.lastState = FROLIC_STATES.COUNT_IN;
    this.inputDevice = "keyboard";
    this.inputCounters = Object.fromEntries(INPUT_KINDS.map((kind) => [kind, 0]));
    this.foundationFoot = "left";
    this.callCursor = new Set();
    this.callout = "";
    this.calloutAge = 0;
    this.microResponse = 0;
    this.microFoot = "both";
    this.lastInput = null;
    this.liveScore = null;
    this.crowdHeat = 16;
    this.maxCrowdHeat = 16;
    this.practiceLesson = 0;
    this.practiceProgress = 0;
    this.practiceAnchorHits = new Set();
    this.lastBar = 0;
  }

  begin(beatSnapshot) {
    const tick = beatToTick(beatSnapshot?.beat);
    this.started = true;
    this.complete = false;
    this.result = null;
    this.lastSnapshot = beatSnapshot;
    this.lastTick = tick;
    this.lastState = frolicStateAtTick(tick);
    this.events.length = 0;
    this.replay.length = 0;
    this.callCursor.clear();
    this.inputCounters = Object.fromEntries(INPUT_KINDS.map((kind) => [kind, 0]));
    this.foundationFoot = "left";
    this.callout = "";
    this.calloutAge = 0;
    this.microResponse = 0;
    this.microFoot = "both";
    this.lastInput = null;
    this.liveScore = null;
    this.crowdHeat = 16;
    this.maxCrowdHeat = 16;
    this.practiceLesson = 0;
    this.practiceProgress = 0;
    this.practiceAnchorHits.clear();
    this.lastBar = Math.floor(Math.max(0, tick) / FROLIC_TICKS_PER_BAR) + 1;
    this.graph = new FootworkTransitionGraph({ style: this.style });
    this.animation = new AppalachianAnimationController({ style: this.style, graph: this.graph });
    this.animation.reset(Math.max(0, tick));
    this.judge = new AppalachianPhraseJudge({
      tuneMap: this.tuneMap,
      style: this.style,
      difficulty: this.difficulty,
    });
    this.emit("roundStarted", {
      mode: this.mode,
      performer: "player",
      round: 1,
      message: this.mode === "stepShed" ? "Step Shed: tap STEP with the pulse." : "Find the groove. Your feet are in the band.",
    });
  }

  update(dt, beatSnapshot, input) {
    if (!this.started || this.complete) return;
    if (input?.device) this.inputDevice = input.device;
    const tick = beatToTick(beatSnapshot.beat);
    this.calloutAge += dt;
    if (this.calloutAge > 1.25) this.callout = "";
    this.microResponse = Math.max(0, this.microResponse - dt * 7.5);
    this.handleStateChange(tick);
    this.emitTradeCalls(this.lastTick, tick);
    this.animation.update(Math.max(0, tick));
    this.animation.consumeContacts((contact) => this.emitScheduledContact(contact, beatSnapshot));
    this.handleInput(input, tick, beatSnapshot);
    this.recordReplay(input, tick);
    this.handleBarBoundary(tick);
    this.lastSnapshot = beatSnapshot;
    this.lastTick = tick;
    if (this.mode === "frolic" && tick >= FROLIC_RUN_TICKS) this.finish();
  }

  handleStateChange(tick) {
    const state = frolicStateAtTick(tick);
    if (state === this.lastState) return;
    this.lastState = state;
    this.emit("frolicState", {
      state,
      bar: Math.floor(Math.max(0, tick) / FROLIC_TICKS_PER_BAR) + 1,
      message: stateMessage(state),
    });
    if (state === FROLIC_STATES.TRADE_RESPONSE) this.setCallout("ANSWER THE LICK");
    else if (state === FROLIC_STATES.TURNAROUND) this.setCallout("TURN IT AROUND");
    else if (state === FROLIC_STATES.FINISH) this.setCallout("LAND THE ENDING");
  }

  handleInput(input, tick, beatSnapshot) {
    if (!input || tick < 0) return;
    const requests = [
      ["step", input.actionPressed],
      ["brush", input.stylePressed],
      ["drive", input.powerPressed],
      ["lick", input.freezePressed],
    ];
    for (const [kind, pressed] of requests) {
      if (!pressed) continue;
      this.requestMovement(kind, input, tick, beatSnapshot);
    }
  }

  requestMovement(kind, input, tick, beatSnapshot) {
    const state = frolicStateAtTick(tick);
    const direction = inputDirection(input, kind);
    const candidates = this.candidatesFor(kind, tick, direction);
    const currentId = this.animation.current?.move.id ?? null;
    const landingTick = Math.ceil(tick / 24) * 24;
    const legal = this.graph.chooseLegal({
      fromId: currentId,
      candidates,
      entryFoot: this.animation.current?.entryFoot ?? this.foundationFoot,
      direction,
      landingTick,
    });
    if (!legal?.move) {
      this.setCallout("SHIFT YOUR WEIGHT");
      this.emit("frolicInputRejected", {
        inputKind: kind,
        reason: "no-legal-successor",
        tick,
      });
      return;
    }
    const request = this.animation.request(legal.move.id, { tick, direction });
    const rhythmOnly = !request.ok && request.reason === "queue-full";
    if (!request.ok && !rhythmOnly) {
      this.setCallout("SHIFT YOUR WEIGHT");
      this.emit("frolicInputRejected", {
        inputKind: kind,
        reason: request.reason,
        tick,
      });
      return;
    }
    const move = legal.move;
    // The full body keeps one authored successor buffered, but a second valid
    // rhythmic input still sounds and produces a knee/board micro-response.
    // STEP continues alternating its musical contact foot while the body waits.
    const entryFoot = rhythmOnly && kind === "step"
      ? this.foundationFoot
      : request.request?.entryFoot ?? legal.entryFoot;
    const contacts = resolvedContacts(move, entryFoot);
    const firstContact = contacts[0] ?? {
      foot: entryFoot,
      articulation: "flat",
      intensity: 0.5,
      sampleGroup: "softSole",
    };
    const nearest = nearestPulseTick(tick, FROLIC_PPQ / 2);
    const timingOffsetTicks = tick - nearest;
    this.inputCounters[kind] += 1;
    if (kind === "step") this.foundationFoot = request.request?.exitFoot ?? legal.exitFoot;
    this.microResponse = 1;
    this.microFoot = firstContact.foot;
    this.lastInput = Object.freeze({
      kind,
      tick: round(tick),
      audioTime: beatSnapshot.audioTime,
      timingOffsetTicks: round(timingOffsetTicks),
      moveId: move.id,
      foot: firstContact.foot,
      articulation: firstContact.articulation,
      device: input.device ?? "unknown",
      queued: request.status === "queued" || rhythmOnly,
      rhythmOnly,
    });
    const judged = this.judge.recordInput({
      tick,
      moveId: move.id,
      articulation: firstContact.articulation,
      intensity: firstContact.intensity,
      timingOffsetTicks,
      style: this.style,
      foot: firstContact.foot,
      inputKind: kind,
    });
    this.judge.recordTransition({
      tick,
      fromId: currentId ?? "",
      toId: move.id,
      legal: true,
      reset: false,
    });
    const validTurnaround = isTurnaroundWindow(tick);
    if (kind === "lick") {
      this.judge.recordTurnaround({
        tick,
        moveId: move.id,
        validWindow: validTurnaround,
        controlled: move.id === "turnaround" || move.id === "controlledEnding",
      });
    }
    // Refresh only on accepted input, not every 120 Hz simulation step. This
    // keeps live trade/restraint feedback current without per-frame scoring.
    this.liveScore = this.judge.getResult();
    this.emit("footContact", {
      ...firstContact,
      tick,
      moveId: move.id,
      style: this.style,
      inputKind: kind,
      device: input.device ?? "unknown",
      immediate: true,
      inputAudioTime: beatSnapshot.audioTime,
      timingOffsetTicks,
      message: "",
    });
    this.emit("frolicInput", {
      ...judged,
      queued: request.status === "queued" || rhythmOnly,
      rhythmOnly,
      state,
      validTurnaround,
    });
    if (Math.abs(timingOffsetTicks) <= 10) this.setCallout(kind === "lick" && validTurnaround ? "CLEAN TURN!" : "IN THE TUNE");
    if (kind === "lick" && !validTurnaround) this.setCallout("SAVE THE LICK");
    this.advancePractice(kind, tick);
  }

  candidatesFor(kind, tick, direction) {
    if (kind === "lick") {
      const bar = Math.floor(tick / FROLIC_TICKS_PER_BAR) + 1;
      if (bar === 32) return ["controlledEnding"];
      if (isTurnaroundWindow(tick)) return ["turnaround", "crisscross"];
    }
    if (kind === "step" && ["forward", "back"].includes(direction) && this.style !== "clog") {
      return ["slidingWalk", "walkingStep"];
    }
    if (kind === "step") return ["walkingStep"];
    const choices = PROFILE_CHOICES[this.style][kind];
    const offset = this.inputCounters[kind] % choices.length;
    return [...choices.slice(offset), ...choices.slice(0, offset)];
  }

  emitTradeCalls(previousTick, currentTick) {
    if (!(currentTick >= previousTick)) return;
    for (const call of this.tuneMap.calls) {
      const barStart = (call.callBar - 1) * FROLIC_TICKS_PER_BAR;
      call.rhythmTicks.forEach((localTick, index) => {
        const absoluteTick = barStart + localTick;
        const key = `${call.id}:${index}`;
        if (absoluteTick <= previousTick || absoluteTick > currentTick || this.callCursor.has(key)) return;
        this.callCursor.add(key);
        this.emit("tradeCall", {
          callId: call.id,
          tick: absoluteTick,
          localTick,
          anchor: call.anchorTicks.some((anchor) => Math.abs(anchor - localTick) <= 1),
          instrument: call.instrument,
          sampleGroup: "rivalBoard",
          intensity: call.anchorTicks.includes(localTick) ? 0.84 : 0.58,
        });
      });
    }
  }

  emitScheduledContact(contact, beatSnapshot) {
    this.emit("footContact", {
      ...contact,
      immediate: false,
      inputAudioTime: beatSnapshot.audioTime,
      inputKind: "continuation",
      message: "",
    });
  }

  handleBarBoundary(tick) {
    if (tick < 0) return;
    const bar = Math.floor(tick / FROLIC_TICKS_PER_BAR) + 1;
    if (bar === this.lastBar) return;
    this.lastBar = bar;
    this.liveScore = this.judge.getResult();
    this.crowdHeat = clamp(12 + this.liveScore.total * 0.74, 0, 100);
    this.maxCrowdHeat = Math.max(this.maxCrowdHeat, this.crowdHeat);
    this.emit("phrasePulse", {
      bar,
      strain: strainAtTick(tick, this.tuneMap).id,
      score: this.liveScore,
    });
  }

  advancePractice(kind, tick) {
    if (this.mode !== "stepShed" || this.complete) return;
    const lesson = PRACTICE_LESSONS[this.practiceLesson];
    if (!lesson) return;
    let accepted = false;
    if (lesson.inputKind === kind) accepted = true;
    if (lesson.id === "pulse" && kind === "step") {
      const offset = Math.abs(tick - nearestPulseTick(tick, FROLIC_PPQ));
      accepted = offset <= 24;
    }
    if (lesson.id === "answer") {
      const local = localTickInBar(tick);
      const anchors = [0, 96, 240];
      const match = anchors.findIndex((anchor) => Math.abs(local - anchor) <= 24);
      if (match >= 0) {
        this.practiceAnchorHits.add(match);
        this.practiceProgress = this.practiceAnchorHits.size;
      }
      accepted = false;
    }
    if (lesson.id === "finish") accepted = kind === "lick" && isAnyBarTurnaround(tick);
    if (accepted) this.practiceProgress += 1;
    if (this.practiceProgress < lesson.required) return;
    this.emit("practiceLessonComplete", {
      lessonId: lesson.id,
      message: `${lesson.title}.`,
    });
    this.practiceLesson += 1;
    this.practiceProgress = 0;
    this.practiceAnchorHits.clear();
    if (this.practiceLesson >= PRACTICE_LESSONS.length) {
      this.finish();
      return;
    }
    this.setCallout(PRACTICE_LESSONS[this.practiceLesson].title.toUpperCase());
  }

  recordReplay(input, tick) {
    this.replay.push(Object.freeze({
      step: this.replay.length,
      tick: round(tick),
      style: this.style,
      state: frolicStateAtTick(tick),
      moveId: this.animation.current?.move.id ?? "",
      queuedMove: this.animation.queued?.move.id ?? "",
      input: Object.freeze({
        x: round(input?.x ?? 0),
        y: round(input?.y ?? 0),
        step: Boolean(input?.actionPressed),
        brush: Boolean(input?.stylePressed),
        drive: Boolean(input?.powerPressed),
        lick: Boolean(input?.freezePressed),
      }),
    }));
  }

  finish() {
    if (this.complete) return;
    this.complete = true;
    const player = this.judge.getResult();
    this.result = Object.freeze({
      player: Object.freeze({
        ...player,
        maxCrowdHeat: Math.round(this.maxCrowdHeat),
      }),
      opponent: null,
      winner: "player",
    });
    this.emit("roundCompleted", {
      performer: "player",
      round: 1,
      breakdown: player,
    });
    this.emit("complete", { result: this.result });
  }

  setCallout(message) {
    this.callout = message;
    this.calloutAge = 0;
  }

  emit(type, detail = {}) {
    this.events.push(Object.freeze({ type, ...detail }));
  }

  consumeEvents(callback) {
    while (this.events.length) callback(this.events.shift());
  }

  getHighlightSnapshot() {
    return null;
  }

  getSnapshot(beatSnapshot = this.lastSnapshot) {
    const tick = beatToTick(beatSnapshot?.beat);
    const displayTick = Math.max(0, tick);
    const state = frolicStateAtTick(tick);
    const bar = Math.min(32, Math.max(1, Math.floor(displayTick / FROLIC_TICKS_PER_BAR) + 1));
    const localTick = localTickInBar(displayTick);
    const strain = strainAtTick(displayTick, this.tuneMap);
    const activeCall = callAtTick(displayTick, this.tuneMap);
    const dancer = this.animation.getSnapshot(displayTick, this.microResponse, this.microFoot);
    const liveScore = this.liveScore ?? this.judge.getResult();
    const lesson = PRACTICE_LESSONS[this.practiceLesson] ?? null;
    const countInBeat = tick < 0 ? Math.floor((tick + this.tuneMap.countInBars * 4 * FROLIC_PPQ) / FROLIC_PPQ) + 1 : 0;
    return Object.freeze({
      mode: this.mode,
      started: this.started,
      complete: this.complete,
      performer: "player",
      character: this.character,
      waitingCharacter: null,
      dancer,
      player: dancer,
      opponent: null,
      beat: beatSnapshot,
      elapsedBeats: Math.max(0, tick / FROLIC_PPQ),
      remainingBeats: Math.max(0, (FROLIC_RUN_TICKS - tick) / FROLIC_PPQ),
      round: 1,
      battlePhase: 0,
      crowdHeat: this.crowdHeat,
      playerScore: liveScore,
      opponentScore: null,
      callout: this.callout,
      calloutAge: this.calloutAge,
      inputDevice: this.inputDevice,
      result: this.result,
      replayLength: this.replay.length,
      frolic: Object.freeze({
        state,
        stateLabel: stateLabel(state, strain),
        style: this.style,
        profile: FROLIC_STYLE_PROFILES[this.style],
        bar,
        countInBeat: clamp(countInBeat, 0, 8),
        tick: round(tick),
        localTick: round(localTick),
        beatInBar: Math.floor(localTick / FROLIC_PPQ),
        pulsePhase: (localTick % FROLIC_PPQ) / FROLIC_PPQ,
        strain,
        call: activeCall,
        callPhase: activeCall
          ? bar === activeCall.callBar ? "call" : "response"
          : "",
        currentMove: dancer.moveId,
        queuedMove: dancer.queuedMove,
        supportingFoot: dancer.supportingFoot,
        lastInput: this.lastInput,
        restraint: liveScore.restraint,
        score: liveScore,
        practice: this.mode === "stepShed" && lesson ? Object.freeze({
          lesson: this.practiceLesson + 1,
          totalLessons: PRACTICE_LESSONS.length,
          id: lesson.id,
          title: lesson.title,
          instruction: lesson.instruction,
          progress: this.practiceProgress,
          required: lesson.required,
        }) : null,
      }),
    });
  }
}

export function simulateFrolicInputs(inputs, {
  style = "flatfoot",
  character = "kitty",
  mode = "frolic",
  endTick = FROLIC_RUN_TICKS,
} = {}) {
  const simulation = new AppalachianJamSimulation({ style, character, mode });
  simulation.begin(snapshotAtTick(-8 * FROLIC_PPQ));
  const byTick = new Map();
  for (const value of inputs) {
    const key = Number(value.tick) || 0;
    if (!byTick.has(key)) byTick.set(key, []);
    byTick.get(key).push(value);
  }
  for (let tick = -8 * FROLIC_PPQ; tick <= endTick; tick += 12) {
    const input = emptyInput();
    for (const value of byTick.get(tick) ?? []) {
      const key = {
        step: "actionPressed",
        brush: "stylePressed",
        drive: "powerPressed",
        lick: "freezePressed",
      }[value.kind ?? "step"];
      input[key] = true;
      input[key.replace("Pressed", "")] = true;
      input.x = Number(value.x) || 0;
      input.y = Number(value.y) || 0;
    }
    simulation.update(12 / FROLIC_PPQ * 60 / 120, snapshotAtTick(tick), input);
    if (simulation.complete) break;
  }
  return Object.freeze({
    result: simulation.result,
    replay: Object.freeze([...simulation.replay]),
    snapshot: simulation.getSnapshot(),
  });
}

function inputDirection(input, kind) {
  if (kind === "lick" && input.x < -0.45) return "turn-left";
  if (kind === "lick" && input.x > 0.45) return "turn-right";
  if (Math.abs(input.x) > 0.45 && kind !== "step") return "cross";
  if (input.x < -0.28) return "left";
  if (input.x > 0.28) return "right";
  if (input.y < -0.28) return "forward";
  if (input.y > 0.28) return "back";
  return "neutral";
}

function isTurnaroundWindow(tick) {
  const bar = Math.floor(tick / FROLIC_TICKS_PER_BAR) + 1;
  return TURNAROUND_BARS.has(bar) && localTickInBar(tick) >= FROLIC_TICKS_PER_BAR - FROLIC_PPQ;
}

function isAnyBarTurnaround(tick) {
  return localTickInBar(tick) >= FROLIC_TICKS_PER_BAR - FROLIC_PPQ;
}

function stateLabel(state, strain) {
  if (state === FROLIC_STATES.COUNT_IN) return "COUNT IT IN";
  if (state === FROLIC_STATES.OPEN_JAM) return strain?.id === "B1" ? "BUILD THE FROLIC" : "FIND THE GROOVE";
  if (state === FROLIC_STATES.TRADE_CALL) return "HEAR THE LICK";
  if (state === FROLIC_STATES.TRADE_RESPONSE) return "ANSWER THE LICK";
  if (state === FROLIC_STATES.TURNAROUND) return "TURNAROUND";
  if (state === FROLIC_STATES.BREAKDOWN) return "BREAKDOWN";
  if (state === FROLIC_STATES.FINISH) return "BRING IT HOME";
  return "RESULTS";
}

function stateMessage(state) {
  return {
    [FROLIC_STATES.OPEN_JAM]: "Open floor. Build a lick.",
    [FROLIC_STATES.TRADE_CALL]: "Listen for the anchor accents.",
    [FROLIC_STATES.TRADE_RESPONSE]: "Answer the lick.",
    [FROLIC_STATES.TURNAROUND]: "Turn the phrase around.",
    [FROLIC_STATES.BREAKDOWN]: "Breakdown. Keep the tune clear.",
    [FROLIC_STATES.FINISH]: "Bring the tune home.",
    [FROLIC_STATES.RESULTS]: "Frolic complete.",
  }[state] ?? "";
}

function beatToTick(beat) {
  return (Number(beat) || 0) * FROLIC_PPQ;
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function emptyInput() {
  return {
    x: 0,
    y: 0,
    action: false,
    actionPressed: false,
    style: false,
    stylePressed: false,
    power: false,
    powerPressed: false,
    freeze: false,
    freezePressed: false,
    device: "simulation",
  };
}

function snapshotAtTick(tick) {
  const beat = tick / FROLIC_PPQ;
  const beatIndex = Math.floor(beat);
  return Object.freeze({
    audioTime: (beat + 8) * 0.5,
    playbackSeconds: (beat + 8) * 0.5,
    beat,
    beatIndex,
    beatPhase: ((beat % 1) + 1) % 1,
    beatInBar: ((beatIndex % 4) + 4) % 4,
    barIndex: Math.floor(beat / 4),
    measure: Math.floor(beat / 4) + 1,
    phrase: Math.floor(beat / 32) + 1,
    section: "simulation",
    intensity: 0.7,
    bpm: 120,
    paused: false,
    running: true,
  });
}
