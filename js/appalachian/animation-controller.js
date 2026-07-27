import { clamp } from "../core/math.js";
import { smoothPoseVector } from "./arm-pose-field.js";
import { resolveFootGesture } from "./foot-gesture-deck.js";
import {
  FROLIC_JUMP_PROFILES,
  getFootwork,
  normalizeFrolicStyle,
  resolvedContacts,
} from "./footwork-catalog.js";
import { FootworkTransitionGraph } from "./transition-graph.js";
import { transitionRecipeFor } from "./transition-recipes.js";

const GROOVE_TICKS = 96;
const REQUEST_BUFFER_SECONDS = 0.12;
const DEFAULT_DT = 1 / 120;
const MAXIMUM_FACING_SPEED = 5;
const BOARD_BOUNDS = Object.freeze({ minX: -4.25, maxX: 4.25, minZ: -2.65, maxZ: 2.65 });
const STYLE_TRAVEL = Object.freeze({
  flatfoot: Object.freeze({ speed: 1.55, acceleration: 8.2, airControl: 0.42 }),
  buck: Object.freeze({ speed: 1.82, acceleration: 9.4, airControl: 0.52 }),
  clog: Object.freeze({ speed: 1.72, acceleration: 8.8, airControl: 0.46 }),
});

const RECOVERY_MOVE = Object.freeze({
  id: "recovery",
  displayName: "Weight-shift recovery",
  family: "recovery",
  durationTicks: 48,
  exitRule: "opposite",
  rootMotion: Object.freeze({ forward: 0, lateral: 0 }),
  contacts: Object.freeze([]),
});

/**
 * Persistent performance controller.
 *
 * The controller owns board-space motion, support state, short contact-aware
 * handoffs, upper-body fields, and the complete compression/air/landing cycle.
 * A foot action can change without clearing travel or arm state; arm input can
 * change without creating a new lower-body action id.
 */
export class AppalachianAnimationController {
  constructor({ style = "flatfoot" } = {}) {
    this.style = normalizeFrolicStyle(style);
    this.graph = new FootworkTransitionGraph({ style: this.style });
    this.reset(0);
  }

  reset(tick = 0) {
    const startTick = Number(tick) || 0;
    this.base = {
      clip: "groove",
      startTick,
      supportingFoot: "right",
      freeFoot: "left",
    };
    this.action = null;
    this.current = null;
    this.lastMoveId = "";
    this.phrase = null;
    this.queued = null;
    this.bridge = null;
    this.transition = null;
    this.transitionCandidates = Object.freeze([]);
    this.lastTick = startTick;
    this.entryFoot = "left";
    this.direction = "neutral";
    this.mirror = false;
    this.pendingContacts = [];
    this.emittedContactIds = new Set();
    this.serial = 0;
    this.lastResponse = null;
    this.bufferedRequest = null;
    this.bufferAge = 0;
    this.world = {
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      facing: 0,
      angularVelocity: 0,
      distance: 0,
      directionChanges: 0,
      lastTravelAngle: null,
    };
    this.facingStepStart = 0;
    this.facingStepSeconds = DEFAULT_DT;
    this.upper = {
      coordinated: Object.freeze({ x: 0, y: -0.18 }),
      left: Object.freeze({ x: 0, y: -0.18 }),
      right: Object.freeze({ x: 0, y: -0.18 }),
      body: Object.freeze({ x: 0, y: 0 }),
      leftOverride: false,
      rightOverride: false,
      bodyActive: false,
      handAccent: "",
      handAccentTime: 0,
      inputDistance: 0,
      intentionalSamples: 0,
      previousInput: { x: 0, y: -0.18 },
    };
    this.weight = {
      left: 0.16,
      right: 0.84,
      targetLeft: 0.16,
    };
    this.feet = {
      left: footState("left"),
      right: footState("right"),
    };
    this.activeFamily = "groove";
    this.lastModifierChord = null;
    this.jump = {
      state: "grounded",
      chargeSeconds: 0,
      launchedAtTick: 0,
      elapsedSeconds: 0,
      airSeconds: 0,
      height: 0,
      maxHeight: 0,
      progress: 0,
      variation: "",
      turnDirection: 0,
      landingQuality: 1,
      landingAge: 0,
      actionId: 0,
    };
    this.metrics = {
      jumps: 0,
      cleanLandings: 0,
      recoveries: 0,
      transitionCount: 0,
      transitionScoreTotal: 0,
      armInputDistance: 0,
      maxFootDriftMeters: 0,
    };
    this.expression = Object.freeze({
      id: "cold",
      intensity: 0.28,
      quality: 0,
    });
  }

  request(moveId, {
    tick,
    direction = "neutral",
    entryFoot = this.base.freeFoot,
    inputTimestamp = null,
    simulationReceiptTimestamp = null,
    phrasePhase = 0,
    contextualFootLayer = false,
  } = {}) {
    const requestedMove = getFootwork(moveId);
    const requestTick = Number(tick) || 0;
    if (!requestedMove) return rejected("unknown-move", `Unknown movement ${moveId}.`);
    if (!requestedMove.styles.includes(this.style)) {
      return rejected("style-unavailable", `${requestedMove.displayName} is not in the ${this.style} profile.`);
    }
    if (this.jump.state === "airborne" && !requestedMove.landingEligibility) {
      this.bufferedRequest = {
        moveId,
        direction,
        entryFoot,
        inputTimestamp,
        simulationReceiptTimestamp,
        phrasePhase,
      };
      this.bufferAge = 0;
      return accepted({
        status: "buffered-for-landing",
        request: this.makeRequest(requestedMove, requestTick, direction, entryFoot, {
          inputTimestamp,
          simulationReceiptTimestamp,
        }),
        visibleActionStarted: false,
        queued: true,
      });
    }

    const foot = entryFoot === "right" ? "right" : "left";
    const fromId = this.action?.move.id && this.action.move.id !== "recovery"
      ? this.action.move.id
      : this.lastMoveId;
    const phase = this.actionPhase(requestTick);
    const currentState = {
      phase,
      rootVelocity: { x: this.world.vx, z: this.world.vz },
      facing: this.world.facing,
      angularVelocity: this.world.angularVelocity,
      supportingFoot: this.supportingFoot(),
      centerOfMassOffset: this.centerOfMassOffset(),
      bodyLevel: this.jump.state === "compression" ? "low" : "mid",
    };
    let move = requestedMove;
    let candidates = this.graph.rankCandidates({
      fromId,
      candidates: [move.id],
      entryFoot: foot,
      direction,
      phrasePhase,
      currentState,
    });
    if (!candidates.length && contextualFootLayer) {
      candidates = this.graph.rankCandidates({
        fromId,
        entryFoot: foot,
        direction: "neutral",
        phrasePhase,
        currentState,
      });
      if (candidates.length) move = candidates[0].move;
    }
    this.transitionCandidates = Object.freeze(candidates.slice(0, 6));
    if (!candidates.length) {
      return this.beginRecovery(requestedMove, {
        tick: requestTick,
        direction,
        entryFoot: foot,
        inputTimestamp,
        simulationReceiptTimestamp,
      });
    }

    const best = candidates[0];
    const interrupted = Boolean(this.action);
    const request = this.makeRequest(move, requestTick, direction, best.entryFoot, {
      inputTimestamp,
      simulationReceiptTimestamp,
      entryPhase: best.entryPhase,
      exitFoot: best.exitFoot,
    });
    request.startTick = requestTick - best.entryPhase * move.durationTicks;
    request.transition = best;
    this.action = request;
    this.current = request;
    this.lastMoveId = move.id;
    this.transition = Object.freeze({
      id: best.transitionRecipe,
      clip: best.transitionClip,
      startTick: requestTick,
      durationTicks: best.transitionTicks,
      score: best.score,
      scoreParts: best.scoreParts,
      plantedFoot: this.supportingFoot(),
      rootWarpLimitMeters: best.rootWarpLimitMeters,
      resolved: true,
    });
    this.bridge = this.transition;
    this.metrics.transitionCount += 1;
    this.metrics.transitionScoreTotal += best.score;
    this.phrase = Object.freeze({
      moveId: move.id,
      direction,
      requestedTick: requestTick,
      actionId: request.id,
    });
    this.entryFoot = best.entryFoot;
    this.direction = direction;
    this.mirror = false;
    this.lastResponse = Object.freeze({
      actionId: request.id,
      moveId: move.id,
      inputTimestamp: request.inputTimestamp,
      simulationReceiptTimestamp: request.simulationReceiptTimestamp,
      startTick: requestTick,
      entryPhase: best.entryPhase,
      transitionRecipe: best.transitionRecipe,
      transitionScore: best.score,
    });
    return accepted({
      status: interrupted ? "retargeted" : "started",
      request,
      visibleActionStarted: true,
      queued: false,
      transition: this.transition,
      contextualFallback: move.id === requestedMove.id ? "" : move.id,
    });
  }

  anticipateFoot({ foot = "left", tick = this.lastTick, modifiers = {}, sequence = 0 } = {}) {
    const side = foot === "right" ? "right" : "left";
    const state = this.feet[side];
    state.anticipation = Object.freeze({
      sequence,
      tick: Number(tick) || 0,
      modifiers: Object.freeze({
        grounded: Boolean(modifiers.grounded),
        committed: Boolean(modifiers.committed),
      }),
    });
    state.phase = Math.max(state.phase, 0.035);
    state.stage = "anticipation";
    return state.anticipation;
  }

  requestFootGesture(intent, {
    tick = this.lastTick,
    direction = "neutral",
    phrasePhase = 0,
  } = {}) {
    const requestTick = Number(tick) || 0;
    const support = this.supportingFoot();
    const gesture = resolveFootGesture(intent, {
      style: this.style,
      supportingFoot: support,
    });
    if (!gesture.ok) return gesture;
    const transitionRequest = this.request(gesture.moveId, {
      tick: requestTick,
      direction,
      entryFoot: gesture.foot,
      inputTimestamp: intent.rawTimeStamp,
      simulationReceiptTimestamp: now(),
      phrasePhase,
      contextualFootLayer: true,
    });
    if (!transitionRequest.ok) return transitionRequest;
    transitionRequest.request.contactSource = "foot-layer";
    const layer = {
      id: transitionRequest.request.id,
      gesture,
      intent,
      startTick: requestTick + gesture.weightTransferTicks,
      requestedTick: requestTick,
      contactCursor: 0,
      contacts: gesture.contacts,
      phase: 0,
      stage: gesture.weightTransferTicks ? "weight-transfer" : "attack",
      transition: transitionRequest.transition,
      validated: transitionRequest.transition?.resolved === true,
      direction,
      appliedFacingRadians: 0,
    };
    const foot = this.feet[gesture.foot];
    if (foot.active && foot.active.phase < 0.58) {
      foot.queue.push(layer);
      if (foot.queue.length > 16) foot.queue.shift();
      foot.stage = "buffered-double";
    } else {
      foot.active = layer;
      foot.stage = layer.stage;
      foot.phase = 0;
    }
    foot.anticipation = null;
    foot.articulation = gesture.contacts[0]?.articulation ?? "flat";
    this.activeFamily = gesture.family;
    this.lastModifierChord = Object.freeze({
      family: gesture.family,
      foot: gesture.foot,
      variant: gesture.variant,
      grounded: Boolean(intent.modifiers?.grounded),
      committed: Boolean(intent.modifiers?.committed),
      sourceCodes: intent.sourceCodes,
    });
    if (gesture.weightTransferTicks) {
      this.weight.targetLeft = gesture.foot === "left" ? 0.14 : 0.86;
    }
    return Object.freeze({
      ...transitionRequest,
      status: foot.active === layer ? "foot-layer-started" : "foot-layer-buffered",
      gesture,
      footLayer: layer,
    });
  }

  applyPerformanceInput(dt = DEFAULT_DT, input = {}, tick = this.lastTick) {
    const safeDt = Math.max(0, Number(dt) || 0);
    this.updateTravel(safeDt, input);
    this.updateUpperBody(safeDt, input);
    this.updateJump(safeDt, input, Number(tick) || 0);
    this.updateWeight(safeDt);
  }

  setPerformanceState(value = {}) {
    this.expression = Object.freeze({
      id: String(value.id ?? "cold"),
      intensity: clamp(Number(value.intensity) || 0.28, 0.2, 1),
      quality: clamp(Number(value.quality) || 0, 0, 1),
    });
  }

  update(tick, { dt = DEFAULT_DT, input = null } = {}) {
    const currentTick = Number(tick) || 0;
    const safeDt = Math.max(0, Number(dt) || 0);
    this.facingStepStart = this.world.facing;
    this.facingStepSeconds = safeDt || DEFAULT_DT;
    if (input) this.applyPerformanceInput(dt, input, currentTick);
    if (currentTick < this.lastTick) {
      this.lastTick = currentTick;
      this.pendingContacts.length = 0;
      return;
    }
    if (this.action) {
      if (this.action.contactSource !== "foot-layer") this.collectContacts(this.lastTick, currentTick);
      const endTick = this.action.startTick + this.action.move.durationTicks;
      if (currentTick >= endTick && this.jump.state === "grounded") this.completeAction(endTick);
    }
    this.updateFootLayers(this.lastTick, currentTick);
    this.world.angularVelocity = signedAngle(this.facingStepStart, this.world.facing)
      / this.facingStepSeconds;
    if (this.transition && currentTick >= this.transition.startTick + this.transition.durationTicks) {
      this.transition = null;
      this.bridge = null;
    }
    if (this.bufferedRequest) {
      this.bufferAge += Math.max(0, Number(dt) || 0);
      if (this.bufferAge > REQUEST_BUFFER_SECONDS) {
        this.bufferedRequest = null;
        this.bufferAge = 0;
      } else if (this.jump.state === "landing" || this.jump.state === "grounded") {
        const buffered = this.bufferedRequest;
        this.bufferedRequest = null;
        this.bufferAge = 0;
        this.request(buffered.moveId, { ...buffered, tick: currentTick });
      }
    }
    this.lastTick = currentTick;
  }

  completeAction(endTick) {
    if (!this.action) return;
    this.base = {
      clip: "groove",
      startTick: endTick,
      supportingFoot: this.action.exitFoot,
      freeFoot: opposite(this.action.exitFoot),
    };
    this.entryFoot = this.base.freeFoot;
    this.action = null;
    this.current = null;
  }

  consumeContacts(callback) {
    while (this.pendingContacts.length) callback(this.pendingContacts.shift());
  }

  collectContacts(previousTick, currentTick) {
    if (!this.action || this.action.move.id === "recovery") return;
    const contacts = resolvedContacts(this.action.move, this.action.entryFoot);
    for (let index = 0; index < contacts.length; index += 1) {
      const contact = contacts[index];
      const absoluteTick = this.action.startTick + contact.tick;
      if (index === 0) continue;
      if (absoluteTick <= previousTick + 1e-8 || absoluteTick > currentTick + 1e-8) continue;
      const contactId = `${this.action.id}:${index}:${contact.tick}`;
      if (this.emittedContactIds.has(contactId)) continue;
      this.emittedContactIds.add(contactId);
      this.pendingContacts.push(Object.freeze({
        ...contact,
        contactId,
        actionId: this.action.id,
        tick: absoluteTick,
        moveId: this.action.move.id,
        style: this.style,
        requested: false,
        worldPosition: Object.freeze({ x: this.world.x, z: this.world.z }),
      }));
    }
  }

  getSnapshot(tick = this.lastTick) {
    const currentTick = Number(tick) || 0;
    const transitionProgress = this.transition
      ? clamp((currentTick - this.transition.startTick) / this.transition.durationTicks, 0, 1)
      : 1;
    const lower = this.lowerSnapshot(currentTick);
    const jumpProfile = FROLIC_JUMP_PROFILES[this.style];
    const jumpActive = this.jump.state !== "grounded";
    const presentationClip = jumpActive ? jumpProfile.clip : lower.presentationClip;
    const presentationPhase = jumpActive ? this.jumpPresentationPhase() : lower.presentationPhase;
    const supportingFoot = this.supportingFoot();
    const armSafety = this.jump.state === "airborne" ? 0.58 : this.jump.state === "landing" ? 0.72 : 1;
    const forwardVelocity = this.world.vx * Math.sin(this.world.facing)
      + this.world.vz * Math.cos(this.world.facing);
    const lateralVelocity = this.world.vx * Math.cos(this.world.facing)
      - this.world.vz * Math.sin(this.world.facing);
    const travelSpeed = STYLE_TRAVEL[this.style].speed;
    const bodyLean = Object.freeze({
      forward: clamp(forwardVelocity / travelSpeed, -1, 1),
      lateral: clamp(lateralVelocity / travelSpeed, -1, 1),
      turn: clamp(this.world.angularVelocity / 4, -1, 1),
    });
    const feet = Object.freeze({
      left: footSnapshot(this.feet.left, this.jump.state, supportingFoot),
      right: footSnapshot(this.feet.right, this.jump.state, supportingFoot),
    });
    const weightDistribution = Object.freeze({
      left: this.weight.left,
      right: this.weight.right,
    });
    const bodyDynamics = deriveBodyDynamics({
      tick: currentTick,
      style: this.style,
      feet,
      weightDistribution,
      jump: this.jump,
      bodyLean,
      angularVelocity: this.world.angularVelocity,
      expression: this.expression,
    });
    return freezeSnapshot({
      ...lower,
      presentationClip,
      presentationPhase,
      phase: presentationPhase,
      supportingFoot,
      rootX: this.world.x * 14,
      worldPosition: Object.freeze({ x: this.world.x, y: this.jump.height, z: this.world.z }),
      rootVelocity: Object.freeze({ x: this.world.vx, y: 0, z: this.world.vz }),
      facing: this.world.facing,
      angularVelocity: this.world.angularVelocity,
      bodyLean,
      bodyDynamics,
      performanceState: this.expression,
      centerOfMass: Object.freeze({
        x: this.world.x + this.centerOfMassOffset(),
        y: 2.7 + this.jump.height + bodyDynamics.pelvisVerticalMeters,
        z: this.world.z,
      }),
      upperBody: Object.freeze({
        coordinated: this.upper.coordinated,
        left: this.upper.left,
        right: this.upper.right,
        body: this.upper.body,
        leftOverride: this.upper.leftOverride,
        rightOverride: this.upper.rightOverride,
        bodyActive: this.upper.bodyActive,
        handAccent: this.upper.handAccent,
        handAccentWeight: clamp(this.upper.handAccentTime / 0.28, 0, 1),
        safetyWeight: armSafety,
      }),
      jump: Object.freeze({
        ...this.jump,
        profileId: jumpProfile.id,
        displayName: jumpProfile.displayName,
        chargeCapSeconds: jumpProfile.chargeCapSeconds,
      }),
      layers: Object.freeze({
        locomotion: jumpActive ? 0.18 : 1,
        footwork: this.action && !jumpActive ? 1 : 0,
        aerial: jumpActive ? 1 : 0,
        arms: armSafety,
        leftArm: this.upper.leftOverride ? armSafety : 0,
        rightArm: this.upper.rightOverride ? armSafety : 0,
        bodyLine: this.upper.bodyActive ? armSafety : 0,
        counterbalance: jumpActive ? 0.5 : 1,
        headGaze: 1,
        costume: 1,
        contactIK: this.jump.state === "airborne" ? 0 : 1,
        inertialRecovery: this.transition ? 1 - transitionProgress : 0,
      }),
      transition: this.transition,
      transitionCandidates: this.transitionCandidates,
      queuedMove: this.bufferedRequest?.moveId ?? "",
      transitionClip: this.transition?.clip ?? "",
      contactIK: Object.freeze({
        enabled: this.jump.state !== "airborne",
        lockedFoot: supportingFoot,
        maxDriftMeters: this.metrics.maxFootDriftMeters,
        toleranceMeters: 0.01,
      }),
      performance: Object.freeze({
        travelDistance: this.world.distance,
        directionChanges: this.world.directionChanges,
        armInputDistance: this.upper.inputDistance,
        jumps: this.metrics.jumps,
        cleanLandings: this.metrics.cleanLandings,
        recoveries: this.metrics.recoveries,
        transitionCount: this.metrics.transitionCount,
        averageTransitionScore: this.metrics.transitionCount
          ? this.metrics.transitionScoreTotal / this.metrics.transitionCount
          : 0,
      }),
      footLayers: Object.freeze([feet.left, feet.right]),
      feet,
      weightDistribution,
      activeMovementFamily: this.activeFamily,
      modifierChord: this.lastModifierChord,
    });
  }

  lowerSnapshot(currentTick) {
    if (!this.action || this.action.contactSource === "foot-layer") {
      const travelling = Math.hypot(this.world.vx, this.world.vz) > 0.08;
      const phase = travelling
        ? positiveModulo(this.world.distance / 0.82, 1)
        : positiveModulo(currentTick - this.base.startTick, GROOVE_TICKS) / GROOVE_TICKS;
      return {
        moveId: this.action?.move.id ?? (travelling ? "walkingStep" : "groove"),
        moveName: this.action?.move.displayName ?? (travelling ? "Travelling Groove" : "Musical Groove"),
        family: this.action?.move.family ?? (travelling ? "foundation" : "groove"),
        presentationClip: travelling ? "walkingStep" : "groove",
        presentationPhase: phase,
        entryFoot: this.base.freeFoot,
        exitFoot: this.base.supportingFoot,
        direction: directionSign(this.direction),
        travelDirection: this.direction,
        actionId: this.action?.id ?? 0,
        actionStartedAtTick: this.action?.requestedTick ?? null,
        response: this.lastResponse,
      };
    }
    const move = this.action.move;
    const phase = this.actionPhase(currentTick);
    return {
      moveId: move.id,
      moveName: move.displayName,
      family: move.family,
      presentationClip: move.id,
      presentationPhase: phase,
      entryFoot: this.action.entryFoot,
      exitFoot: this.action.exitFoot,
      direction: directionSign(this.direction),
      travelDirection: this.direction,
      actionId: this.action.id,
      actionStartedAtTick: this.action.requestedTick,
      response: this.lastResponse,
    };
  }

  actionPhase(tick) {
    if (!this.action) return 0;
    return clamp((tick - this.action.startTick) / this.action.move.durationTicks, 0, 1);
  }

  supportingFoot() {
    if (this.jump.state === "airborne") return "none";
    if (this.action?.move.id === "recovery") return this.action.entryFoot === "right" ? "left" : "right";
    if (this.feet.left.active || this.feet.right.active) {
      return this.weight.left >= 0.5 ? "left" : "right";
    }
    if (this.action) {
      const elapsed = Math.max(0, this.lastTick - this.action.startTick);
      const contact = resolvedContacts(this.action.move, this.action.entryFoot)
        .filter((value) => value.tick <= elapsed && value.foot !== "both")
        .at(-1);
      if (contact?.foot) return contact.foot;
      return opposite(this.action.entryFoot);
    }
    if (Math.hypot(this.world.vx, this.world.vz) > 0.08) {
      return positiveModulo(this.world.distance / 0.82, 1) < 0.5 ? "left" : "right";
    }
    return this.base.supportingFoot;
  }

  centerOfMassOffset() {
    const speed = Math.hypot(this.world.vx, this.world.vz);
    const travelBias = clamp(speed / 2.2, 0, 1) * 0.12;
    const supportBias = (this.weight.right - this.weight.left) * -0.16;
    return clamp(
      supportBias + this.upper.body.x * 0.08 + Math.sin(this.world.facing) * travelBias,
      -0.22,
      0.22,
    );
  }

  updateTravel(dt, input) {
    if (!(dt > 0)) return;
    const profile = STYLE_TRAVEL[this.style];
    let x = Number(input.travelX ?? input.x) || 0;
    let z = -(Number(input.travelY ?? input.y) || 0);
    const magnitude = Math.hypot(x, z);
    if (magnitude > 1) {
      x /= magnitude;
      z /= magnitude;
    }
    const airScale = this.jump.state === "airborne" ? profile.airControl : 1;
    const groundedScale = input.groundModifier ? 0.72 : input.commitModifier ? 1.08 : 1;
    const targetVx = x * profile.speed * airScale * groundedScale;
    const targetVz = z * profile.speed * airScale * groundedScale;
    this.world.vx = approach(this.world.vx, targetVx, profile.acceleration * dt);
    this.world.vz = approach(this.world.vz, targetVz, profile.acceleration * dt);
    const previousX = this.world.x;
    const previousZ = this.world.z;
    this.world.x = clamp(this.world.x + this.world.vx * dt, BOARD_BOUNDS.minX, BOARD_BOUNDS.maxX);
    this.world.z = clamp(this.world.z + this.world.vz * dt, BOARD_BOUNDS.minZ, BOARD_BOUNDS.maxZ);
    if (this.world.x === BOARD_BOUNDS.minX || this.world.x === BOARD_BOUNDS.maxX) this.world.vx *= 0.2;
    if (this.world.z === BOARD_BOUNDS.minZ || this.world.z === BOARD_BOUNDS.maxZ) this.world.vz *= 0.2;
    this.world.distance += Math.hypot(this.world.x - previousX, this.world.z - previousZ);
    if (Math.hypot(this.world.vx, this.world.vz) > 0.02) {
      const targetFacing = Math.atan2(this.world.vx, this.world.vz);
      const delta = signedAngle(this.world.facing, targetFacing);
      const oldFacing = this.world.facing;
      const easedTurn = delta * (1 - Math.exp(-dt * 9));
      const maximumTurn = MAXIMUM_FACING_SPEED * dt;
      this.world.facing += clamp(easedTurn, -maximumTurn, maximumTurn);
      this.world.angularVelocity = signedAngle(oldFacing, this.world.facing) / dt;
      if (this.world.lastTravelAngle !== null && Math.abs(signedAngle(this.world.lastTravelAngle, targetFacing)) > 0.72) {
        this.world.directionChanges += 1;
      }
      this.world.lastTravelAngle = targetFacing;
    } else {
      this.world.angularVelocity *= Math.exp(-dt * 10);
    }
  }

  updateUpperBody(dt, input) {
    if (this.upper.handAccentTime > 0) {
      this.upper.handAccentTime = Math.max(0, this.upper.handAccentTime - dt);
      if (!this.upper.handAccentTime) this.upper.handAccent = "";
    }
    const styleHeight = { flatfoot: 0.62, buck: 0.82, clog: 1 }[this.style];
    const active = Boolean(input.armActive)
      || Math.hypot(Number(input.armX) || 0, Number(input.armY) || 0) > 0.02;
    const currentTarget = input.leftArmModifier && !input.rightArmModifier
      ? this.upper.left
      : input.rightArmModifier && !input.leftArmModifier
        ? this.upper.right
        : this.upper.coordinated;
    const rawTarget = input.armInputMode !== "rate"
      ? {
          x: clamp(Number(input.armX) || 0, -1, 1),
          y: clamp(Number(input.armY) || 0, -1, styleHeight),
        }
      : {
          x: currentTarget.x,
          y: clamp(currentTarget.y + (Number(input.armY) || 0) * dt * 1.7, -1, styleHeight),
        };
    const target = active ? rawTarget : currentTarget;
    const delta = Math.hypot(target.x - this.upper.previousInput.x, target.y - this.upper.previousInput.y);
    this.upper.inputDistance += delta;
    if (delta > 0.015 && delta < 0.42) this.upper.intentionalSamples += 1;
    this.upper.previousInput = target;
    if (!active) {
      // Persist the selected authored pose. Automatic counterbalance is
      // layered by the renderer and never rewrites the player's target.
    } else if (input.bodyModifier) {
      this.upper.body = smoothPoseVector(this.upper.body, target, dt, 20);
      this.upper.bodyActive = true;
    } else if (input.leftArmModifier && !input.rightArmModifier) {
      this.upper.left = smoothPoseVector(this.upper.left, target, dt, 22);
      this.upper.leftOverride = true;
    } else if (input.rightArmModifier && !input.leftArmModifier) {
      this.upper.right = smoothPoseVector(this.upper.right, target, dt, 22);
      this.upper.rightOverride = true;
    } else {
      this.upper.coordinated = smoothPoseVector(this.upper.coordinated, target, dt, 20);
      this.upper.left = smoothPoseVector(this.upper.left, target, dt, 20);
      this.upper.right = smoothPoseVector(this.upper.right, target, dt, 20);
      this.upper.leftOverride = false;
      this.upper.rightOverride = false;
      this.upper.bodyActive = false;
    }
    if (input.handAccentPressed) {
      this.upper.handAccent = Math.abs(target.y) > 0.62 ? "flourish" : "clap";
      this.upper.handAccentTime = 0.28;
    }
  }

  updateWeight(dt) {
    const rate = 1 - Math.exp(-Math.max(0, dt) * 28);
    this.weight.left += (this.weight.targetLeft - this.weight.left) * rate;
    this.weight.left = clamp(this.weight.left, 0.08, 0.92);
    this.weight.right = 1 - this.weight.left;
  }

  updateFootLayers(previousTick, currentTick) {
    for (const side of ["left", "right"]) {
      const state = this.feet[side];
      let layer = state.active;
      if (!layer) {
        if (state.anticipation) {
          state.phase = clamp(
            (currentTick - state.anticipation.tick) / 16,
            0.035,
            0.22,
          );
          state.stage = "anticipation";
        } else {
          state.phase *= 0.78;
          if (state.phase < 0.002) state.stage = "planted";
        }
        continue;
      }
      if (currentTick < layer.startTick) {
        state.stage = "weight-transfer";
        state.phase = clamp((currentTick - layer.requestedTick) / Math.max(1, layer.startTick - layer.requestedTick), 0, 1) * 0.18;
        continue;
      }
      layer.phase = clamp((currentTick - layer.startTick) / layer.gesture.durationTicks, 0, 1);
      if (layer.gesture.facingChangeRadians) {
        const turnSign = layer.direction === "turn-left"
          ? -1
          : layer.direction === "turn-right"
            ? 1
            : layer.gesture.foot === "left" ? -1 : 1;
        const turnProgress = Math.sin(layer.phase * Math.PI / 2);
        const applied = turnSign * layer.gesture.facingChangeRadians * turnProgress;
        const intendedDelta = applied - layer.appliedFacingRadians;
        const stepSeconds = this.facingStepSeconds;
        const usedDelta = signedAngle(this.facingStepStart, this.world.facing);
        const cappedTotal = clamp(
          usedDelta + intendedDelta,
          -MAXIMUM_FACING_SPEED * stepSeconds,
          MAXIMUM_FACING_SPEED * stepSeconds,
        );
        const appliedDelta = cappedTotal - usedDelta;
        this.world.facing += appliedDelta;
        this.world.angularVelocity = cappedTotal / stepSeconds;
        layer.appliedFacingRadians += appliedDelta;
      }
      state.phase = layer.phase;
      state.stage = layer.phase < 0.24
        ? "attack"
        : layer.phase < 0.72
          ? "contact"
          : "recover";
      while (
        layer.contactCursor < layer.contacts.length
        && layer.contacts[layer.contactCursor].tick <= currentTick - layer.startTick + 1e-7
      ) {
        const contact = layer.contacts[layer.contactCursor];
        const contactTick = layer.startTick + contact.tick;
        if (contactTick > previousTick + 1e-7) {
          this.emitFootLayerContact(layer, contact, contactTick);
        }
        layer.contactCursor += 1;
      }
      if (state.queue.length && layer.phase >= 0.58 && layer.contactCursor > 0) {
        state.active = state.queue.shift();
        state.active.startTick = Math.max(currentTick, state.active.startTick);
        state.phase = 0;
        state.stage = state.active.stage;
        continue;
      }
      if (layer.phase >= 1) {
        state.active = state.queue.shift() ?? null;
        if (state.active) {
          state.active.startTick = Math.max(currentTick, state.active.startTick);
          state.phase = 0;
          state.stage = state.active.stage;
        } else {
          state.stage = "planted";
          state.phase = 0;
          state.contact = "flat";
        }
      }
    }
  }

  emitFootLayerContact(layer, contact, tick) {
    const foot = layer.gesture.foot;
    const state = this.feet[foot];
    state.contact = contact.articulation;
    state.articulation = contact.articulation;
    if (
      ["basic", "drive", "turn"].includes(layer.gesture.family)
      && ["flat", "heel", "chug"].includes(contact.articulation)
    ) {
      this.weight.targetLeft = foot === "left" ? 0.82 : 0.18;
    }
    this.pendingContacts.push(Object.freeze({
      ...contact,
      contactId: `foot:${layer.id}:${contact.index}:${contact.tick}`,
      actionId: layer.id,
      tick,
      moveId: layer.gesture.moveId,
      style: this.style,
      requested: false,
      inputIntent: layer.intent,
      transitionValidated: layer.validated,
      worldPosition: Object.freeze({ x: this.world.x, z: this.world.z }),
    }));
  }

  updateJump(dt, input, tick) {
    const profile = FROLIC_JUMP_PROFILES[this.style];
    if (input.jumpPressed && this.jump.state === "grounded") {
      this.jump.state = "compression";
      this.jump.chargeSeconds = 0;
      this.jump.height = 0;
      this.jump.progress = 0;
      this.jump.variation = "";
      this.jump.actionId = ++this.serial;
    }
    if (this.jump.state === "compression") {
      if (input.jump) this.jump.chargeSeconds = Math.min(profile.chargeCapSeconds, this.jump.chargeSeconds + dt);
      if (
        input.jumpReleased
        || (!input.jump && this.jump.chargeSeconds > 0)
        || this.jump.chargeSeconds >= profile.chargeCapSeconds
      ) this.launchJump(profile, tick, input);
    } else if (this.jump.state === "airborne") {
      this.jump.elapsedSeconds += dt;
      this.jump.progress = clamp(this.jump.elapsedSeconds / this.jump.airSeconds, 0, 1);
      this.jump.height = 4 * this.jump.maxHeight * this.jump.progress * (1 - this.jump.progress);
      if (input.leftFootPressed || input.rightFootPressed || input.actionPressed) {
        this.jump.variation = profile.allowedFollowUps[0];
      }
      if (input.brushPressed || input.articulationPressed || input.stylePressed) {
        this.jump.variation = profile.allowedFollowUps[1];
      }
      if (input.drivePressed || input.turnPressed || input.powerPressed) {
        this.jump.variation = profile.allowedFollowUps[2];
      }
      if (Number(input.turnDirection)) this.jump.turnDirection = Math.sign(input.turnDirection);
      if (this.jump.progress >= 1) this.landJump(profile, tick, input);
    } else if (this.jump.state === "landing") {
      this.jump.landingAge += dt;
      this.jump.height = 0;
      if (this.jump.landingAge >= 0.14) {
        this.jump.state = "grounded";
        this.jump.landingAge = 0;
        this.jump.progress = 0;
      }
    }
  }

  launchJump(profile, tick, input) {
    const charge = clamp(Math.max(0.04, this.jump.chargeSeconds) / profile.chargeCapSeconds, 0, 1);
    const committed = input.commitModifier ? 1 : 0;
    this.jump.maxHeight = lerp(profile.heightMeters[0], profile.heightMeters[1], clamp(charge * 0.82 + committed * 0.18, 0, 1));
    this.jump.airSeconds = lerp(profile.airSeconds[0], profile.airSeconds[1], charge);
    this.jump.elapsedSeconds = 0;
    this.jump.launchedAtTick = tick;
    this.jump.progress = 0;
    this.jump.height = 0.001;
    this.jump.state = "airborne";
    this.jump.turnDirection = Number(input.turnDirection) || 0;
    this.metrics.jumps += 1;
    this.pendingContacts.push(Object.freeze({
      contactId: `jump:${this.jump.actionId}:launch`,
      actionId: this.jump.actionId,
      tick,
      moveId: profile.id,
      style: this.style,
      foot: "both",
      articulation: "launch",
      intensity: 0.42 + charge * 0.32,
      sampleGroup: "softSole",
      requested: true,
      jumpEvent: "launch",
      worldPosition: Object.freeze({ x: this.world.x, z: this.world.z }),
    }));
  }

  landJump(profile, tick, input) {
    const speed = Math.hypot(this.world.vx, this.world.vz);
    const bodyDemand = Math.hypot(this.upper.body.x, this.upper.body.y);
    const turnDemand = Math.abs(this.jump.turnDirection);
    const quality = clamp(1 - speed * 0.08 - bodyDemand * 0.12 - turnDemand * 0.08 + (input.groundModifier ? 0.12 : 0), 0, 1);
    this.jump.state = "landing";
    this.jump.landingQuality = quality;
    this.jump.landingAge = 0;
    this.jump.height = 0;
    if (quality >= 0.72) this.metrics.cleanLandings += 1;
    else this.metrics.recoveries += 1;
    this.pendingContacts.push(Object.freeze({
      contactId: `jump:${this.jump.actionId}:landing`,
      actionId: this.jump.actionId,
      tick,
      moveId: profile.id,
      style: this.style,
      foot: quality >= 0.72 ? "both" : this.base.supportingFoot,
      articulation: quality >= 0.72 ? "landing" : "recovery",
      intensity: clamp(0.54 + this.jump.maxHeight * 0.34, 0, 1),
      sampleGroup: profile.landingContact,
      requested: false,
      jumpEvent: "landing",
      landingQuality: quality,
      contactVelocity: this.jump.maxHeight / Math.max(0.01, this.jump.airSeconds / 2),
      worldPosition: Object.freeze({ x: this.world.x, z: this.world.z }),
    }));
    if (quality < 0.48) {
      this.beginRecovery(getFootwork("walkingStep"), {
        tick,
        direction: "neutral",
        entryFoot: this.base.freeFoot,
        inputTimestamp: null,
        simulationReceiptTimestamp: null,
      });
    }
  }

  jumpPresentationPhase() {
    if (this.jump.state === "compression") {
      const cap = FROLIC_JUMP_PROFILES[this.style].chargeCapSeconds;
      return clamp(this.jump.chargeSeconds / cap, 0, 1) * 0.18;
    }
    if (this.jump.state === "airborne") return 0.18 + this.jump.progress * 0.68;
    if (this.jump.state === "landing") return 0.86 + clamp(this.jump.landingAge / 0.14, 0, 1) * 0.14;
    return 0;
  }

  beginRecovery(requestedMove, {
    tick,
    direction,
    entryFoot,
    inputTimestamp,
    simulationReceiptTimestamp,
  }) {
    const recipe = transitionRecipeFor({
      fromFamily: this.action?.move.family ?? "recovery",
      toFamily: "foundation",
      support: this.supportingFoot(),
      recovery: true,
    });
    const request = this.makeRequest(requestedMove, tick, direction, entryFoot, {
      inputTimestamp,
      simulationReceiptTimestamp,
    });
    const recovery = {
      ...request,
      move: RECOVERY_MOVE,
      requestedMove,
      exitFoot: opposite(entryFoot),
    };
    this.action = recovery;
    this.current = recovery;
    this.lastMoveId = "";
    this.transition = Object.freeze({
      id: recipe.id,
      clip: recipe.clip,
      startTick: tick,
      durationTicks: Math.round(recipe.durationMs * 0.192),
      score: 1,
      scoreParts: Object.freeze({ recovery: 1 }),
      plantedFoot: this.supportingFoot(),
      rootWarpLimitMeters: recipe.rootWarpLimitMeters,
      resolved: true,
      recovery: true,
    });
    this.bridge = this.transition;
    this.metrics.recoveries += 1;
    this.metrics.transitionCount += 1;
    this.metrics.transitionScoreTotal += 1;
    this.lastResponse = Object.freeze({
      actionId: request.id,
      moveId: requestedMove.id,
      inputTimestamp: request.inputTimestamp,
      simulationReceiptTimestamp: request.simulationReceiptTimestamp,
      startTick: tick,
      transitionRecipe: recipe.id,
      recovered: true,
    });
    return accepted({
      status: "recovered",
      request,
      visibleActionStarted: true,
      queued: false,
      transition: this.transition,
    });
  }

  makeRequest(move, tick, direction, entryFoot, {
    inputTimestamp,
    simulationReceiptTimestamp,
    entryPhase = 0,
    exitFoot = null,
  }) {
    const foot = entryFoot === "right" ? "right" : "left";
    return {
      id: ++this.serial,
      move,
      requestedTick: tick,
      startTick: tick,
      direction,
      entryFoot: foot,
      exitFoot: exitFoot ?? resolveExit(move.exitRule, foot),
      entryPhase,
      inputTimestamp: finiteOrNull(inputTimestamp),
      simulationReceiptTimestamp: finiteOrNull(simulationReceiptTimestamp),
    };
  }
}

function freezeSnapshot(value) {
  return Object.freeze({
    ...value,
    mirror: false,
    microResponse: 0,
    microFoot: "both",
    contacts: Object.freeze({ contacts: [], error: 0 }),
    stamina: 100,
    balance: Object.freeze({
      offset: value.centerOfMass?.x ?? 0,
      wobble: value.jump?.landingQuality < 0.48 ? 0.4 : 0,
      failed: false,
    }),
  });
}

function resolveExit(rule, entryFoot) {
  return rule === "opposite" ? opposite(entryFoot) : entryFoot;
}

function opposite(foot) {
  return foot === "right" ? "left" : "right";
}

function directionSign(direction) {
  return direction === "left" || direction === "turn-left" ? -1 : 1;
}

function approach(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

function signedAngle(from, to) {
  let value = (to - from) % (Math.PI * 2);
  if (value > Math.PI) value -= Math.PI * 2;
  if (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function deriveBodyDynamics({
  tick = 0,
  style = "flatfoot",
  feet = {},
  weightDistribution = {},
  jump = {},
  bodyLean = {},
  angularVelocity = 0,
  expression = {},
} = {}) {
  const intensity = clamp(Number(expression.intensity) || 0.28, 0.2, 1);
  const styleScale = { flatfoot: 0.72, buck: 0.88, clog: 1 }[normalizeFrolicStyle(style)];
  const leftResponse = footBodyResponse(feet.left);
  const rightResponse = footBodyResponse(feet.right);
  const contactCompression = Math.max(leftResponse.compression, rightResponse.compression);
  const liftDifference = rightResponse.lift - leftResponse.lift;
  const supportBias = clamp(
    (Number(weightDistribution.right) || 0.5) - (Number(weightDistribution.left) || 0.5),
    -1,
    1,
  );
  const musicalPulse = Math.sin((Number(tick) || 0) / (GROOVE_TICKS / 2) * Math.PI);
  const jumpCompression = jump.state === "compression"
    ? clamp((Number(jump.chargeSeconds) || 0) / 0.32, 0, 1)
    : 0;
  const landingCompression = jump.state === "landing"
    ? clamp(1 - (Number(jump.landingAge) || 0) / 0.14, 0, 1)
    : 0;
  const pelvisVerticalMeters = clamp(
    musicalPulse * 0.006 * intensity
    - contactCompression * 0.032 * styleScale
    - jumpCompression * 0.062
    - landingCompression * 0.072,
    -0.09,
    0.012,
  );
  const turn = clamp(Number(angularVelocity) || 0, -4, 4);
  const looseness = intensity * styleScale;
  const shoulderDelay = clamp(
    -(Number(bodyLean.turn) || 0) * 5.2 + liftDifference * 3.4,
    -7,
    7,
  ) * looseness;
  const headNod = clamp(
    -musicalPulse * (1.2 + intensity * 2.2)
    + landingCompression * 4.2,
    -5,
    7,
  );
  const supportKnee = 2.4 + contactCompression * 8.6 + landingCompression * 12;
  const freeKnee = 1.4 + Math.max(leftResponse.lift, rightResponse.lift) * 7.2;
  return Object.freeze({
    pelvisVerticalMeters: round4(pelvisVerticalMeters),
    pelvisEulerDegrees: Object.freeze([
      round4((Number(bodyLean.forward) || 0) * -1.6 - contactCompression * 1.1),
      round4(turn * -0.86 * looseness),
      round4(supportBias * 3.4 + liftDifference * 2.2),
    ]),
    chestEulerDegrees: Object.freeze([
      round4(contactCompression * 1.8 + headNod * -0.18),
      round4(turn * 1.14 * looseness + shoulderDelay),
      round4(supportBias * -3.1 - liftDifference * 1.8),
    ]),
    headEulerDegrees: Object.freeze([
      round4(headNod),
      round4(turn * -0.42 * looseness),
      round4(supportBias * 1.2),
    ]),
    leftLeg: Object.freeze({
      kneeCompressionDegrees: round4((supportBias < 0 ? supportKnee : freeKnee) * styleScale),
      hipCounterDegrees: round4((turn * -0.7 - liftDifference * 2.4) * looseness),
    }),
    rightLeg: Object.freeze({
      kneeCompressionDegrees: round4((supportBias >= 0 ? supportKnee : freeKnee) * styleScale),
      hipCounterDegrees: round4((turn * 0.7 + liftDifference * 2.4) * looseness),
    }),
    shoulderDelayDegrees: round4(shoulderDelay),
    wristLoosenessDegrees: Object.freeze({
      left: round4((musicalPulse * 2.8 - turn * 0.6) * looseness),
      right: round4((-musicalPulse * 2.4 + turn * 0.6) * looseness),
    }),
    contactCompression: round4(contactCompression),
    landingCompression: round4(landingCompression),
    expressionIntensity: round4(intensity),
  });
}

function footBodyResponse(foot = {}) {
  const phase = clamp(Number(foot.phase) || 0, 0, 1);
  const stage = String(foot.stage ?? "planted");
  if (stage === "anticipation" || stage === "weight-transfer") {
    return { lift: clamp(phase * 2.8, 0, 0.55), compression: 0 };
  }
  if (stage === "attack") {
    return { lift: Math.sin(phase / 0.24 * Math.PI) * 0.82, compression: 0 };
  }
  if (stage === "contact") {
    return {
      lift: clamp((0.48 - phase) * 1.4, 0, 0.24),
      compression: Math.sin(clamp((phase - 0.24) / 0.48, 0, 1) * Math.PI),
    };
  }
  if (stage === "recover") {
    return { lift: clamp((1 - phase) * 0.34, 0, 0.2), compression: (1 - phase) * 0.28 };
  }
  return { lift: 0, compression: 0 };
}

function round4(value) {
  return Math.round((Number(value) || 0) * 10_000) / 10_000;
}

function footState(side) {
  return {
    side,
    stage: "planted",
    phase: 0,
    articulation: "flat",
    contact: "flat",
    anticipation: null,
    active: null,
    queue: [],
  };
}

function footSnapshot(state, jumpState = "grounded", supportingFoot = "none") {
  const layer = state.active;
  return Object.freeze({
    side: state.side,
    stage: state.stage,
    phase: state.phase,
    articulation: state.articulation,
    contact: state.contact,
    clipId: layer?.gesture.clipId ?? "",
    moveId: layer?.gesture.moveId ?? "",
    family: layer?.gesture.family ?? "",
    variant: layer?.gesture.variant ?? "",
    actionId: layer?.id ?? 0,
    queueDepth: state.queue.length,
    validated: layer?.validated ?? false,
    anticipation: state.anticipation,
    motionState: footMotionState(state, layer, jumpState),
    weightBearing: jumpState !== "airborne" && supportingFoot === state.side,
  });
}

function footMotionState(state, layer, jumpState) {
  if (jumpState === "airborne") return "airborne";
  if (state.stage === "planted") return "planted";
  if (state.stage === "recover") return "recovering";
  if (state.stage === "anticipation" || state.stage === "weight-transfer") return "lifting";
  const articulation = String(state.articulation ?? state.contact ?? "");
  if (state.stage === "contact") {
    if (articulation === "brush") return "brushing";
    if (articulation === "heel") return "heel-contact";
    if (["toe", "ball"].includes(articulation)) return "toe-contact";
    if (["drag", "slide"].includes(articulation)) return "sliding";
    return "full-foot-tap";
  }
  if (layer?.gesture?.moveId === "crossStep") return "crossing";
  return "swinging";
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function lerp(left, right, amount) {
  return left + (right - left) * amount;
}

function accepted(detail) {
  return Object.freeze({ ok: true, ...detail });
}

function rejected(reason, message) {
  return Object.freeze({ ok: false, reason, message });
}
