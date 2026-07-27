import { characterDefinition } from "../dance/character-catalog.js";
import { clamp } from "../core/math.js";
import {
  FROLIC_STYLE_PROFILES,
  getFootwork,
  normalizeFrolicStyle,
  resolvedContacts,
} from "./footwork-catalog.js";
import { AppalachianAnimationController } from "./animation-controller.js";
import { AppalachianIntentBuffer } from "./performance-intent.js";
import { boardRegion, BoardLineTracker } from "./board-lines.js";
import { AppalachianPhraseJudge } from "./phrase-judge.js";
import { AppalachianPerformanceState } from "./performance-state.js";
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

const TURNAROUND_BARS = new Set([8, 16, 24, 32]);
const EMPTY_PERFORMANCE_INPUT = Object.freeze({});
export const PRACTICE_LESSONS = Object.freeze([
  Object.freeze({
    id: "pulse",
    title: "Two feet, one pulse",
    instruction: "Alternate Left and Right Arrow four times with the pulse.",
    inputKind: "basic",
    required: 4,
  }),
  Object.freeze({
    id: "articulations",
    title: "Change the shoe sound",
    instruction: "Add Shift brush, Control heel, then Z toe to either foot.",
    inputKind: "articulations",
    required: 3,
  }),
  Object.freeze({
    id: "travel",
    title: "Carry the rhythm",
    instruction: "Travel with WASD while the feet keep tapping.",
    inputKind: "travel",
    required: 1,
  }),
  Object.freeze({
    id: "arms",
    title: "Shape the silhouette",
    instruction: "Raise, lower, and sweep both arms while the feet continue.",
    inputKind: "arms",
    required: 1,
  }),
  Object.freeze({
    id: "small-hop",
    title: "Hop and settle",
    instruction: "Hold and release Space, then settle cleanly on the board.",
    inputKind: "small-hop",
    required: 1,
  }),
  Object.freeze({
    id: "beat-one",
    title: "Bring it to one",
    instruction: "Use T in the final beat, or land cleanly on the next beat one.",
    inputKind: "beat-one",
    required: 1,
  }),
  Object.freeze({
    id: "answer",
    title: "Answer the caller",
    instruction: "Listen through the call, then answer during the response bar.",
    inputKind: "answer",
    required: 1,
  }),
]);

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
    this.mode = ["stepShed", "tradeLicks"].includes(mode) ? mode : "frolic";
    this.character = characterDefinition(character);
    this.rivalCharacter = characterDefinition(this.character.id === "kitty" ? "soder" : "kitty");
    this.style = normalizeFrolicStyle(style);
    this.tuneMap = tuneMap;
    this.difficulty = tuneMap.difficultyLayers[difficulty] ? difficulty : "standard";
    this.reducedMotion = reducedMotion;
    this.seed = seed >>> 0;
    this.animation = new AppalachianAnimationController({ style: this.style });
    this.rivalAnimation = new AppalachianAnimationController({ style: this.style });
    this.judge = new AppalachianPhraseJudge({
      tuneMap,
      style: this.style,
      difficulty: this.difficulty,
      tradeMode: this.mode === "tradeLicks",
    });
    this.performanceState = new AppalachianPerformanceState();
    this.events = [];
    this.replay = [];
    this.started = false;
    this.complete = false;
    this.result = null;
    this.highlightSnapshot = null;
    this.highlightQuality = -1;
    this.lastSnapshot = null;
    this.lastTick = -Infinity;
    this.lastState = FROLIC_STATES.COUNT_IN;
    this.inputDevice = "keyboard";
    this.foundationFoot = "left";
    this.callCursor = new Set();
    this.callout = "";
    this.calloutAge = 0;
    this.lastInput = null;
    this.lastPerformanceReceipt = null;
    this.liveScore = null;
    this.crowdHeat = 16;
    this.maxCrowdHeat = 16;
    this.practiceLesson = 0;
    this.practiceProgress = 0;
    this.practiceAnchorHits = new Set();
    this.practiceArticulations = new Set();
    this.lastBar = 0;
    this.boardLines = new BoardLineTracker();
    this.lastBoardLineCount = 0;
    this.bankHistory = [];
    this.intents = new AppalachianIntentBuffer();
  }

  begin(beatSnapshot) {
    const tick = beatToTick(beatSnapshot?.beat);
    this.started = true;
    this.complete = false;
    this.result = null;
    this.highlightSnapshot = null;
    this.highlightQuality = -1;
    this.lastSnapshot = beatSnapshot;
    this.lastTick = tick;
    this.lastState = modeStateAtTick(this.mode, tick);
    this.events.length = 0;
    this.replay.length = 0;
    this.callCursor.clear();
    this.foundationFoot = "left";
    this.callout = "";
    this.calloutAge = 0;
    this.lastInput = null;
    this.lastPerformanceReceipt = null;
    this.liveScore = null;
    this.crowdHeat = 16;
    this.maxCrowdHeat = 16;
    this.practiceLesson = 0;
    this.practiceProgress = 0;
    this.practiceAnchorHits.clear();
    this.practiceArticulations.clear();
    this.boardLines.reset();
    this.lastBoardLineCount = 0;
    this.bankHistory = [];
    this.intents.clear();
    this.performanceState.reset();
    this.lastBar = Math.floor(Math.max(0, tick) / FROLIC_TICKS_PER_BAR) + 1;
    this.animation = new AppalachianAnimationController({ style: this.style });
    this.animation.reset(Math.max(0, tick));
    this.rivalAnimation = new AppalachianAnimationController({ style: this.style });
    this.rivalAnimation.reset(Math.max(0, tick));
    this.judge = new AppalachianPhraseJudge({
      tuneMap: this.tuneMap,
      style: this.style,
      difficulty: this.difficulty,
      tradeMode: this.mode === "tradeLicks",
    });
    this.emit("roundStarted", {
      mode: this.mode,
      performer: "player",
      round: 1,
      message: this.mode === "stepShed"
        ? "Step Shed: alternate Left and Right Arrow with the pulse."
        : this.mode === "tradeLicks"
          ? "Trade Licks. Hear the caller, then answer in your own voice."
          : "Free Frolic. Your feet are in the band.",
    });
  }

  update(dt, beatSnapshot, input) {
    if (!this.started || this.complete) return;
    if (input?.device) this.inputDevice = input.device;
    const tick = beatToTick(beatSnapshot.beat);
    this.calloutAge += dt;
    if (this.calloutAge > 1.25) this.callout = "";
    this.handleStateChange(tick);
    this.emitTradeCalls(this.lastTick, tick);
    this.rivalAnimation.update(Math.max(0, tick), { dt, input: EMPTY_PERFORMANCE_INPUT });
    this.rivalAnimation.consumeContacts(() => {});
    this.handlePerformanceEdges(input, tick, beatSnapshot);
    this.flushPerformanceIntents(tick, input, beatSnapshot);
    this.animation.update(Math.max(0, tick), { dt, input });
    this.animation.consumeContacts((contact) => this.emitScheduledContact(contact, beatSnapshot));
    const expression = this.performanceState.update(tick, this.animation.getSnapshot(Math.max(0, tick)).performance);
    this.animation.setPerformanceState(expression);
    const scoreHeat = (this.liveScore?.total ?? 0) * 0.52;
    const stateLift = expression.id === "cooking"
      ? 14
      : expression.id === "in-the-pocket"
        ? 7
        : expression.id === "scrambling"
          ? -10
          : 0;
    const targetHeat = clamp(8 + scoreHeat + expression.quality * 28 + stateLift, 4, 100);
    this.crowdHeat += (targetHeat - this.crowdHeat) * (1 - Math.exp(-Math.max(0, dt) * 2.4));
    this.maxCrowdHeat = Math.max(this.maxCrowdHeat, this.crowdHeat);
    this.updateBoardPerformance(input, tick);
    this.advancePracticeContinuous(input, tick);
    this.handleInput(input, tick, beatSnapshot);
    this.recordReplay(input, tick);
    this.handleBarBoundary(tick);
    this.lastSnapshot = beatSnapshot;
    this.lastTick = tick;
    if (["frolic", "tradeLicks"].includes(this.mode) && tick >= FROLIC_RUN_TICKS) this.finish();
  }

  handleImmediateInput(input, beatSnapshot) {
    if (!this.started || this.complete || !input) return false;
    const tick = beatToTick(beatSnapshot?.beat);
    if (tick < 0) return false;
    if (input.device) this.inputDevice = input.device;
    this.animation.applyPerformanceInput(0, input, tick);
    const handled = this.handlePerformanceEdges(input, tick, beatSnapshot);
    if (!handled) this.handleInput(input, tick, beatSnapshot);
    this.recordReplay(input, tick);
    return handled || Boolean(
      input.actionPressed || input.stylePressed || input.powerPressed || input.freezePressed
    );
  }

  handlePerformanceEdges(input, tick, beatSnapshot) {
    const edges = input?.performanceEdges ?? [];
    if (!edges.length) return false;
    if (this.animation.jump.state === "airborne") return false;
    for (const edge of edges) {
      const result = this.intents.accept(edge, tick, {
        freeFoot: oppositeFoot(this.animation.supportingFoot()),
      });
      for (const anticipation of result.anticipations) {
        const simulationReceiptTimestamp = now();
        this.animation.anticipateFoot(anticipation);
        this.lastPerformanceReceipt = Object.freeze({
          foot: anticipation.foot,
          rawInputTimestamp: finiteOrNull(edge.rawTimeStamp),
          simulationReceiptTimestamp,
          inputToSimulationMilliseconds: Number.isFinite(Number(edge.rawTimeStamp))
            ? Math.max(0, simulationReceiptTimestamp - Number(edge.rawTimeStamp))
            : null,
        });
        this.emit("footAnticipation", {
          ...anticipation,
          ...this.lastPerformanceReceipt,
        });
      }
      for (const intent of result.intents) {
        this.requestFootIntent(intent, input, tick, beatSnapshot);
      }
    }
    return true;
  }

  flushPerformanceIntents(tick, input, beatSnapshot) {
    const support = this.animation.supportingFoot();
    for (const intent of this.intents.advance(tick, {
      freeFoot: oppositeFoot(support),
    })) {
      this.requestFootIntent(intent, input, tick, beatSnapshot);
    }
  }

  requestFootIntent(intent, input, tick, beatSnapshot) {
    const simulationReceiptTimestamp = now();
    const direction = inputDirection(input ?? {}, intent.family);
    const currentId = this.animation.current?.move.id ?? "";
    const request = this.animation.requestFootGesture(intent, {
      tick,
      direction,
      phrasePhase: (tick % FROLIC_PPQ) / FROLIC_PPQ,
    });
    if (!request.ok) {
      this.performanceState.recordConflict(tick, request.reason);
      this.emit("frolicInputRejected", {
        inputKind: intent.family,
        foot: intent.foot,
        reason: request.reason,
        tick,
      });
      return;
    }
    const rawInputTimestamp = finiteOrNull(intent.rawTimeStamp);
    this.lastInput = Object.freeze({
      kind: intent.family,
      tick: round(tick),
      audioTime: beatSnapshot.audioTime,
      rawInputTimestamp,
      simulationReceiptTimestamp,
      timingOffsetTicks: null,
      moveId: request.gesture.moveId,
      foot: intent.foot,
      articulation: request.gesture.contacts[0]?.articulation ?? "flat",
      device: intent.device,
      actionId: request.request.id,
      response: request.status,
      queued: request.status === "foot-layer-buffered",
      rhythmOnly: false,
      chord: intent.chord,
      modifiers: intent.modifiers,
      contactPending: true,
    });
    this.judge.recordTransition({
      tick,
      fromId: currentId,
      toId: request.gesture.moveId,
      legal: request.transition?.resolved === true,
      reset: false,
    });
    this.emit("frolicInput", {
      tick,
      inputKind: intent.family,
      foot: intent.foot,
      moveId: request.gesture.moveId,
      queued: request.status === "foot-layer-buffered",
      rhythmOnly: false,
      actionId: request.request.id,
      rawInputTimestamp,
      simulationReceiptTimestamp,
      transitionValidated: request.transition?.resolved === true,
      chord: intent.chord,
      modifiers: intent.modifiers,
      contactPending: true,
    });
    this.advancePractice(intent.family === "basic" ? "basic" : intent.family, tick, {
      articulation: intent.modifiers?.articulation || request.gesture.contacts[0]?.articulation,
    });
  }

  handleStateChange(tick) {
    const state = modeStateAtTick(this.mode, tick);
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
    if (this.animation.jump.state === "airborne") {
      const aerialKind = input.leftFootPressed || input.rightFootPressed || input.actionPressed
        ? "basic"
        : input.brushPressed || input.articulationPressed || input.stylePressed
          ? "brush"
          : input.drivePressed || input.turnPressed || input.powerPressed
            ? "drive"
            : "";
      if (aerialKind) {
        this.emit("aerialVariation", {
          tick,
          variation: this.animation.jump.variation,
          style: this.style,
        });
        this.advancePractice(aerialKind, tick);
      }
      return;
    }
    const requests = [
      ["step", input.stepPressed ?? input.actionPressed, input.stepEvent ?? input.actionEvent],
      ["brush", input.brushPressed ?? input.stylePressed, input.brushEvent ?? input.styleEvent],
      ["drive", input.drivePressed ?? input.powerPressed, input.driveEvent ?? input.powerEvent],
      ["lick", input.freezePressed, input.freezeEvent],
    ];
    for (const [kind, pressed, edge] of requests) {
      if (!pressed) continue;
      this.requestMovement(kind, input, tick, beatSnapshot, edge);
    }
  }

  requestMovement(kind, input, tick, beatSnapshot, edge = null) {
    const simulationReceiptTimestamp = now();
    const state = modeStateAtTick(this.mode, tick);
    const direction = inputDirection(input, kind);
    const moveId = moveForInput(kind, direction, {
      style: this.style,
      grounded: Boolean(input.groundModifier),
      committed: Boolean(input.commitModifier),
      turnaround: kind === "lick"
        || Math.abs(Number(input.turnDirection) || 0) > 0
        || isAnyBarTurnaround(tick),
    });
    const move = getFootwork(moveId);
    const currentId = this.animation.current?.move.id ?? null;
    const entryFoot = kind === "step"
      ? this.foundationFoot
      : this.animation.base?.freeFoot ?? this.foundationFoot;
    const request = this.animation.request(moveId, {
      tick,
      direction,
      entryFoot,
      inputTimestamp: edge?.rawTimeStamp,
      simulationReceiptTimestamp,
    });
    if (!move || !request.ok) {
      this.emit("frolicInputRejected", {
        inputKind: kind,
        reason: request.reason ?? "unknown-move",
        tick,
      });
      return;
    }
    if (request.status === "buffered-for-landing") {
      this.emit("frolicInputBuffered", {
        inputKind: kind,
        moveId: move.id,
        tick,
        bufferSeconds: 0.12,
      });
      return;
    }
    if (request.status === "recovered") {
      const recoveryRegion = boardRegion(this.animation.getSnapshot(Math.max(0, tick)).worldPosition);
      this.judge.recordTransition({
        tick,
        fromId: currentId ?? "",
        toId: "recovery",
        legal: false,
        reset: false,
      });
      this.emit("footContact", {
        foot: this.animation.supportingFoot(),
        articulation: "recovery",
        intensity: 0.42,
        sampleGroup: "softSole",
        tick,
        moveId: "recovery",
        style: this.style,
        inputKind: kind,
        device: input.device ?? "unknown",
        immediate: true,
        contactId: `recovery:${request.request.id}`,
        actionId: request.request.id,
        boardRegion: recoveryRegion.id,
        boardResonance: recoveryRegion.resonance,
        rawInputTimestamp: finiteOrNull(edge?.rawTimeStamp),
        simulationReceiptTimestamp,
        inputAudioTime: beatSnapshot.audioTime,
        timingOffsetTicks: 0,
      });
      this.setCallout("SHIFT WEIGHT · RECOVER");
      return;
    }
    const contacts = resolvedContacts(move, entryFoot);
    const firstContact = contacts[0] ?? {
      foot: entryFoot,
      articulation: "flat",
      intensity: 0.5,
      sampleGroup: "softSole",
    };
    const nearest = nearestPulseTick(tick, FROLIC_PPQ / 2);
    const timingOffsetTicks = tick - nearest;
    if (kind === "step") this.foundationFoot = oppositeFoot(entryFoot);
    const rawInputTimestamp = finiteOrNull(edge?.rawTimeStamp);
    const inputAudioTime = Number.isFinite(Number(edge?.audioTime))
      ? Number(edge.audioTime)
      : beatSnapshot.audioTime;
    const contactId = `${request.request.id}:0:${firstContact.tick}`;
    const contactRegion = boardRegion(this.animation.getSnapshot(Math.max(0, tick)).worldPosition);
    this.lastInput = Object.freeze({
      kind,
      tick: round(tick),
      audioTime: inputAudioTime,
      rawInputTimestamp,
      simulationReceiptTimestamp,
      timingOffsetTicks: round(timingOffsetTicks),
      moveId: move.id,
      foot: firstContact.foot,
      articulation: firstContact.articulation,
      device: input.device ?? "unknown",
      actionId: request.request.id,
      response: request.status,
      queued: false,
      rhythmOnly: false,
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
      legal: request.transition?.resolved === true,
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
      contactId,
      actionId: request.request.id,
      boardRegion: contactRegion.id,
      boardResonance: contactRegion.resonance,
      rawInputTimestamp,
      simulationReceiptTimestamp,
      inputAudioTime,
      timingOffsetTicks,
      message: "",
    });
    this.emit("frolicInput", {
      ...judged,
      queued: false,
      rhythmOnly: false,
      actionId: request.request.id,
      rawInputTimestamp,
      simulationReceiptTimestamp,
      state,
      validTurnaround,
    });
    if (Math.abs(timingOffsetTicks) <= 10) this.setCallout(kind === "lick" && validTurnaround ? "CLEAN TURN!" : "IN THE TUNE");
    if (kind === "lick" && !validTurnaround) this.setCallout("TURN AND RECOVER");
    this.advancePractice(kind, tick);
  }

  updateBoardPerformance(input, tick) {
    const dancer = this.animation.getSnapshot(Math.max(0, tick));
    const board = this.boardLines.update(dancer.worldPosition, {
      moveId: dancer.moveId,
      clean: dancer.jump?.landingQuality >= 0.48,
    });
    for (const lineId of board.newlyCompleted) {
      this.emit("boardLine", {
        lineId,
        tick,
        distance: board.distance,
        region: board.region.id,
      });
      this.setCallout(boardLineLabel(lineId).toUpperCase());
    }
    if (board.completed.length !== this.lastBoardLineCount) {
      this.lastBoardLineCount = board.completed.length;
      this.judge.setPerformanceMetrics?.({
        ...dancer.performance,
        boardLines: board.completed.length,
        figureEight: this.boardLines.getSnapshot().figureEightCandidate,
      });
    }
    if (
      dancer.moveId === "controlledEnding"
      || (dancer.moveId === "turnaround" && isAnyBarTurnaround(tick))
      || (dancer.jump?.state === "landing" && dancer.jump.landingQuality >= 0.72)
    ) {
      const lastBank = this.bankHistory.at(-1);
      if (!lastBank || tick - lastBank.tick > FROLIC_PPQ) {
        const bank = Object.freeze({
          tick,
          moveId: dancer.moveId,
          moveCount: this.judge.events.length,
          travelDistance: board.distance,
          clean: true,
        });
        this.bankHistory.push(bank);
        this.emit("danceLineBanked", bank);
      }
    }
    void input;
  }

  emitTradeCalls(previousTick, currentTick) {
    if (!["tradeLicks", "stepShed"].includes(this.mode)) return;
    if (!(currentTick >= previousTick)) return;
    for (const call of this.tuneMap.calls) {
      const barStart = (call.callBar - 1) * FROLIC_TICKS_PER_BAR;
      call.rhythmTicks.forEach((localTick, index) => {
        const absoluteTick = barStart + localTick;
        const key = `${call.id}:${index}`;
        if (absoluteTick <= previousTick || absoluteTick > currentTick || this.callCursor.has(key)) return;
        this.callCursor.add(key);
        const foot = index % 2 ? "right" : "left";
        const family = index % 5 === 4 ? "drive" : index % 3 === 2 ? "brush" : "basic";
        this.rivalAnimation.requestFootGesture({
          id: 10_000 + this.callCursor.size,
          foot,
          family,
          modifiers: Object.freeze({ grounded: false, committed: index === call.rhythmTicks.length - 1 }),
          rawTimeStamp: null,
          sourceCodes: Object.freeze(["trade-call"]),
        }, {
          tick: absoluteTick,
          direction: index === call.rhythmTicks.length - 1 ? "turn-right" : "neutral",
          phrasePhase: localTick / FROLIC_TICKS_PER_BAR,
        });
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
    const region = boardRegion(contact.worldPosition);
    const event = {
      ...contact,
      boardRegion: region.id,
      boardResonance: region.resonance,
      immediate: false,
      inputAudioTime: beatSnapshot.audioTime,
      contactEmissionTimestamp: now(),
      inputKind: "continuation",
      message: "",
    };
    if (contact.inputIntent) this.recordPerformanceContact(event);
    if (contact.jumpEvent === "landing") {
      this.performanceState.recordLanding({
        tick: contact.tick,
        quality: contact.landingQuality,
      });
    }
    this.emit("footContact", event);
  }

  recordPerformanceContact(contact) {
    const nearest = nearestPulseTick(contact.tick, FROLIC_PPQ / 2);
    const timingOffsetTicks = contact.tick - nearest;
    const intent = contact.inputIntent;
    const judged = this.judge.recordInput({
      tick: contact.tick,
      moveId: contact.moveId,
      articulation: contact.articulation,
      intensity: contact.intensity,
      timingOffsetTicks,
      style: this.style,
      foot: contact.foot,
      inputKind: intent.family,
    });
    this.performanceState.recordContact(judged);
    this.liveScore = this.judge.getResult();
    this.lastInput = Object.freeze({
      ...(this.lastInput ?? {}),
      kind: intent.family,
      tick: round(contact.tick),
      timingOffsetTicks: round(timingOffsetTicks),
      moveId: contact.moveId,
      foot: contact.foot,
      articulation: contact.articulation,
      actionId: contact.actionId,
      contactPending: false,
    });
    if (Math.abs(timingOffsetTicks) <= 10) this.setCallout("IN THE TUNE");
    this.emit("frolicContactJudged", {
      ...judged,
      actionId: contact.actionId,
      transitionValidated: contact.transitionValidated,
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

  advancePractice(kind, tick, detail = {}) {
    if (this.mode !== "stepShed" || this.complete) return;
    const lesson = PRACTICE_LESSONS[this.practiceLesson];
    if (!lesson) return;
    let accepted = false;
    if (lesson.inputKind === kind) accepted = true;
    if (lesson.id === "pulse" && ["step", "basic"].includes(kind)) {
      const offset = Math.abs(tick - nearestPulseTick(tick, FROLIC_PPQ));
      accepted = offset <= 24;
    }
    if (lesson.id === "articulations") {
      const articulation = String(detail.articulation ?? "");
      if (["brush", "heel", "toe"].includes(articulation)) {
        this.practiceArticulations.add(articulation);
        this.practiceProgress = this.practiceArticulations.size;
      }
    }
    if (lesson.id === "beat-one") {
      accepted = kind === "turn" && isAnyBarTurnaround(tick);
    }
    if (lesson.id === "answer") {
      accepted = frolicStateAtTick(tick) === FROLIC_STATES.TRADE_RESPONSE
        && ["basic", "brush", "articulation", "drive", "turn"].includes(kind);
    }
    if (accepted) this.practiceProgress += 1;
    this.completePracticeLesson(lesson);
  }

  advancePracticeContinuous(input, tick) {
    if (this.mode !== "stepShed" || this.complete) return;
    const lesson = PRACTICE_LESSONS[this.practiceLesson];
    if (!lesson) return;
    const dancer = this.animation.getSnapshot(Math.max(0, tick));
    let complete = false;
    if (lesson.id === "travel") complete = dancer.performance.travelDistance >= 1;
    if (lesson.id === "arms") complete = dancer.performance.armInputDistance >= 1.2;
    if (lesson.id === "small-hop") complete = dancer.performance.jumps >= 1;
    if (lesson.id === "beat-one") {
      complete = dancer.jump.state === "landing"
        && dancer.jump.landingQuality >= 0.72
        && localTickInBar(tick) <= 20;
    }
    if (!complete) return;
    this.practiceProgress = lesson.required;
    this.completePracticeLesson(lesson);
    void input;
  }

  completePracticeLesson(lesson) {
    if (this.practiceProgress < lesson.required) return;
    this.emit("practiceLessonComplete", {
      lessonId: lesson.id,
      message: `${lesson.title}.`,
    });
    this.practiceLesson += 1;
    this.practiceProgress = 0;
    this.practiceAnchorHits.clear();
    this.practiceArticulations.clear();
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
      state: modeStateAtTick(this.mode, tick),
      moveId: this.animation.current?.move.id ?? "",
      queuedMove: this.animation.queued?.move.id ?? "",
      input: Object.freeze({
        x: round(input?.x ?? 0),
        y: round(input?.y ?? 0),
        armX: round(input?.armX ?? 0),
        armY: round(input?.armY ?? 0),
        step: Boolean(input?.actionPressed),
        brush: Boolean(input?.stylePressed),
        drive: Boolean(input?.powerPressed),
        lick: Boolean(input?.freezePressed),
        jump: Boolean(input?.jumpPressed),
        performanceEdges: Object.freeze((input?.performanceEdges ?? []).map((edge) => Object.freeze({
          action: edge.action,
          grounded: Boolean(edge.grounded),
          committed: Boolean(edge.committed),
        }))),
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
    return this.highlightSnapshot;
  }

  getSnapshot(beatSnapshot = this.lastSnapshot) {
    const tick = beatToTick(beatSnapshot?.beat);
    const displayTick = Math.max(0, tick);
    const state = modeStateAtTick(this.mode, tick);
    const bar = Math.min(32, Math.max(1, Math.floor(displayTick / FROLIC_TICKS_PER_BAR) + 1));
    const localTick = localTickInBar(displayTick);
    const strain = strainAtTick(displayTick, this.tuneMap);
    const activeCall = ["tradeLicks", "stepShed"].includes(this.mode)
      ? callAtTick(displayTick, this.tuneMap)
      : null;
    const dancer = this.animation.getSnapshot(displayTick);
    const rivalSnapshot = this.rivalAnimation.getSnapshot(displayTick);
    const rivalLayer = rivalSnapshot.footLayers.find((foot) => foot.stage !== "planted");
    const opponent = rivalLayer
      ? Object.freeze({
          ...rivalSnapshot,
          presentationClip: rivalLayer.moveId || rivalSnapshot.presentationClip,
          presentationPhase: rivalLayer.phase,
          moveId: rivalLayer.moveId || rivalSnapshot.moveId,
        })
      : rivalSnapshot;
    const board = this.boardLines.getSnapshot();
    this.judge.setPerformanceMetrics?.({
      ...dancer.performance,
      boardLines: board.completed.length,
      figureEight: board.figureEightCandidate,
      bankedLines: this.bankHistory.length,
    });
    const liveScore = this.liveScore ?? this.judge.getResult();
    const lesson = PRACTICE_LESSONS[this.practiceLesson] ?? null;
    const countInBeat = tick < 0 ? Math.floor((tick + this.tuneMap.countInBars * 4 * FROLIC_PPQ) / FROLIC_PPQ) + 1 : 0;
    const snapshot = Object.freeze({
      mode: this.mode,
      started: this.started,
      complete: this.complete,
      performer: "player",
      character: this.character,
      waitingCharacter: this.mode === "tradeLicks" ? this.rivalCharacter : null,
      dancer,
      player: dancer,
      opponent: this.mode === "tradeLicks" ? opponent : null,
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
        rivalVisible: this.mode === "tradeLicks",
        currentMove: dancer.moveId,
        queuedMove: dancer.queuedMove,
        supportingFoot: dancer.supportingFoot,
        weightDistribution: dancer.weightDistribution,
        leftFoot: dancer.feet.left,
        rightFoot: dancer.feet.right,
        inputBuffers: this.intents.snapshot(),
        modifierChord: dancer.modifierChord,
        lastInput: this.lastInput,
        restraint: liveScore.restraint,
        score: liveScore,
        performanceState: this.performanceState.getSnapshot(),
        board,
        boardRegion: board.region,
        boardLines: board.completed,
        bankedDanceLines: this.bankHistory.length,
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
    const highlightQuality = this.performanceState.getSnapshot().quality
      + (dancer.jump.state === "landing" && dancer.jump.landingQuality >= 0.72 ? 0.18 : 0)
      + (this.bankHistory.length ? 0.08 : 0);
    if (!this.complete && tick >= 0 && this.judge.events.length >= 4 && highlightQuality > this.highlightQuality) {
      this.highlightQuality = highlightQuality;
      this.highlightSnapshot = snapshot;
    }
    return snapshot;
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
  if (["drive", "lick", "turn"].includes(kind) && Number(input.turnDirection) < 0) return "turn-left";
  if (["drive", "lick", "turn"].includes(kind) && Number(input.turnDirection) > 0) return "turn-right";
  if (kind === "lick" && input.x < -0.45) return "turn-left";
  if (kind === "lick" && input.x > 0.45) return "turn-right";
  if (Math.abs(input.x) > 0.45 && kind !== "step") return "cross";
  if (input.x < -0.28) return "left";
  if (input.x > 0.28) return "right";
  if (input.y < -0.28) return "forward";
  if (input.y > 0.28) return "back";
  return "neutral";
}

function moveForInput(kind, direction, {
  style = "flatfoot",
  grounded = false,
  committed = false,
  turnaround = false,
} = {}) {
  if (kind === "step") {
    return style !== "clog" && ["forward", "back"].includes(direction) ? "slidingWalk" : "walkingStep";
  }
  if (kind === "brush") {
    if (committed && style !== "flatfoot") return "doubleShuffle";
    return ["left", "right", "cross"].includes(direction) ? "heelToeChange" : "shuffle";
  }
  if (turnaround) return "turnaround";
  if (kind === "drive") {
    if (grounded) return "rockStep";
    if (direction === "back") return "backstep";
    if (committed && style !== "flatfoot") return "doubleStep";
    return "chug";
  }
  return "turnaround";
}

function boardLineLabel(id) {
  return {
    cornerToCorner: "Corner-to-Corner",
    aroundTheBoard: "Around the Board",
    bandstandTurn: "Bandstand Turn",
    centerSweetSpot: "Center Sweet Spot",
    fourCornerFrolic: "Four-Corner Frolic",
    backstepReturn: "Backstep Return",
    fullHallCircuit: "Full Hall Circuit",
  }[id] ?? id;
}

function oppositeFoot(foot) {
  return foot === "right" ? "left" : "right";
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isTurnaroundWindow(tick) {
  const bar = Math.floor(tick / FROLIC_TICKS_PER_BAR) + 1;
  return TURNAROUND_BARS.has(bar) && localTickInBar(tick) >= FROLIC_TICKS_PER_BAR - FROLIC_PPQ;
}

function isAnyBarTurnaround(tick) {
  return localTickInBar(tick) >= FROLIC_TICKS_PER_BAR - FROLIC_PPQ;
}

function modeStateAtTick(mode, tick) {
  const state = frolicStateAtTick(tick);
  if (mode !== "frolic") return state;
  if ([
    FROLIC_STATES.TRADE_CALL,
    FROLIC_STATES.TRADE_RESPONSE,
    FROLIC_STATES.BREAKDOWN,
  ].includes(state)) return FROLIC_STATES.OPEN_JAM;
  return state;
}

function stateLabel(state, strain) {
  if (state === FROLIC_STATES.COUNT_IN) return "COUNT IT IN";
  if (state === FROLIC_STATES.OPEN_JAM) return strain?.id === "B1" ? "BUILD THE FROLIC" : "FIND THE GROOVE";
  if (state === FROLIC_STATES.TRADE_CALL) return "HEAR THE LICK";
  if (state === FROLIC_STATES.TRADE_RESPONSE) return "ANSWER THE LICK";
  if (state === FROLIC_STATES.TURNAROUND) return "TURNAROUND";
  if (state === FROLIC_STATES.BREAKDOWN) return "DANCE IT OUT";
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
