import { phaseWithinWindow } from "../animation/pose-timeline.js";
import { canAffordMove } from "./stamina.js";

export function moveEligibility(move, {
  tags = [],
  precedingFamily = "idle",
  stamina = 100,
  currentMove = null,
  phase = 1,
} = {}) {
  if (!move) return { eligible: false, reason: "UNKNOWN MOVE", code: "unknown" };
  const tagSet = tags instanceof Set ? tags : new Set(tags);
  const missingTag = move.entryTags.find((tag) => !tagSet.has(tag));
  if (missingTag) {
    return {
      eligible: false,
      reason: reasonForMissingTag(missingTag),
      code: `tag:${missingTag}`,
    };
  }
  if (!move.eligiblePrecedingFamilies.includes(precedingFamily)) {
    return { eligible: false, reason: "RECOVER FIRST", code: "preceding-family" };
  }
  if (!canAffordMove(stamina, move)) {
    return { eligible: false, reason: "LOW STAMINA", code: "stamina" };
  }
  if (currentMove) {
    if (!currentMove.validFollowUps.includes(move.id)) {
      return { eligible: false, reason: "FIND CONTACT", code: "follow-up" };
    }
    if (!phaseWithinWindow(phase, currentMove.cancelWindows) && phase < 0.999) {
      return {
        eligible: false,
        reason: currentMove.family === "power" && move.family === "freeze" ? "FREEZE WINDOW" : "HOLD THE BEAT",
        code: "window",
        bufferable: true,
      };
    }
  }
  return { eligible: true, reason: "", code: "ok" };
}

export function validateTransitionGraph(catalog) {
  const errors = [];
  const values = Object.values(catalog);
  for (const move of values) {
    for (const nextId of move.validFollowUps) {
      if (!catalog[nextId]) errors.push(`${move.id} references missing follow-up ${nextId}.`);
    }
    if (!move.entryTags.length) errors.push(`${move.id} has no entry tags.`);
    if (!move.exitTags.length) errors.push(`${move.id} has no exit tags.`);
    if (!move.cancelWindows.every(([start, end]) => start >= 0 && end <= 1 && start <= end)) {
      errors.push(`${move.id} has an invalid cancel window.`);
    }
  }
  return errors;
}

export function legalTransitions(catalog, state) {
  return Object.values(catalog).filter((move) => moveEligibility(move, state).eligible);
}

function reasonForMissingTag(tag) {
  if (tag === "floor" || tag === "powerReady" || tag === "freezeReady") return "NEED FLOOR";
  if (tag === "standing") return "RECOVER FIRST";
  if (tag.includes("Hand")) return "FIND CONTACT";
  return "FIND CONTACT";
}
