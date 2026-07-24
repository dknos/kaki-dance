import {
  FOOTWORK_CATALOG,
  getFootwork,
  normalizeFrolicStyle,
  oppositeFoot,
  resolveExitFoot,
} from "./footwork-catalog.js";
import { FROLIC_PPQ } from "./tune-map.js";

export const FROLIC_TRANSITION_CLIPS = Object.freeze({
  "weight-shift": Object.freeze({
    id: "weightShift",
    durationTicks: 24,
    fromTags: ["open", "weighted", "balanced", "resolved"],
    toTags: ["open", "weighted", "balanced", "low"],
  }),
  "brush-return": Object.freeze({
    id: "brushReturn",
    durationTicks: 24,
    fromTags: ["open", "weighted"],
    toTags: ["open", "weighted", "balanced"],
  }),
  "rear-recover": Object.freeze({
    id: "rearRecover",
    durationTicks: 36,
    fromTags: ["rear-weighted"],
    toTags: ["open", "weighted", "balanced"],
  }),
  "slide-recover": Object.freeze({
    id: "slideRecover",
    durationTicks: 36,
    fromTags: ["low", "open"],
    toTags: ["low", "open", "weighted"],
  }),
  "cross-recover": Object.freeze({
    id: "crossRecover",
    durationTicks: 48,
    fromTags: ["crossed"],
    toTags: ["open", "weighted", "resolved"],
  }),
  "turn-resolve": Object.freeze({
    id: "turnResolve",
    durationTicks: 48,
    fromTags: ["open", "crossed", "weighted", "resolved"],
    toTags: ["open", "closed", "resolved", "balanced"],
  }),
});

const authoredSuccessors = Object.freeze({
  walkingStep: ["walkingStep", "slidingWalk", "shuffle", "backstep", "chug", "heelToeChange", "rockStep", "doubleStep", "crisscross", "turnaround"],
  slidingWalk: ["walkingStep", "shuffle", "backstep", "heelToeChange", "dragSlide", "rockStep", "crisscross", "turnaround"],
  shuffle: ["walkingStep", "shuffle", "doubleShuffle", "backstep", "heelToeChange", "rockStep", "doubleStep", "crisscross", "turnaround"],
  doubleShuffle: ["walkingStep", "shuffle", "backstep", "chug", "rockStep", "doubleStep", "tripleStep", "crisscross", "turnaround"],
  backstep: ["walkingStep", "slidingWalk", "shuffle", "chug", "rockStep", "doubleStep", "crisscross", "turnaround"],
  chug: ["walkingStep", "shuffle", "backstep", "heelToeChange", "rockStep", "doubleStep", "tripleStep", "turnaround"],
  heelToeChange: ["walkingStep", "slidingWalk", "shuffle", "backstep", "dragSlide", "rockStep", "doubleStep", "crisscross", "turnaround"],
  dragSlide: ["walkingStep", "slidingWalk", "shuffle", "backstep", "heelToeChange", "rockStep", "crisscross", "turnaround"],
  rockStep: ["walkingStep", "slidingWalk", "shuffle", "backstep", "chug", "heelToeChange", "doubleStep", "crisscross", "turnaround"],
  doubleStep: ["walkingStep", "shuffle", "doubleShuffle", "backstep", "chug", "rockStep", "tripleStep", "crisscross", "turnaround"],
  tripleStep: ["walkingStep", "shuffle", "backstep", "chug", "rockStep", "doubleStep", "crisscross", "turnaround"],
  crisscross: ["walkingStep", "backstep", "chug", "heelToeChange", "rockStep", "doubleStep", "turnaround", "controlledEnding"],
  turnaround: ["walkingStep", "shuffle", "chug", "rockStep", "doubleStep", "controlledEnding"],
  controlledEnding: ["walkingStep", "rockStep"],
});

export class FootworkTransitionGraph {
  constructor({ catalog = FOOTWORK_CATALOG, style = "flatfoot" } = {}) {
    this.catalog = catalog;
    this.style = normalizeFrolicStyle(style);
    this.edges = buildEdges(catalog, this.style);
  }

  successors(moveId) {
    return Object.freeze([...(this.edges.get(moveId) ?? [])]);
  }

  resolve({
    fromId,
    toId,
    entryFoot = "left",
    direction = "neutral",
    landingTick = 0,
  }) {
    const from = this.catalog[fromId] ?? null;
    const to = this.catalog[toId] ?? null;
    if (!to) return rejected("unknown-move", `Unknown movement ${toId}.`);
    if (!to.styles.includes(this.style)) {
      return rejected("style-unavailable", `${to.displayName} is not in the ${this.style} profile.`);
    }
    if (!from) {
      return accepted({
        entryFoot,
        exitFoot: resolveExitFoot(to, entryFoot),
        transitionClip: "weightShift",
        transitionTicks: 0,
      });
    }
    if (!(this.edges.get(fromId) ?? []).includes(toId)) {
      return rejected("no-authored-edge", `${from.displayName} has no authored transition to ${to.displayName}.`);
    }
    const exitFoot = resolveExitFoot(from, entryFoot);
    const nextEntryFoot = to.entryFoot === "either" ? exitFoot : to.entryFoot;
    if (nextEntryFoot !== exitFoot) {
      return rejected("foot-mismatch", `${from.displayName} exits on ${exitFoot}, but ${to.displayName} cannot accept it.`);
    }
    if (!directionCompatible(to, direction)) {
      return rejected("direction-mismatch", `${to.displayName} cannot travel ${direction}.`);
    }
    if (!landsMusically(landingTick)) {
      return rejected("off-grid", `${to.displayName} needs a sixteenth-note transition boundary.`);
    }
    const transition = chooseTransition(from, to);
    if (!transition) {
      return rejected("missing-transition-clip", `${from.displayName} to ${to.displayName} lacks an authored bridge.`);
    }
    return accepted({
      entryFoot: nextEntryFoot,
      exitFoot: resolveExitFoot(to, nextEntryFoot),
      transitionClip: transition.id,
      transitionTicks: transition.durationTicks,
    });
  }

  chooseLegal({
    fromId,
    candidates = [],
    entryFoot = "left",
    direction = "neutral",
    landingTick = 0,
  } = {}) {
    for (const toId of candidates) {
      const result = this.resolve({ fromId, toId, entryFoot, direction, landingTick });
      if (result.ok) return Object.freeze({ ...result, move: this.catalog[toId] });
    }
    const fallbackIds = this.successors(fromId || "walkingStep");
    for (const toId of fallbackIds) {
      const result = this.resolve({ fromId, toId, entryFoot, direction: "neutral", landingTick });
      if (result.ok) return Object.freeze({ ...result, move: this.catalog[toId] });
    }
    return null;
  }
}

export function validateTransitionGraph(style, catalog = FOOTWORK_CATALOG) {
  const graph = new FootworkTransitionGraph({ catalog, style });
  const errors = [];
  for (const move of Object.values(catalog).filter((value) => value.styles.includes(graph.style))) {
    const successors = graph.successors(move.id);
    if (successors.length < 4 && move.id !== "controlledEnding") {
      errors.push(`${graph.style}/${move.id} has fewer than four useful successors.`);
    }
    for (const toId of successors) {
      const result = graph.resolve({
        fromId: move.id,
        toId,
        entryFoot: "left",
        direction: "neutral",
        landingTick: FROLIC_PPQ,
      });
      if (!result.ok) errors.push(`${graph.style}/${move.id}->${toId}: ${result.reason}`);
    }
  }
  return errors;
}

export function nextEntryFoot(moveId, entryFoot) {
  const move = getFootwork(moveId);
  return move ? resolveExitFoot(move, entryFoot) : oppositeFoot(entryFoot);
}

function buildEdges(catalog, style) {
  const result = new Map();
  for (const [fromId, candidates] of Object.entries(authoredSuccessors)) {
    const from = catalog[fromId];
    if (!from?.styles.includes(style)) continue;
    result.set(fromId, Object.freeze(candidates.filter((toId) => catalog[toId]?.styles.includes(style))));
  }
  return result;
}

function chooseTransition(from, to) {
  const preferences = [
    ...(from.transitionTags ?? []),
    ...(to.transitionTags ?? []),
    "weight-shift",
  ];
  for (const key of preferences) {
    const clip = FROLIC_TRANSITION_CLIPS[key];
    if (!clip) continue;
    const fromMatch = clip.fromTags.some((tag) => from.exitTags.includes(tag));
    const toMatch = clip.toTags.some((tag) => to.entryTags.includes(tag));
    if (fromMatch && toMatch) return clip;
  }
  return null;
}

function directionCompatible(move, direction) {
  if (!direction || direction === "neutral") return true;
  if (move.directionOptions.includes(direction)) return true;
  if (direction === "cross") return move.directionOptions.includes("left") || move.directionOptions.includes("right");
  return false;
}

function landsMusically(tick) {
  return Math.abs((Number(tick) || 0) / 24 - Math.round((Number(tick) || 0) / 24)) < 1e-7;
}

function accepted(detail) {
  return Object.freeze({ ok: true, ...detail });
}

function rejected(reason, message) {
  return Object.freeze({ ok: false, reason, message });
}
