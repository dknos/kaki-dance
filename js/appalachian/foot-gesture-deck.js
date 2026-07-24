import { normalizeFrolicStyle } from "./footwork-catalog.js";

const ALL_STYLES = Object.freeze(["flatfoot", "buck", "clog"]);
const BUCK_CLOG = Object.freeze(["buck", "clog"]);
const ALL_GOLDEN_SUCCESSORS = Object.freeze(["basic", "brush", "articulation", "drive", "turn"]);
const CANDIDATE_PROVENANCE = Object.freeze({
  source: "Blender-authored shared-biped motion based on repository Appalachian research references",
  license: "Repository-authored animation; reference-only cultural sources are listed in docs/appalachian-sources.md",
  review: "CANDIDATE — HUMAN VISUAL AND PRACTITIONER REVIEW REQUIRED",
});

function authoringMetadata({
  subdivision,
  articulations,
  cancelEnd,
  commitmentEnd,
  facingChangeRadians = 0,
  styles = ALL_STYLES,
}) {
  return {
    provenance: CANDIDATE_PROVENANCE,
    applicableStyles: styles,
    entrySupport: ["left", "right"],
    entryFreeFoot: ["left", "right"],
    contactSource: "authored-contact-metadata",
    articulations,
    musicalSubdivision: subdivision,
    rootTranslationMeters: { x: 0, z: 0 },
    facingChangeRadians,
    entryFrameCandidates: [0, 4, 8],
    cancelWindow: { startPhase: 0, endPhase: cancelEnd },
    commitmentWindow: { startPhase: cancelEnd, endPhase: commitmentEnd },
    legalModifiers: ["none", "control", "shift"],
    armMaskCompatibility: ["coordinated", "left-isolated", "right-isolated"],
    validSuccessors: ALL_GOLDEN_SUCCESSORS,
    airborneCompatibility: false,
    landingCompatibility: true,
    audioEvent: "footContact",
    humanReviewStatus: CANDIDATE_PROVENANCE.review,
  };
}

export const GOLDEN_FOOT_GESTURES = deepFreeze({
  basic: {
    displayName: "Basic pulse",
    moveId: "walkingStep",
    clips: { left: "gesturePulseLeft", right: "gesturePulseRight" },
    durationTicks: 34,
    contacts: [{ phase: 0.38, articulation: "flat", sampleGroup: "softSole", intensity: 0.58 }],
    metadata: authoringMetadata({
      subdivision: "single eighth-note pulse",
      articulations: ["flat", "heel", "toe", "ball"],
      cancelEnd: 0.24,
      commitmentEnd: 0.58,
    }),
    variants: {
      grounded: {
        displayName: "Grounded heel/flat pulse",
        articulation: "heel",
        sampleGroup: "heel",
        intensity: 0.54,
        supportingFootLegal: true,
      },
      committed: {
        displayName: "Lifted ball/toe accent",
        articulation: "toe",
        sampleGroup: "toeBall",
        intensity: 0.72,
        supportingFootLegal: false,
      },
    },
  },
  brush: {
    displayName: "Brush-return",
    moveId: "shuffle",
    clips: { left: "gestureBrushLeft", right: "gestureBrushRight" },
    durationTicks: 42,
    contacts: [
      { phase: 0.3, articulation: "brush", sampleGroup: "brush", intensity: 0.52 },
      { phase: 0.58, articulation: "brush", sampleGroup: "brush", intensity: 0.56 },
      { phase: 0.82, articulation: "toe", sampleGroup: "toeBall", intensity: 0.58 },
    ],
    metadata: authoringMetadata({
      subdivision: "three-contact eighth-note brush phrase",
      articulations: ["brush", "drag", "toe"],
      cancelEnd: 0.2,
      commitmentEnd: 0.62,
    }),
    variants: {
      grounded: {
        displayName: "Low drag-brush",
        moveId: "dragSlide",
        articulation: "drag",
        sampleGroup: "drag",
        intensity: 0.5,
        supportingFootLegal: false,
      },
      committed: {
        displayName: "Committed brush-return",
        styles: BUCK_CLOG,
        durationTicks: 46,
        articulation: "brush",
        sampleGroup: "brush",
        intensity: 0.68,
        supportingFootLegal: false,
      },
    },
  },
  articulation: {
    displayName: "Heel-toe change",
    moveId: "heelToeChange",
    clips: { left: "gestureHeelToeLeft", right: "gestureHeelToeRight" },
    durationTicks: 44,
    contacts: [
      { phase: 0.36, articulation: "heel", sampleGroup: "heel", intensity: 0.58 },
      { phase: 0.68, articulation: "toe", sampleGroup: "toeBall", intensity: 0.62 },
    ],
    metadata: authoringMetadata({
      subdivision: "two-contact eighth-note change",
      articulations: ["heel", "toe", "ball"],
      cancelEnd: 0.22,
      commitmentEnd: 0.66,
    }),
    variants: {
      grounded: {
        displayName: "Heel dig and drop",
        articulation: "heel",
        sampleGroup: "heel",
        intensity: 0.68,
        supportingFootLegal: true,
      },
      committed: {
        displayName: "Toe/ball articulation",
        articulation: "toe",
        sampleGroup: "toeBall",
        intensity: 0.72,
        supportingFootLegal: false,
      },
    },
  },
  drive: {
    displayName: "Backstep",
    moveId: "backstep",
    clips: { left: "gestureBackstepLeft", right: "gestureBackstepRight" },
    durationTicks: 48,
    contacts: [
      { phase: 0.38, articulation: "heel", sampleGroup: "heel", intensity: 0.64 },
      { phase: 0.72, articulation: "flat", sampleGroup: "flatContact", intensity: 0.74 },
    ],
    metadata: authoringMetadata({
      subdivision: "two-contact backstep phrase",
      articulations: ["heel", "flat", "chug"],
      cancelEnd: 0.18,
      commitmentEnd: 0.74,
    }),
    variants: {
      grounded: {
        displayName: "Grounded rock/chug",
        moveId: "rockStep",
        articulation: "chug",
        sampleGroup: "chug",
        intensity: 0.68,
        supportingFootLegal: true,
      },
      committed: {
        displayName: "Committed stronger backstep",
        styles: BUCK_CLOG,
        durationTicks: 54,
        articulation: "heel",
        sampleGroup: "heel",
        intensity: 0.78,
        supportingFootLegal: false,
      },
    },
  },
  turn: {
    displayName: "Low pivot",
    moveId: "turnaround",
    clips: { left: "gesturePivotLeft", right: "gesturePivotRight" },
    durationTicks: 52,
    contacts: [
      { phase: 0.3, articulation: "ball", sampleGroup: "toeBall", intensity: 0.58 },
      { phase: 0.76, articulation: "flat", sampleGroup: "flatContact", intensity: 0.74 },
    ],
    facingChangeRadians: 0.52,
    metadata: authoringMetadata({
      subdivision: "two-contact phrase ending",
      articulations: ["ball", "flat"],
      cancelEnd: 0.16,
      commitmentEnd: 0.82,
      facingChangeRadians: 0.52,
    }),
    variants: {
      grounded: {
        displayName: "Small low pivot",
        facingChangeRadians: 0.28,
        supportingFootLegal: true,
      },
      committed: {
        displayName: "Committed turnaround",
        facingChangeRadians: 1.05,
        durationTicks: 72,
        supportingFootLegal: true,
      },
    },
  },
});

export function resolveFootGesture(intent, {
  style = "flatfoot",
  supportingFoot = "right",
} = {}) {
  const family = GOLDEN_FOOT_GESTURES[intent?.family] ?? GOLDEN_FOOT_GESTURES.basic;
  const normalizedStyle = normalizeFrolicStyle(style);
  const modifiers = intent?.modifiers ?? {};
  if (modifiers.grounded && modifiers.committed) {
    return rejected("combined-variant-unavailable", "Shift+Control has no authored variation for this gesture.");
  }
  const variantId = modifiers.grounded ? "grounded" : modifiers.committed ? "committed" : "standard";
  const variation = variantId === "standard" ? {} : family.variants?.[variantId];
  if (variantId !== "standard" && !variation) {
    return rejected("modifier-unavailable", `${family.displayName} has no ${variantId} variation.`);
  }
  if (variation?.styles && !variation.styles.includes(normalizedStyle)) {
    return rejected("style-variant-unavailable", `${variation.displayName} is not authored for ${normalizedStyle}.`);
  }
  const foot = intent?.foot === "right" ? "right" : "left";
  const supporting = foot === supportingFoot;
  const durationTicks = variation?.durationTicks ?? family.durationTicks;
  const contacts = [
    ...family.contacts,
    ...(variation?.extraContacts ?? []),
  ].map((contact, index) => Object.freeze({
    ...contact,
    index,
    tick: Math.round(contact.phase * durationTicks),
    foot,
    articulation: index === 0 && variation?.articulation
      ? variation.articulation
      : contact.articulation,
    sampleGroup: index === 0 && variation?.sampleGroup
      ? variation.sampleGroup
      : contact.sampleGroup,
    intensity: index === 0 && Number.isFinite(variation?.intensity)
      ? variation.intensity
      : contact.intensity,
  }));
  return Object.freeze({
    ok: true,
    id: `${intent.id}:${family === GOLDEN_FOOT_GESTURES.basic ? "basic" : intent.family}:${variantId}`,
    family: intent.family,
    foot,
    moveId: variation?.moveId ?? family.moveId,
    clipId: family.clips[foot],
    displayName: variation?.displayName ?? family.displayName,
    variant: variantId,
    durationTicks,
    contacts: Object.freeze(contacts),
    supportingFootLegal: variation?.supportingFootLegal ?? family.supportingFootLegal ?? false,
    weightTransferTicks: supporting && variation?.supportingFootLegal !== true ? 8 : supporting ? 4 : 0,
    facingChangeRadians: variation?.facingChangeRadians ?? family.facingChangeRadians ?? 0,
    metadata: family.metadata,
    provenance: family.metadata.provenance.source,
    humanReviewStatus: family.metadata.humanReviewStatus,
  });
}

export function validateGoldenFootGestures(deck = GOLDEN_FOOT_GESTURES) {
  const errors = [];
  for (const [familyId, family] of Object.entries(deck)) {
    if (!family.clips?.left || !family.clips?.right) errors.push(`${familyId} lacks paired clips.`);
    if (!(family.durationTicks > 0)) errors.push(`${familyId} lacks duration.`);
    if (!family.contacts?.length) errors.push(`${familyId} lacks authored contacts.`);
    const metadata = family.metadata;
    for (const field of [
      "provenance",
      "applicableStyles",
      "entrySupport",
      "entryFreeFoot",
      "contactSource",
      "articulations",
      "musicalSubdivision",
      "rootTranslationMeters",
      "entryFrameCandidates",
      "cancelWindow",
      "commitmentWindow",
      "legalModifiers",
      "armMaskCompatibility",
      "validSuccessors",
      "airborneCompatibility",
      "landingCompatibility",
      "audioEvent",
      "humanReviewStatus",
    ]) {
      if (metadata?.[field] === undefined) errors.push(`${familyId} lacks ${field} authoring metadata.`);
    }
    if (!metadata?.applicableStyles?.every((style) => ALL_STYLES.includes(style))) {
      errors.push(`${familyId} has an unknown style profile.`);
    }
    if (!(metadata?.cancelWindow?.endPhase <= metadata?.commitmentWindow?.startPhase)) {
      errors.push(`${familyId} has overlapping cancel and commitment windows.`);
    }
    for (const contact of family.contacts ?? []) {
      if (!(contact.phase > 0 && contact.phase < 1)) errors.push(`${familyId} has an out-of-range contact.`);
      if (!contact.sampleGroup) errors.push(`${familyId} contact lacks Foley metadata.`);
    }
  }
  return errors;
}

function rejected(reason, message) {
  return Object.freeze({ ok: false, reason, message });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
