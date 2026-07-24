import {
  getFootwork,
  normalizeFrolicStyle,
  resolvedContacts,
} from "./footwork-catalog.js";

const GROOVE_TICKS = 96;

/**
 * Interruptible three-layer Flatfoot controller.
 *
 * Base: a continuous groove with a known support/free-foot state.
 * Action: one atomic, immediately retargetable movement.
 * Phrase: the most recent intention, used only for follow-through context.
 *
 * There is deliberately no movement queue and no transition bridge on the
 * player-input path.
 */
export class AppalachianAnimationController {
  constructor({ style = "flatfoot" } = {}) {
    this.style = normalizeFrolicStyle(style);
    this.reset(0);
  }

  reset(tick = 0) {
    this.base = {
      clip: "groove",
      startTick: Number(tick) || 0,
      supportingFoot: "right",
      freeFoot: "left",
    };
    this.action = null;
    // Compatibility alias for callers that inspect the active authored move.
    this.current = null;
    this.phrase = null;
    this.queued = null;
    this.bridge = null;
    this.lastTick = Number(tick) || 0;
    this.entryFoot = "left";
    this.direction = "neutral";
    this.mirror = false;
    this.pendingContacts = [];
    this.emittedContactIds = new Set();
    this.serial = 0;
    this.lastResponse = null;
  }

  request(moveId, {
    tick,
    direction = "neutral",
    entryFoot = this.base.freeFoot,
    inputTimestamp = null,
    simulationReceiptTimestamp = null,
  } = {}) {
    const move = getFootwork(moveId);
    const requestTick = Number(tick) || 0;
    if (!move) return rejected("unknown-move", `Unknown movement ${moveId}.`);
    if (!move.styles.includes(this.style)) {
      return rejected("style-unavailable", `${move.displayName} is not in the ${this.style} profile.`);
    }
    const foot = entryFoot === "right" ? "right" : "left";
    const exitFoot = resolveExitFoot(move.exitRule, foot);
    const interrupted = Boolean(this.action);
    const request = Object.freeze({
      id: ++this.serial,
      move,
      requestedTick: requestTick,
      startTick: requestTick,
      direction,
      entryFoot: foot,
      exitFoot,
      inputTimestamp: finiteOrNull(inputTimestamp),
      simulationReceiptTimestamp: finiteOrNull(simulationReceiptTimestamp),
    });
    this.action = request;
    this.current = request;
    this.phrase = Object.freeze({
      moveId: move.id,
      direction,
      requestedTick: requestTick,
      actionId: request.id,
    });
    this.entryFoot = foot;
    this.direction = direction;
    this.mirror = false;
    this.lastResponse = Object.freeze({
      actionId: request.id,
      moveId: move.id,
      inputTimestamp: request.inputTimestamp,
      simulationReceiptTimestamp: request.simulationReceiptTimestamp,
      startTick: requestTick,
    });
    return accepted({
      status: interrupted ? "retargeted" : "started",
      request,
      visibleActionStarted: true,
    });
  }

  update(tick) {
    const currentTick = Number(tick) || 0;
    if (currentTick < this.lastTick) {
      this.lastTick = currentTick;
      this.pendingContacts.length = 0;
      return;
    }
    if (this.action) {
      this.collectContacts(this.lastTick, currentTick);
      const endTick = this.action.startTick + this.action.move.durationTicks;
      if (currentTick >= endTick) this.completeAction(endTick);
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
    if (!this.action) return;
    const contacts = resolvedContacts(this.action.move, this.action.entryFoot);
    for (let index = 0; index < contacts.length; index += 1) {
      const contact = contacts[index];
      const absoluteTick = this.action.startTick + contact.tick;
      // The first authored contact is scheduled directly from the raw input
      // path, even when its original phrase timing was slightly after frame 1.
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
      }));
    }
  }

  getSnapshot(tick = this.lastTick) {
    const currentTick = Number(tick) || 0;
    if (!this.action) {
      const phase = positiveModulo(currentTick - this.base.startTick, GROOVE_TICKS) / GROOVE_TICKS;
      return freezeSnapshot({
        moveId: "groove",
        moveName: "Musical Groove",
        family: "groove",
        presentationClip: "groove",
        presentationPhase: phase,
        phase,
        entryFoot: this.base.freeFoot,
        exitFoot: this.base.supportingFoot,
        supportingFoot: this.base.supportingFoot,
        direction: directionSign(this.direction),
        travelDirection: this.direction,
        rootX: 0,
        actionId: 0,
        actionStartedAtTick: null,
        response: this.lastResponse,
      });
    }
    const move = this.action.move;
    const elapsed = Math.max(0, currentTick - this.action.startTick);
    const phase = clamp01(elapsed / move.durationTicks);
    return freezeSnapshot({
      moveId: move.id,
      moveName: move.displayName,
      family: move.family,
      presentationClip: move.id,
      presentationPhase: phase,
      phase,
      entryFoot: this.action.entryFoot,
      exitFoot: this.action.exitFoot,
      supportingFoot: opposite(this.action.entryFoot),
      direction: directionSign(this.direction),
      travelDirection: this.direction,
      rootX: rootOffset(move, phase, this.direction),
      actionId: this.action.id,
      actionStartedAtTick: this.action.startTick,
      response: this.lastResponse,
    });
  }
}

function freezeSnapshot(value) {
  return Object.freeze({
    ...value,
    queuedMove: "",
    transitionClip: "",
    mirror: false,
    microResponse: 0,
    microFoot: "both",
    contacts: Object.freeze({ contacts: [], error: 0 }),
    stamina: 100,
    balance: Object.freeze({ offset: 0, wobble: 0, failed: false }),
  });
}

function resolveExitFoot(rule, entryFoot) {
  return rule === "opposite" ? opposite(entryFoot) : entryFoot;
}

function opposite(foot) {
  return foot === "right" ? "left" : "right";
}

function rootOffset(move, phase, direction) {
  const motion = move?.rootMotion ?? {};
  if (direction === "left") return -Math.abs(motion.lateral ?? 0) * phase;
  if (direction === "right") return Math.abs(motion.lateral ?? 0) * phase;
  if (direction === "forward") return Math.abs(motion.forward ?? 0) * phase * 0.35;
  if (direction === "back") return -Math.abs(motion.forward ?? 0) * phase * 0.35;
  return 0;
}

function directionSign(direction) {
  return direction === "left" || direction === "turn-left" ? -1 : 1;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function accepted(detail) {
  return Object.freeze({ ok: true, ...detail });
}

function rejected(reason, message) {
  return Object.freeze({ ok: false, reason, message });
}
