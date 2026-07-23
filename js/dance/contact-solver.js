import { distance } from "../core/math.js";

const MIRROR_LIMB = Object.freeze({
  leftPaw: "rightPaw",
  rightPaw: "leftPaw",
  leftFoot: "rightFoot",
  rightFoot: "leftFoot",
  leftShoulder: "rightShoulder",
  rightShoulder: "leftShoulder",
});

export class ContactSolver {
  constructor() {
    this.anchors = new Map();
    this.lastMoveKey = "";
    this.contactError = 0;
  }

  reset() {
    this.anchors.clear();
    this.lastMoveKey = "";
    this.contactError = 0;
  }

  resolve(move, phase, {
    mirror = false,
    baseX = 0,
    baseY = 0,
    loop = 0,
  } = {}) {
    if (!move) {
      this.reset();
      return emptyResult();
    }
    const moveKey = `${move.id}:${loop}:${mirror ? 1 : 0}`;
    if (moveKey !== this.lastMoveKey) {
      this.anchors.clear();
      this.lastMoveKey = moveKey;
    }
    const activeKeys = new Set();
    const contacts = [];
    for (const definition of move.contacts ?? []) {
      if (phase + 1e-8 < definition.start || phase - 1e-8 > definition.end) continue;
      const limb = mirror ? (MIRROR_LIMB[definition.limb] ?? definition.limb) : definition.limb;
      const key = `${definition.id}:${limb}`;
      activeKeys.add(key);
      let anchor = this.anchors.get(key);
      if (!anchor) {
        anchor = Object.freeze({
          x: baseX + (mirror ? -definition.point[0] : definition.point[0]),
          y: baseY + definition.point[1],
        });
        this.anchors.set(key, anchor);
      }
      contacts.push(Object.freeze({
        id: definition.id,
        limb,
        anchor,
        start: definition.start,
        end: definition.end,
      }));
    }
    for (const key of this.anchors.keys()) {
      if (!activeKeys.has(key)) this.anchors.delete(key);
    }
    return Object.freeze({
      contacts: Object.freeze(contacts),
      support: supportRegion(contacts),
      error: this.contactError,
    });
  }

  measure(rig, contacts) {
    let total = 0;
    let largest = 0;
    let count = 0;
    const errors = [];
    for (const contact of contacts ?? []) {
      const actual = rig?.anchors?.[contact.limb];
      if (!actual) continue;
      const error = distance(actual, contact.anchor);
      total += error;
      largest = Math.max(largest, error);
      count += 1;
      errors.push(Object.freeze({ limb: contact.limb, error, actual, target: contact.anchor }));
    }
    this.contactError = count ? total / count : 0;
    return Object.freeze({
      average: this.contactError,
      largest,
      count,
      details: Object.freeze(errors),
    });
  }
}

export function mirrorContacts(contacts = []) {
  return contacts.map((contact) => ({
    ...contact,
    limb: MIRROR_LIMB[contact.limb] ?? contact.limb,
    point: [-contact.point[0], contact.point[1]],
  }));
}

export function supportRegion(contacts = []) {
  if (!contacts.length) return Object.freeze({ min: -1, max: 1, center: 0, width: 2, count: 0 });
  const xs = contacts.map((contact) => Number(contact.anchor?.x) || 0);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const paddedMin = min === max ? min - 1.5 : min;
  const paddedMax = min === max ? max + 1.5 : max;
  return Object.freeze({
    min: paddedMin,
    max: paddedMax,
    center: (paddedMin + paddedMax) / 2,
    width: paddedMax - paddedMin,
    count: contacts.length,
  });
}

function emptyResult() {
  return Object.freeze({
    contacts: Object.freeze([]),
    support: supportRegion(),
    error: 0,
  });
}
