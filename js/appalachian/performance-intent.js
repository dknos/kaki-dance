import { oppositeFoot } from "./footwork-catalog.js";

export const APPALACHIAN_INTENT_WINDOW_MS = 72;
export const APPALACHIAN_INTENT_WINDOW_TICKS = 13.824;
export const APPALACHIAN_FOOT_ACTIONS = Object.freeze(["leftFoot", "rightFoot"]);
export const APPALACHIAN_FAMILY_ACTIONS = Object.freeze([
  "basic", "brush",
  "articulation",
  "drive",
  "turn",
]);

/**
 * Coalesces anatomical foot edges and movement-family edges without delaying
 * visible foot anticipation. The buffer is expressed in musical ticks so a
 * replay with the same input ticks resolves byte-for-byte identically.
 */
export class AppalachianIntentBuffer {
  constructor({ windowTicks = APPALACHIAN_INTENT_WINDOW_TICKS } = {}) {
    this.windowTicks = Number(windowTicks) || APPALACHIAN_INTENT_WINDOW_TICKS;
    this.clear();
  }

  clear() {
    this.pendingFeet = [];
    this.pendingFamilies = [];
    this.serial = 0;
    this.autoFoot = "left";
    this.lastChord = null;
  }

  accept(edge, tick, context = {}) {
    const action = String(edge?.action ?? "");
    const eventTick = Number(tick) || 0;
    if (APPALACHIAN_FOOT_ACTIONS.includes(action)) {
      return this.acceptFoot(edge, eventTick);
    }
    if (APPALACHIAN_FAMILY_ACTIONS.includes(action)) {
      return this.acceptFamily(edge, eventTick);
    }
    return Object.freeze({ anticipations: Object.freeze([]), intents: Object.freeze([]) });
  }

  acceptFoot(edge, tick) {
    const foot = edge.action === "rightFoot" ? "right" : "left";
    const footRequest = pending(++this.serial, "foot", tick, edge, this.windowTicks, { foot });
    const familyIndex = nearestWithin(this.pendingFamilies, tick, this.windowTicks);
    const anticipations = [freezeAnticipation(footRequest)];
    if (familyIndex < 0) {
      this.pendingFeet.push(footRequest);
      return frozenResult(anticipations, []);
    }
    const familyRequest = this.pendingFamilies.splice(familyIndex, 1)[0];
    return frozenResult(anticipations, [this.resolve(footRequest, familyRequest, tick)]);
  }

  acceptFamily(edge, tick) {
    const familyRequest = pending(
      ++this.serial,
      "family",
      tick,
      edge,
      this.windowTicks,
      { family: edge.action },
    );
    const footIndex = nearestWithin(this.pendingFeet, tick, this.windowTicks);
    if (footIndex < 0) {
      this.pendingFamilies.push(familyRequest);
      return frozenResult([], []);
    }
    const footRequest = this.pendingFeet.splice(footIndex, 1)[0];
    return frozenResult([], [this.resolve(footRequest, familyRequest, tick)]);
  }

  advance(tick, context = {}) {
    const currentTick = Number(tick) || 0;
    const due = [];
    for (const foot of removeDue(this.pendingFeet, currentTick)) {
      due.push(this.resolve(foot, null, currentTick));
    }
    for (const family of removeDue(this.pendingFamilies, currentTick)) {
      const selected = normalizeFoot(context.freeFoot ?? this.autoFoot);
      const syntheticFoot = pending(
        ++this.serial,
        "foot",
        family.tick,
        {
          ...family.edge,
          action: selected === "left" ? "leftFoot" : "rightFoot",
          synthetic: true,
        },
        this.windowTicks,
        { foot: selected },
      );
      due.push(this.resolve(syntheticFoot, family, currentTick));
      this.autoFoot = oppositeFoot(selected);
    }
    return Object.freeze(due.sort((left, right) => (
      left.initiatedTick - right.initiatedTick || left.sequence - right.sequence
    )));
  }

  resolve(footRequest, familyRequest, tick) {
    const original = familyRequest && familyRequest.tick < footRequest.tick
      ? familyRequest
      : footRequest;
    const foot = normalizeFoot(footRequest.foot);
    const family = familyRequest?.family ?? "basic";
    const modifiers = Object.freeze({
      grounded: Boolean(original.edge.grounded ?? original.edge.groundModifier),
      committed: Boolean(original.edge.committed ?? original.edge.commitModifier),
    });
    const chord = Object.freeze([
      foot === "left" ? "leftFoot" : "rightFoot",
      ...(family === "basic" ? [] : [family]),
    ]);
    const value = Object.freeze({
      id: ++this.serial,
      sequence: Math.min(footRequest.sequence, familyRequest?.sequence ?? footRequest.sequence),
      foot,
      family,
      modifiers,
      chord,
      initiatedTick: Math.min(footRequest.tick, familyRequest?.tick ?? footRequest.tick),
      resolvedTick: Number(tick) || 0,
      rawTimeStamp: finiteOrNull(original.edge.rawTimeStamp),
      receivedTimeStamp: finiteOrNull(original.edge.receivedTimeStamp),
      device: original.edge.device ?? "unknown",
      direction: original.edge.direction ?? "neutral",
      sourceCodes: Object.freeze([
        footRequest.edge.code ?? "",
        ...(familyRequest ? [familyRequest.edge.code ?? ""] : []),
      ]),
      originalModifiersFrom: original.kind,
    });
    this.lastChord = value;
    this.autoFoot = oppositeFoot(foot);
    return value;
  }

  snapshot() {
    return Object.freeze({
      windowMilliseconds: APPALACHIAN_INTENT_WINDOW_MS,
      windowTicks: this.windowTicks,
      left: Object.freeze(this.pendingFeet
        .filter((value) => value.foot === "left")
        .map(bufferSummary)),
      right: Object.freeze(this.pendingFeet
        .filter((value) => value.foot === "right")
        .map(bufferSummary)),
      families: Object.freeze(this.pendingFamilies.map(bufferSummary)),
      lastChord: this.lastChord,
    });
  }
}

function pending(sequence, kind, tick, edge, windowTicks, extra) {
  return {
    sequence,
    kind,
    tick,
    deadlineTick: tick + windowTicks,
    edge: Object.freeze({ ...edge }),
    ...extra,
  };
}

function nearestWithin(values, tick, windowTicks) {
  let selected = -1;
  let distance = Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const candidateDistance = Math.abs(tick - values[index].tick);
    if (candidateDistance > windowTicks) continue;
    if (
      candidateDistance < distance
      || (candidateDistance === distance && values[index].sequence < values[selected]?.sequence)
    ) {
      selected = index;
      distance = candidateDistance;
    }
  }
  return selected;
}

function removeDue(values, tick) {
  const due = [];
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index].deadlineTick > tick) continue;
    due.push(values.splice(index, 1)[0]);
  }
  return due.sort((left, right) => left.sequence - right.sequence);
}

function freezeAnticipation(value) {
  return Object.freeze({
    sequence: value.sequence,
    foot: value.foot,
    tick: value.tick,
    deadlineTick: value.deadlineTick,
    modifiers: Object.freeze({
      grounded: Boolean(value.edge.grounded ?? value.edge.groundModifier),
      committed: Boolean(value.edge.committed ?? value.edge.commitModifier),
    }),
    rawTimeStamp: finiteOrNull(value.edge.rawTimeStamp),
  });
}

function frozenResult(anticipations, intents) {
  return Object.freeze({
    anticipations: Object.freeze(anticipations),
    intents: Object.freeze(intents),
  });
}

function bufferSummary(value) {
  return Object.freeze({
    sequence: value.sequence,
    tick: value.tick,
    deadlineTick: value.deadlineTick,
    foot: value.foot ?? "",
    family: value.family ?? "",
  });
}

function normalizeFoot(value) {
  return value === "right" ? "right" : "left";
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
