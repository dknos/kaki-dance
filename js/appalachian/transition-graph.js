import {
  FOOTWORK_CATALOG,
  getFootwork,
  normalizeFrolicStyle,
  oppositeFoot,
  resolveExitFoot,
} from "./footwork-catalog.js";
import { FROLIC_PPQ } from "./tune-map.js";
import { transitionRecipeFor } from "./transition-recipes.js";

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
  shuffle: ["walkingStep", "shuffle", "doubleShuffle", "backstep", "chug", "heelToeChange", "rockStep", "doubleStep", "crisscross", "turnaround"],
  doubleShuffle: ["walkingStep", "shuffle", "backstep", "chug", "rockStep", "doubleStep", "tripleStep", "crisscross", "turnaround"],
  backstep: ["walkingStep", "slidingWalk", "shuffle", "backstep", "chug", "rockStep", "doubleStep", "crisscross", "turnaround"],
  chug: ["walkingStep", "shuffle", "backstep", "heelToeChange", "rockStep", "doubleStep", "tripleStep", "turnaround"],
  heelToeChange: ["walkingStep", "slidingWalk", "shuffle", "backstep", "chug", "heelToeChange", "dragSlide", "rockStep", "doubleStep", "crisscross", "turnaround"],
  dragSlide: ["walkingStep", "slidingWalk", "shuffle", "backstep", "heelToeChange", "rockStep", "crisscross", "turnaround"],
  rockStep: ["walkingStep", "slidingWalk", "shuffle", "backstep", "chug", "heelToeChange", "doubleStep", "crisscross", "turnaround"],
  doubleStep: ["walkingStep", "shuffle", "doubleShuffle", "backstep", "chug", "rockStep", "tripleStep", "crisscross", "turnaround"],
  tripleStep: ["walkingStep", "shuffle", "backstep", "chug", "rockStep", "doubleStep", "crisscross", "turnaround"],
  crisscross: ["walkingStep", "backstep", "chug", "heelToeChange", "rockStep", "doubleStep", "turnaround", "controlledEnding"],
  turnaround: ["walkingStep", "shuffle", "chug", "rockStep", "doubleStep", "turnaround", "controlledEnding"],
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

  rankCandidates({
    fromId,
    candidates = [],
    entryFoot = "left",
    direction = "neutral",
    currentState = {},
    phrasePhase = 0,
  } = {}) {
    const from = this.catalog[fromId] ?? null;
    const ids = candidates.length ? candidates : this.successors(fromId || "walkingStep");
    const results = [];
    for (const toId of ids) {
      const to = this.catalog[toId];
      if (!to?.styles.includes(this.style)) continue;
      if (from && !(this.edges.get(fromId) ?? []).includes(toId)) continue;
      if (!directionCompatible(to, direction)) continue;
      const requestedFoot = entryFoot === "right" ? "right" : "left";
      const fromExitFoot = from ? resolveExitFoot(from, requestedFoot) : requestedFoot;
      const targetFoot = to.entryFoot === "either" ? requestedFoot : to.entryFoot;
      const entryFrames = to.entryFrames?.length ? to.entryFrames : [0, 0.08, 0.16, 0.24];
      for (const entryPhase of entryFrames) {
        const scoreParts = candidateScore({
          from,
          to,
          entryPhase,
          currentState,
          phrasePhase,
          entryFoot: targetFoot,
        });
        const recipe = transitionRecipeFor({
          fromFamily: from?.family ?? "foundation",
          toFamily: to.family,
          support: currentState.supportingFoot ?? oppositeFoot(targetFoot),
        });
        results.push(Object.freeze({
          move: to,
          entryFoot: targetFoot,
          exitFoot: resolveExitFoot(to, targetFoot),
          entryPhase,
          score: scoreParts.total,
          scoreParts,
          transitionClip: recipe.clip,
          transitionRecipe: recipe.id,
          transitionTicks: Math.round(recipe.durationMs * FROLIC_PPQ * 2 / 1000),
          rootWarpLimitMeters: recipe.rootWarpLimitMeters,
          plantedFootLock: recipe.plantedFootLock,
          resolved: true,
        }));
      }
    }
    return Object.freeze(results.sort((left, right) => left.score - right.score));
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

function candidateScore({
  from,
  to,
  entryPhase,
  currentState,
  phrasePhase,
  entryFoot,
}) {
  const desiredVelocity = to.rootVelocity ?? {
    x: Number(to.rootMotion?.lateral) || 0,
    z: Number(to.rootMotion?.forward) || 0,
  };
  const currentVelocity = currentState.rootVelocity ?? { x: 0, z: 0 };
  const velocity = Math.hypot(
    (Number(currentVelocity.x) || 0) - (Number(desiredVelocity.x) || 0) * 0.18,
    (Number(currentVelocity.z) || 0) - (Number(desiredVelocity.z) || 0) * 0.18,
  );
  const support = currentState.supportingFoot && currentState.supportingFoot !== oppositeFoot(entryFoot) ? 1 : 0;
  const pose = Math.abs((Number(currentState.phase) || 0) - entryPhase);
  const facing = angularDistance(
    Number(currentState.facing) || 0,
    Number(to.preferredFacing) || Number(currentState.facing) || 0,
  ) / Math.PI;
  const angularVelocity = Math.abs((Number(currentState.angularVelocity) || 0) - (Number(to.angularMomentum) || 0)) / 8;
  const level = Math.abs(
    levelNumber(currentState.bodyLevel ?? "mid") - levelNumber(to.entryLevel ?? "mid"),
  );
  const centerOfMass = Math.abs(Number(currentState.centerOfMassOffset) || 0) * 0.55;
  const musical = Math.min(
    Math.abs((Number(phrasePhase) || 0) - entryPhase),
    1 - Math.abs((Number(phrasePhase) || 0) - entryPhase),
  );
  const total = round(
    pose * 0.2
    + velocity * 0.22
    + facing * 0.12
    + angularVelocity * 0.1
    + support * 0.18
    + centerOfMass * 0.08
    + level * 0.06
    + musical * 0.04,
  );
  return Object.freeze({
    total,
    pose: round(pose),
    velocity: round(velocity),
    facing: round(facing),
    angularVelocity: round(angularVelocity),
    support: round(support),
    centerOfMass: round(centerOfMass),
    level: round(level),
    musical: round(musical),
    from: from?.id ?? "groove",
    to: to.id,
  });
}

function angularDistance(left, right) {
  const raw = Math.abs(left - right) % (Math.PI * 2);
  return Math.min(raw, Math.PI * 2 - raw);
}

function levelNumber(value) {
  return { low: 0, mid: 0.5, high: 1 }[value] ?? 0.5;
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function accepted(detail) {
  return Object.freeze({ ok: true, ...detail });
}

function rejected(reason, message) {
  return Object.freeze({ ok: false, reason, message });
}
