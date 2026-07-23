import { MOVE_CLIPS } from "../animation/move-clips.js";
import {
  createPoseBridge,
  mirrorPose,
  samplePoseBridge,
  samplePoseTimeline,
} from "../animation/pose-timeline.js";
import { solveCharacterRig } from "../animation/kaki-rig.js";
import { ContactSolver } from "./contact-solver.js";
import { createBalanceState, resetBalance, updateFreezeBalance } from "./balance.js";
import { getMoveDefinition, MOVE_CATALOG } from "./move-catalog.js";
import { moveEligibility } from "./transition-graph.js";
import { spendStamina, updateStamina } from "./stamina.js";

const REQUEST_BUFFER_SECONDS = 0.16;
const TRANSITION_BLEND_BEATS = 0.22;

export class MoveSession {
  constructor({
    character,
    scorer,
    beatmap,
    timingWindows,
    reducedMotion = false,
  } = {}) {
    this.character = character;
    this.scorer = scorer;
    this.beatmap = beatmap;
    this.timingWindows = timingWindows;
    this.reducedMotion = reducedMotion;
    this.contactSolver = new ContactSolver();
    this.balance = createBalanceState();
    this.events = [];
    this.reset();
  }

  reset({ beat = 0 } = {}) {
    this.current = null;
    this.tags = new Set(["standing", "goDownReady"]);
    this.precedingFamily = "idle";
    this.stamina = 100;
    this.momentum = 0;
    this.direction = 1;
    this.mirror = false;
    this.queued = null;
    this.lastBeat = beat;
    this.poseSnapshot = null;
    this.contactSnapshot = this.contactSolver.resolve(null, 0);
    this.rigSnapshot = null;
    this.events.length = 0;
    resetBalance(this.balance);
  }

  requestMove(id, {
    beat = this.lastBeat,
    timing = null,
    direction = this.direction,
    mirror = this.mirror,
    responseBonus = 0,
  } = {}) {
    const move = getMoveDefinition(id);
    const phase = this.localPhaseAt(beat);
    const eligibility = moveEligibility(move, {
      tags: this.current ? this.current.move.exitTags : this.tags,
      precedingFamily: this.current?.move.family ?? this.precedingFamily,
      stamina: this.stamina,
      currentMove: this.current?.move ?? null,
      phase,
    });
    if (eligibility.eligible) {
      this.startMove(move, { beat, timing, direction, mirror, responseBonus });
      return eligibility;
    }
    if (eligibility.bufferable) {
      const beatsPerSecond = (this.beatmap?.bpm ?? 100) / 60;
      this.queued = {
        id,
        timing,
        direction,
        mirror,
        responseBonus,
        expiresAtBeat: beat + REQUEST_BUFFER_SECONDS * beatsPerSecond,
      };
      this.emit("buffered", { moveId: id, message: eligibility.reason });
      return { ...eligibility, buffered: true };
    }
    this.emit("invalid", { moveId: id, message: eligibility.reason });
    this.scorer?.recordInvalid();
    return eligibility;
  }

  extendCurrent(input, {
    beat = this.lastBeat,
    accented = false,
  } = {}) {
    if (!this.current || this.current.move.extensionInput !== input) return false;
    const move = this.current.move;
    const cost = move.staminaCost * 0.42;
    if (this.stamina < cost) {
      this.emit("invalid", { moveId: move.id, message: "LOW STAMINA" });
      return false;
    }
    const phase = this.localPhaseAt(beat);
    const windowDistance = Math.min(...move.accentWindows.map((window) => Math.abs(phase - window)));
    const cleanAccent = accented || windowDistance <= 0.09;
    this.current.extensions += 1;
    this.current.endBeat += move.loopLength || move.durationBeats;
    this.stamina = Math.max(0, this.stamina - cost);
    this.momentum += move.family === "power" ? 0.32 * this.direction : 0.08 * this.direction;
    this.scorer?.recordExtension(move, { accented: cleanAccent });
    this.emit("extended", { moveId: move.id, accented: cleanAccent });
    return true;
  }

  update(beatSnapshot, dt, {
    balanceX = 0,
    freezeHeld = false,
    deliberateRest = false,
  } = {}) {
    const beat = beatSnapshot.beat;
    const beatDelta = Math.max(0, Math.min(0.2, beat - this.lastBeat));
    this.lastBeat = beat;
    const move = this.current?.move ?? null;
    this.stamina = updateStamina(this.stamina, move, dt, {
      deliberateRest,
      intensity: beatSnapshot.intensity,
      bpm: beatSnapshot.bpm,
    });
    this.momentum *= Math.pow(0.993, dt * 120);

    if (this.queued) this.consumeQueue(beat);
    if (this.current) {
      const localPhase = this.localPhaseAt(beat);
      if (this.current.move.family === "freeze") {
        if (freezeHeld && beat + 0.15 >= this.current.endBeat) {
          this.extendCurrent("freeze", { beat, accented: beatSnapshot.beatPhase < 0.1 || beatSnapshot.beatPhase > 0.9 });
        }
        updateFreezeBalance(this.balance, {
          dt,
          beatDelta,
          inputX: balanceX,
          difficulty: this.current.move.difficulty,
          demand: this.current.move.balanceDemand,
          staminaRatio: this.stamina / 100,
          momentum: this.momentum,
          phase: localPhase,
          supportWidth: this.contactSnapshot.support.width,
        });
        if (this.balance.failed) {
          const failed = this.current.move;
          this.emit("failed", { moveId: failed.id, message: "FIND CONTACT" });
          this.scorer?.recordFailure();
          this.finishMove(beat, { failed: true });
        }
      }
      if (this.current && beat + 1e-8 >= this.current.endBeat) {
        this.finishMove(beat);
      }
    }
    this.updatePresentation(beatSnapshot);
    this.scorer?.cool(dt, !this.current);
  }

  startMove(move, {
    beat,
    timing,
    direction,
    mirror,
    responseBonus,
  }) {
    const previous = this.current?.move ?? null;
    let transitionPose = this.poseSnapshot?.pose ?? null;
    if (transitionPose && this.mirror) transitionPose = mirrorPose(transitionPose);
    if (transitionPose && mirror) transitionPose = mirrorPose(transitionPose);
    const entryPose = samplePoseTimeline(MOVE_CLIPS[move.animationClip], 0, {
      bpm: this.beatmap?.bpm ?? 100,
      durationBeats: move.loopLength || move.durationBeats,
      reducedMotion: this.reducedMotion,
      sampleCadence: move.poseCadence,
    }).pose;
    if (this.current) this.finishMove(beat, { transitioning: true });
    this.direction = Math.sign(direction) || 1;
    this.mirror = Boolean(mirror);
    this.stamina = spendStamina(this.stamina, move);
    if (move.family === "power") this.momentum = Math.max(0.45, Math.abs(this.momentum)) * this.direction;
    resetBalance(this.balance);
    this.contactSolver.reset();
    this.current = {
      move,
      startBeat: beat,
      endBeat: beat + move.durationBeats,
      extensions: 0,
      loop: 0,
      timing,
      transitionFrom: previous?.family ?? this.precedingFamily,
      direction: this.direction,
      mirror: this.mirror,
      responseBonus,
      maxContactError: 0,
      startedScored: false,
      transitionBridge: transitionPose
        ? createPoseBridge(transitionPose, entryPose, { drawings: 5 })
        : null,
      transitionBlendBeats: Math.min(TRANSITION_BLEND_BEATS, move.minimumDuration * 0.5),
    };
    this.queued = null;
    this.emit("moveStarted", {
      moveId: move.id,
      family: move.family,
      timing: timing?.label ?? "accepted",
      direction: this.direction,
    });
  }

  finishMove(beat, {
    failed = false,
    transitioning = false,
  } = {}) {
    if (!this.current) return;
    const state = this.current;
    const move = state.move;
    const balanceQuality = move.family === "freeze"
      ? Math.max(0.2, 1 - this.balance.wobble * 0.55)
      : 1;
    this.scorer?.recordMove(move, {
      beat: state.startBeat,
      timing: state.timing,
      direction: state.direction,
      transitionFrom: state.transitionFrom,
      contactError: state.maxContactError,
      balanceQuality,
      extension: state.extensions,
      responseBonus: state.responseBonus,
      completed: !failed,
    });
    this.precedingFamily = failed ? "recovery" : move.family;
    this.tags = new Set(failed
      ? ["floor", "twoHandsAvailable", "powerReady", "freezeReady"]
      : move.exitTags);
    this.emit(failed ? "moveFailed" : "moveCompleted", {
      moveId: move.id,
      beat,
      extensions: state.extensions,
      transitioning,
      balanceQuality,
    });
    this.current = null;
    this.contactSolver.reset();
    if (!transitioning) resetBalance(this.balance);
  }

  consumeQueue(beat) {
    if (!this.queued) return;
    if (beat > this.queued.expiresAtBeat) {
      this.emit("invalid", { moveId: this.queued.id, message: "HOLD THE BEAT" });
      this.scorer?.recordInvalid();
      this.queued = null;
      return;
    }
    const queued = this.queued;
    const move = getMoveDefinition(queued.id);
    const eligibility = moveEligibility(move, {
      tags: this.current ? this.current.move.exitTags : this.tags,
      precedingFamily: this.current?.move.family ?? this.precedingFamily,
      stamina: this.stamina,
      currentMove: this.current?.move ?? null,
      phase: this.localPhaseAt(beat),
    });
    if (eligibility.eligible) {
      this.startMove(move, { beat, ...queued });
    }
  }

  updatePresentation(beatSnapshot) {
    const move = this.current?.move ?? null;
    if (!move) {
      const idle = MOVE_CLIPS.basicRock;
      const pulsePhase = ((beatSnapshot.beat % 2) + 2) % 2 / 2;
      this.poseSnapshot = samplePoseTimeline(idle, pulsePhase, {
        bpm: beatSnapshot.bpm,
        durationBeats: 2,
        reducedMotion: this.reducedMotion,
        sampleCadence: 12,
      });
      this.contactSnapshot = this.contactSolver.resolve(null, 0);
    } else {
      const phase = this.localPhaseAt(beatSnapshot.beat);
      const loop = Math.floor(Math.max(0, beatSnapshot.beat - this.current.startBeat) / (move.loopLength || move.durationBeats));
      this.current.loop = loop;
      const sampledPose = samplePoseTimeline(MOVE_CLIPS[move.animationClip], phase, {
        bpm: beatSnapshot.bpm,
        durationBeats: move.loopLength || move.durationBeats,
        reducedMotion: this.reducedMotion,
        sampleCadence: move.poseCadence,
      });
      const blendBeats = this.current.transitionBlendBeats;
      const blendAmount = blendBeats > 0
        ? Math.min(1, Math.max(0, (beatSnapshot.beat - this.current.startBeat) / blendBeats))
        : 1;
      const activeBridge = this.current.transitionBridge && blendAmount < 1
        ? createPoseBridge(
            this.current.transitionBridge.from,
            sampledPose.pose,
            {
              drawings: this.current.transitionBridge.drawings,
              preserveBendUntil: this.current.transitionBridge.preserveBendUntil,
            },
          )
        : null;
      this.poseSnapshot = activeBridge
        ? {
            ...sampledPose,
            pose: samplePoseBridge(activeBridge, blendAmount),
            label: `${sampledPose.label}-bridge`,
          }
        : sampledPose;
      if (blendAmount >= 1) this.current.transitionBridge = null;
      this.contactSnapshot = this.contactSolver.resolve(move, phase, {
        mirror: this.mirror,
        baseX: 0,
        baseY: 0,
        loop,
      });
    }
    const previousRig = this.rigSnapshot;
    this.rigSnapshot = solveCharacterRig(this.character, this.poseSnapshot.pose, this.contactSnapshot, {
      mirror: this.mirror,
      balance: this.current?.move.family === "freeze" ? this.balance.offset : 0,
      wobble: this.current?.move.family === "freeze" ? this.balance.wobble * Math.sign(this.balance.offset || 1) : 0,
      previousRig,
    });
    const measured = this.contactSolver.measure(this.rigSnapshot, this.contactSnapshot.contacts);
    if (this.current) this.current.maxContactError = Math.max(this.current.maxContactError, measured.average);
  }

  localPhaseAt(beat) {
    if (!this.current) return 1;
    const move = this.current.move;
    const loopBeats = move.loopLength || move.durationBeats;
    const elapsed = Math.max(0, beat - this.current.startBeat);
    if (beat >= this.current.endBeat - 1e-8) return 1;
    return (elapsed % loopBeats) / loopBeats;
  }

  getSnapshot() {
    const move = this.current?.move ?? null;
    return Object.freeze({
      moveId: move?.id ?? "",
      moveName: move?.displayName ?? "",
      family: move?.family ?? "idle",
      phase: this.localPhaseAt(this.lastBeat),
      startBeat: this.current?.startBeat ?? this.lastBeat,
      endBeat: this.current?.endBeat ?? this.lastBeat,
      loop: this.current?.loop ?? 0,
      extensions: this.current?.extensions ?? 0,
      tags: Object.freeze([...this.tags]),
      stamina: this.stamina,
      momentum: this.momentum,
      direction: this.direction,
      mirror: this.mirror,
      balance: Object.freeze({ ...this.balance }),
      pose: this.poseSnapshot,
      rig: this.rigSnapshot,
      contacts: this.contactSnapshot,
      queuedMove: this.queued?.id ?? "",
    });
  }

  consumeEvents(callback) {
    while (this.events.length) callback(this.events.shift());
  }

  emit(type, detail = {}) {
    this.events.push(Object.freeze({ type, ...detail }));
  }
}

export function goldenChainIds() {
  return Object.freeze(["basicRock", "basicGoDown", "sixStep", "windmill", "babyFreeze", "cleanGetUp"]);
}

export function catalogMoveCount() {
  return Object.keys(MOVE_CATALOG).length;
}
