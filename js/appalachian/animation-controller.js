import {
  getFootwork,
  normalizeFrolicStyle,
  resolvedContacts,
} from "./footwork-catalog.js";
import {
  FootworkTransitionGraph,
} from "./transition-graph.js";

export class AppalachianAnimationController {
  constructor({ style = "flatfoot", graph = null } = {}) {
    this.style = normalizeFrolicStyle(style);
    this.graph = graph ?? new FootworkTransitionGraph({ style: this.style });
    this.reset(0);
  }

  reset(tick = 0) {
    this.current = null;
    this.queued = null;
    this.bridge = null;
    this.lastTick = Number(tick) || 0;
    this.entryFoot = "left";
    this.direction = "neutral";
    this.mirror = false;
    this.contactCursor = 0;
    this.pendingContacts = [];
    this.serial = 0;
  }

  request(moveId, {
    tick,
    direction = "neutral",
  } = {}) {
    const move = getFootwork(moveId);
    const requestTick = Number(tick) || 0;
    if (!move) return rejected("unknown-move", `Unknown movement ${moveId}.`);
    if (!move.styles.includes(this.style)) {
      return rejected("style-unavailable", `${move.displayName} is not in the ${this.style} profile.`);
    }
    if (this.queued) return rejected("queue-full", "Finish the queued weight transfer first.");
    const fromId = this.current?.move.id ?? null;
    const landingTick = Math.ceil(requestTick / 24) * 24;
    const transition = this.graph.resolve({
      fromId,
      toId: move.id,
      entryFoot: this.current?.entryFoot ?? this.entryFoot,
      direction,
      landingTick,
    });
    if (!transition.ok) return transition;
    const request = Object.freeze({
      id: ++this.serial,
      move,
      requestedTick: requestTick,
      landingTick,
      direction,
      entryFoot: transition.entryFoot,
      exitFoot: transition.exitFoot,
      transitionClip: transition.transitionClip,
      transitionTicks: transition.transitionTicks,
    });
    if (!this.current) {
      this.startMove(request, requestTick);
      return accepted({ status: "started", request });
    }
    this.queued = request;
    return accepted({ status: "queued", request });
  }

  update(tick) {
    const currentTick = Number(tick) || 0;
    if (currentTick < this.lastTick) {
      this.lastTick = currentTick;
      this.pendingContacts.length = 0;
      return;
    }
    if (!this.bridge && this.current) this.collectContacts(this.lastTick, currentTick);
    for (let guard = 0; guard < 4; guard += 1) {
      if (this.bridge) {
        const endTick = this.bridge.startTick + this.bridge.durationTicks;
        if (currentTick < endTick) break;
        const request = this.bridge.request;
        this.bridge = null;
        this.startMove(request, endTick);
        continue;
      }
      if (this.current && this.queued) {
        const endTick = this.current.startTick + this.current.move.durationTicks;
        if (currentTick < endTick) break;
        const request = this.queued;
        this.queued = null;
        this.startBridge(request, endTick);
        continue;
      }
      break;
    }
    this.lastTick = currentTick;
  }

  consumeContacts(callback) {
    while (this.pendingContacts.length) callback(this.pendingContacts.shift());
  }

  startMove(request, startTick) {
    this.current = {
      ...request,
      startTick,
      cycle: 0,
    };
    this.entryFoot = request.entryFoot;
    this.direction = request.direction;
    this.mirror = request.entryFoot === "right";
    this.contactCursor = 0;
  }

  startBridge(request, startTick) {
    if (!(request.transitionTicks > 0)) {
      this.startMove(request, startTick);
      return;
    }
    this.bridgeEndTick = startTick + request.transitionTicks;
    this.bridge = {
      clip: request.transitionClip,
      startTick,
      durationTicks: request.transitionTicks,
      request,
    };
  }

  collectContacts(previousTick, currentTick) {
    if (!this.current) return;
    const move = this.current.move;
    const contacts = resolvedContacts(move, this.current.entryFoot);
    const start = this.current.startTick;
    const duration = move.durationTicks;
    const firstCycle = Math.max(0, Math.floor((previousTick - start) / duration));
    const lastCycle = Math.max(0, Math.floor((currentTick - start) / duration));
    // Visual clips may loop while the player breathes, but percussion contacts
    // are emitted only for the requested cycle.
    if (firstCycle > 0) return;
    for (const contact of contacts) {
      const absoluteTick = start + contact.tick;
      if (absoluteTick <= previousTick + 1e-8 || absoluteTick > currentTick + 1e-8) continue;
      this.pendingContacts.push(Object.freeze({
        ...contact,
        tick: absoluteTick,
        moveId: move.id,
        style: this.style,
        requested: false,
      }));
    }
    if (lastCycle > 0) this.contactCursor = contacts.length;
  }

  getSnapshot(tick = this.lastTick, microResponse = 0, microFoot = "both") {
    const currentTick = Number(tick) || 0;
    if (this.bridge) {
      const phase = clamp01((currentTick - this.bridge.startTick) / this.bridge.durationTicks);
      return Object.freeze({
        moveId: this.current?.move.id ?? "",
        moveName: this.current?.move.displayName ?? "",
        family: "transition",
        presentationClip: this.bridge.clip,
        presentationPhase: phase,
        phase,
        entryFoot: this.current?.entryFoot ?? this.entryFoot,
        exitFoot: this.current?.exitFoot ?? this.entryFoot,
        supportingFoot: this.current?.exitFoot ?? this.entryFoot,
        queuedMove: this.bridge.request.move.id,
        transitionClip: this.bridge.clip,
        direction: directionSign(this.direction),
        travelDirection: this.direction,
        mirror: this.mirror,
        rootX: 0,
        microResponse,
        microFoot,
        contacts: Object.freeze({ contacts: [], error: 0 }),
        stamina: 100,
        balance: Object.freeze({ offset: 0, wobble: 0, failed: false }),
      });
    }
    const move = this.current?.move ?? getFootwork("walkingStep");
    const startTick = this.current?.startTick ?? currentTick;
    const elapsed = Math.max(0, currentTick - startTick);
    const phase = move.durationTicks ? (elapsed % move.durationTicks) / move.durationTicks : 0;
    return Object.freeze({
      moveId: move.id,
      moveName: move.displayName,
      family: move.family,
      presentationClip: move.id,
      presentationPhase: phase,
      phase,
      entryFoot: this.current?.entryFoot ?? this.entryFoot,
      exitFoot: this.current?.exitFoot ?? this.entryFoot,
      supportingFoot: this.current?.exitFoot ?? this.entryFoot,
      queuedMove: this.queued?.move.id ?? "",
      transitionClip: this.queued?.transitionClip ?? "",
      direction: directionSign(this.direction),
      travelDirection: this.direction,
      mirror: this.mirror,
      rootX: rootOffset(move, phase, this.direction),
      microResponse,
      microFoot,
      contacts: Object.freeze({ contacts: [], error: 0 }),
      stamina: 100,
      balance: Object.freeze({ offset: 0, wobble: 0, failed: false }),
    });
  }
}

function rootOffset(move, phase, direction) {
  const motion = move?.rootMotion ?? {};
  if (direction === "left") return -Math.abs(motion.lateral ?? 0) * phase;
  if (direction === "right") return Math.abs(motion.lateral ?? 0) * phase;
  return 0;
}

function directionSign(direction) {
  return direction === "left" || direction === "turn-left" ? -1 : 1;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function accepted(detail) {
  return Object.freeze({ ok: true, ...detail });
}

function rejected(reason, message) {
  return Object.freeze({ ok: false, reason, message });
}
