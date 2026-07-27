import { clamp } from "../core/math.js";
import { FROLIC_PPQ, FROLIC_TICKS_PER_BAR } from "./tune-map.js";

export const PERFORMANCE_STATES = Object.freeze({
  COLD: "cold",
  SETTLING_IN: "settling-in",
  IN_THE_POCKET: "in-the-pocket",
  COOKING: "cooking",
  SCRAMBLING: "scrambling",
  RECOVERY: "recovery",
});

const STATE_PRESENTATION = Object.freeze({
  [PERFORMANCE_STATES.COLD]: Object.freeze({
    label: "COLD",
    intensity: 0.28,
    crowdResponse: "quiet",
  }),
  [PERFORMANCE_STATES.SETTLING_IN]: Object.freeze({
    label: "SETTLING IN",
    intensity: 0.48,
    crowdResponse: "listening",
  }),
  [PERFORMANCE_STATES.IN_THE_POCKET]: Object.freeze({
    label: "IN THE POCKET",
    intensity: 0.72,
    crowdResponse: "with-you",
  }),
  [PERFORMANCE_STATES.COOKING]: Object.freeze({
    label: "COOKING",
    intensity: 1,
    crowdResponse: "alive",
  }),
  [PERFORMANCE_STATES.SCRAMBLING]: Object.freeze({
    label: "SCRAMBLING",
    intensity: 0.42,
    crowdResponse: "uncertain",
  }),
  [PERFORMANCE_STATES.RECOVERY]: Object.freeze({
    label: "RECOVERY",
    intensity: 0.58,
    crowdResponse: "encouraging",
  }),
});

/**
 * Performance state is based on a rolling musical window, never on raw button
 * count. Clean alternating contacts, useful timing, vocabulary, and legal
 * transitions raise expression. Dense repeats and rejected transitions pull
 * the dancer into a visible recovery state.
 */
export class AppalachianPerformanceState {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = PERFORMANCE_STATES.COLD;
    this.stateSinceTick = 0;
    this.contacts = [];
    this.conflicts = [];
    this.landings = [];
    this.lastSnapshot = stateSnapshot(this.state, 0, {});
  }

  recordContact(value = {}) {
    this.contacts.push(Object.freeze({
      tick: finite(value.tick),
      actionId: finiteOrNull(value.actionId),
      foot: ["left", "right", "both"].includes(value.foot) ? value.foot : "left",
      articulation: String(value.articulation ?? "flat"),
      moveId: String(value.moveId ?? ""),
      timingOffsetTicks: finite(value.timingOffsetTicks),
    }));
  }

  recordConflict(tick, reason = "rejected-transition") {
    this.conflicts.push(Object.freeze({ tick: finite(tick), reason: String(reason) }));
  }

  recordLanding(value = {}) {
    this.landings.push(Object.freeze({
      tick: finite(value.tick),
      quality: clamp(Number(value.quality) || 0, 0, 1),
    }));
  }

  update(tick, performance = {}) {
    const currentTick = finite(tick);
    const windowStart = currentTick - FROLIC_TICKS_PER_BAR * 2;
    this.contacts = this.contacts.filter((value) => value.tick >= windowStart);
    this.conflicts = this.conflicts.filter((value) => value.tick >= windowStart);
    this.landings = this.landings.filter((value) => value.tick >= windowStart);
    const recent = this.contacts.filter((value) => value.tick >= currentTick - FROLIC_TICKS_PER_BAR);
    const diagnostics = performanceDiagnostics(recent, this.conflicts, this.landings, performance);
    const stateAge = Math.max(0, currentTick - this.stateSinceTick);
    const next = selectState(this.state, stateAge, diagnostics);
    if (next !== this.state) {
      this.state = next;
      this.stateSinceTick = currentTick;
    }
    this.lastSnapshot = stateSnapshot(
      this.state,
      Math.max(0, currentTick - this.stateSinceTick),
      diagnostics,
    );
    return this.lastSnapshot;
  }

  getSnapshot() {
    return this.lastSnapshot;
  }
}

export function performanceDiagnostics(
  contacts = [],
  conflicts = [],
  landings = [],
  performance = {},
) {
  const ordered = [...contacts].sort((left, right) => left.tick - right.tick);
  const actions = collapseContactsByAction(ordered);
  const timing = average(ordered.map((value) => (
    clamp(1 - Math.abs(value.timingOffsetTicks) / (FROLIC_PPQ * 0.42), 0, 1)
  )));
  let alternations = 0;
  let repeatedFootRuns = 0;
  for (let index = 1; index < actions.length; index += 1) {
    if (actions[index].foot === "both" || actions[index - 1].foot === "both") continue;
    if (actions[index].foot !== actions[index - 1].foot) alternations += 1;
    else repeatedFootRuns += 1;
  }
  const independence = actions.length > 1 ? alternations / (actions.length - 1) : 0;
  const articulationVariety = uniqueRatio(ordered.map((value) => value.articulation), 4);
  const moveVariety = uniqueRatio(actions.map((value) => value.moveId), 5);
  const spanBeats = actions.length > 1
    ? Math.max(1, (actions.at(-1).tick - actions[0].tick) / FROLIC_PPQ)
    : 1;
  const density = actions.length / spanBeats;
  const dominantFoot = dominantRatio(actions.map((value) => value.foot));
  const dominantMove = dominantRatio(actions.map((value) => value.moveId));
  const mash = actions.length >= 6 && (
    density > 3.15
    || dominantFoot > 0.82
    || (dominantMove > 0.78 && articulationVariety < 0.4)
  );
  const transitionQuality = clamp(Number(performance.averageTransitionScore) || 0, 0, 1);
  const cleanLanding = landings.length ? average(landings.map((value) => value.quality)) : 0.72;
  const conflictRate = conflicts.length / Math.max(1, actions.length);
  const vocabulary = articulationVariety * 0.55 + moveVariety * 0.45;
  const quality = clamp(
    timing * 0.36
    + independence * 0.25
    + vocabulary * 0.19
    + transitionQuality * 0.12
    + cleanLanding * 0.08
    - conflictRate * 0.72
    - (mash ? 0.28 : 0),
    0,
    1,
  );
  return Object.freeze({
    contactCount: ordered.length,
    actionCount: actions.length,
    timing: round(timing),
    independence: round(independence),
    vocabulary: round(vocabulary),
    density: round(density),
    dominantFoot: round(dominantFoot),
    conflictRate: round(conflictRate),
    cleanLanding: round(cleanLanding),
    repeatedFootRuns,
    mash,
    quality: round(quality),
  });
}

function selectState(previous, stateAge, value) {
  const unstable = value.conflictRate >= 0.28 || value.mash || value.repeatedFootRuns >= 5;
  if (unstable) return PERFORMANCE_STATES.SCRAMBLING;
  if (previous === PERFORMANCE_STATES.SCRAMBLING) {
    return value.actionCount >= 3 && value.quality >= 0.46
      ? PERFORMANCE_STATES.RECOVERY
      : PERFORMANCE_STATES.SCRAMBLING;
  }
  if (previous === PERFORMANCE_STATES.RECOVERY && stateAge < FROLIC_PPQ * 2) {
    return PERFORMANCE_STATES.RECOVERY;
  }
  if (value.actionCount < 2) return PERFORMANCE_STATES.COLD;
  if (value.actionCount >= 10 && value.quality >= 0.76 && value.vocabulary >= 0.42) {
    return PERFORMANCE_STATES.COOKING;
  }
  if (value.actionCount >= 6 && value.quality >= 0.58) {
    return PERFORMANCE_STATES.IN_THE_POCKET;
  }
  return PERFORMANCE_STATES.SETTLING_IN;
}

function collapseContactsByAction(contacts) {
  const values = [];
  const seen = new Set();
  for (let index = 0; index < contacts.length; index += 1) {
    const contact = contacts[index];
    const key = contact.actionId ?? `contact:${index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(Object.freeze({ ...contact, key }));
  }
  return values;
}

function stateSnapshot(state, ageTicks, diagnostics) {
  const presentation = STATE_PRESENTATION[state];
  return Object.freeze({
    id: state,
    ...presentation,
    ageTicks: round(ageTicks),
    ...diagnostics,
  });
}

function dominantRatio(values) {
  if (!values.length) return 0;
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Math.max(...counts.values()) / values.length;
}

function uniqueRatio(values, usefulCount) {
  if (!values.length) return 0;
  return clamp(new Set(values.filter(Boolean)).size / usefulCount, 0, 1);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
