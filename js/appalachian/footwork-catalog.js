import { FROLIC_PPQ } from "./tune-map.js";

export const FROLIC_STYLE_IDS = Object.freeze(["flatfoot", "buck", "clog"]);

export const FROLIC_STYLE_PROFILES = deepFreeze({
  flatfoot: {
    id: "flatfoot",
    displayName: "Flatfoot",
    gameplayLabel: "LOW · CLOSE · INTRICATE",
    centerOfGravity: "low",
    upperBody: "quiet balance",
    contactMix: "warm-sole",
    tapShoes: false,
    poseLanguage: ["bent-knees", "close-floor", "smooth-travel", "restrained-arms"],
    description: "A low, smooth gameplay profile for close-to-floor drags, slides, heel-toe changes, and quiet rhythmic detail.",
    variabilityNote: "Inspired by recurring characteristics in practitioner archives; terminology and practice vary by community and dancer.",
  },
  buck: {
    id: "buck",
    displayName: "Buck",
    gameplayLabel: "SPRING · SYNCOPATE · ANSWER",
    centerOfGravity: "responsive",
    upperBody: "restrained counterbalance",
    contactMix: "bright-ball",
    tapShoes: false,
    poseLanguage: ["ball-of-foot", "scissor-path", "syncopated-lift", "melody-answer"],
    description: "A springier freestyle gameplay profile with bright ball contacts, cross-steps, and melody-answering syncopation.",
    variabilityNote: "This profile does not define buck dancing everywhere; individual and regional practices overlap with flatfooting and clogging.",
  },
  clog: {
    id: "clog",
    displayName: "Clog",
    gameplayLabel: "PROJECT · DOUBLE · RESOLVE",
    centerOfGravity: "projected",
    upperBody: "clearer phrase projection",
    contactMix: "tap-equipped",
    tapShoes: true,
    poseLanguage: ["higher-knee", "double-step", "repeated-pattern", "show-turn"],
    description: "One staged-leaning gameplay profile with clearer accents, double and triple steps, and optional tap timbre.",
    variabilityNote: "This is one game profile, not a claim that all clogging is standardized, loud, competitive, or performed in teams.",
  },
});

const ALL_STYLES = [...FROLIC_STYLE_IDS];
const FLAT_BUCK = ["flatfoot", "buck"];
const BUCK_CLOG = ["buck", "clog"];

const rawCatalog = [
  movement({
    id: "walkingStep",
    displayName: "Walking Step",
    family: "foundation",
    input: "step",
    styles: ALL_STYLES,
    durationTicks: FROLIC_PPQ,
    exitRule: "opposite",
    contacts: [
      contact(0, "lead", "flat", 0.58, "softSole"),
      contact(48, "trail", "flat", 0.62, "flatContact"),
    ],
    rootMotion: { forward: 2, lateral: 0 },
    directionOptions: ["neutral", "forward", "back", "left", "right"],
    entryTags: ["standing", "open", "balanced"],
    exitTags: ["standing", "open", "weighted"],
    transitionTags: ["weight-shift"],
    scoreTraits: ["foundation", "restraint", "motif"],
    difficulty: 1,
    sourceNotes: [
      "Robert Dotson's dancing informed the Walking Step later taught by the Green Grass Cloggers.",
      "The game uses a generic foundation family rather than reproducing one dancer's personal performance.",
    ],
  }),
  movement({
    id: "slidingWalk",
    displayName: "Forward-and-Back Sliding Walk",
    family: "foundation",
    input: "step",
    styles: FLAT_BUCK,
    durationTicks: FROLIC_PPQ * 2,
    exitRule: "opposite",
    contacts: [
      contact(0, "lead", "flat", 0.48, "softSole"),
      contact(42, "trail", "slide", 0.42, "slide"),
      contact(96, "trail", "flat", 0.54, "flatContact"),
      contact(144, "lead", "drag", 0.46, "drag"),
    ],
    rootMotion: { forward: 4, lateral: 0 },
    directionOptions: ["forward", "back"],
    entryTags: ["standing", "open", "low"],
    exitTags: ["standing", "open", "low"],
    transitionTags: ["weight-shift", "slide-recover"],
    scoreTraits: ["flow", "travel", "restraint"],
    difficulty: 1,
    sourceNotes: [
      "Low, smooth travel and close-to-floor motion are recurring flatfoot characteristics in NEA and practitioner documentation.",
    ],
  }),
  movement({
    id: "shuffle",
    displayName: "Shuffle",
    family: "brush",
    input: "brush",
    styles: ALL_STYLES,
    durationTicks: FROLIC_PPQ,
    exitRule: "same",
    contacts: [
      contact(12, "lead", "brush", 0.46, "brush"),
      contact(36, "lead", "brush", 0.5, "brush"),
      contact(72, "lead", "toe", 0.62, "toeBall"),
    ],
    rootMotion: { forward: 0, lateral: 1 },
    directionOptions: ["neutral", "forward", "left", "right"],
    entryTags: ["standing", "weighted"],
    exitTags: ["standing", "open", "weighted"],
    transitionTags: ["brush-return"],
    scoreTraits: ["articulation", "syncopation"],
    difficulty: 1,
    sourceNotes: [
      "Shuffle vocabulary appears in Jamison's dancer archive and in documented clogging instruction.",
      "The authored motion is a compact game family, not a claim about a single universal shuffle.",
    ],
  }),
  movement({
    id: "doubleShuffle",
    displayName: "Double Shuffle",
    family: "brush",
    input: "brush",
    styles: BUCK_CLOG,
    durationTicks: FROLIC_PPQ * 2,
    exitRule: "same",
    contacts: [
      contact(12, "lead", "brush", 0.48, "brush"),
      contact(36, "lead", "brush", 0.52, "brush"),
      contact(60, "lead", "toe", 0.64, "toeBall"),
      contact(108, "lead", "brush", 0.5, "brush"),
      contact(132, "lead", "brush", 0.54, "scuff"),
      contact(168, "lead", "toe", 0.72, "toeBall"),
    ],
    rootMotion: { forward: 1, lateral: 1 },
    directionOptions: ["neutral", "forward", "cross"],
    entryTags: ["standing", "weighted"],
    exitTags: ["standing", "open", "weighted"],
    transitionTags: ["brush-return"],
    scoreTraits: ["articulation", "density-control", "syncopation"],
    difficulty: 2,
    sourceNotes: [
      "Double Shuffle is documented by name in Jamison's John Reeves archive entry.",
      "Mechanics use general brush-return principles rather than reconstructing Reeves's personal step from its name.",
    ],
  }),
  movement({
    id: "backstep",
    displayName: "Backstep",
    family: "drive",
    input: "drive",
    styles: ALL_STYLES,
    durationTicks: FROLIC_PPQ,
    exitRule: "opposite",
    contacts: [
      contact(0, "trail", "heel", 0.64, "heel"),
      contact(42, "lead", "toe", 0.7, "toeBall"),
      contact(72, "trail", "flat", 0.76, "flatContact"),
    ],
    rootMotion: { forward: -2, lateral: 0 },
    directionOptions: ["back", "neutral", "cross"],
    entryTags: ["standing", "open", "balanced"],
    exitTags: ["standing", "rear-weighted"],
    transitionTags: ["rear-recover", "weight-shift"],
    scoreTraits: ["foundation", "accent", "flow"],
    difficulty: 2,
    sourceNotes: [
      "Regional backsteps appear throughout dancer documentation; names and mechanics are not uniform.",
      "The MVP uses an intentionally generic backstep family and does not label it with a regional or personal name.",
    ],
  }),
  movement({
    id: "chug",
    displayName: "Chug",
    family: "drive",
    input: "drive",
    styles: ALL_STYLES,
    durationTicks: FROLIC_PPQ,
    exitRule: "same",
    contacts: [
      contact(0, "lead", "flat", 0.62, "flatContact"),
      contact(24, "both", "chug", 0.78, "chug"),
      contact(72, "trail", "heel", 0.7, "heel"),
    ],
    rootMotion: { forward: -1, lateral: 0 },
    directionOptions: ["neutral", "forward", "back"],
    entryTags: ["standing", "open", "balanced"],
    exitTags: ["standing", "open", "weighted"],
    transitionTags: ["weight-shift"],
    scoreTraits: ["drive", "accent", "board-resonance"],
    difficulty: 2,
    sourceNotes: [
      "Chugs and drag-slides are common instructional building blocks; execution and terminology vary.",
    ],
  }),
  movement({
    id: "heelToeChange",
    displayName: "Heel-Toe Change",
    family: "articulation",
    input: "brush",
    styles: ALL_STYLES,
    durationTicks: FROLIC_PPQ,
    exitRule: "opposite",
    contacts: [
      contact(0, "lead", "heel", 0.58, "heel"),
      contact(24, "lead", "toe", 0.6, "toeBall"),
      contact(48, "trail", "heel", 0.62, "heel"),
      contact(72, "trail", "toe", 0.64, "toeBall"),
    ],
    rootMotion: { forward: 0, lateral: 1 },
    directionOptions: ["neutral", "left", "right"],
    entryTags: ["standing", "open", "balanced"],
    exitTags: ["standing", "open", "weighted"],
    transitionTags: ["weight-shift"],
    scoreTraits: ["articulation", "clarity", "motif"],
    difficulty: 2,
    sourceNotes: [
      "Heel and toe articulation is treated as a general percussive principle, not a named historical reconstruction.",
    ],
  }),
  movement({
    id: "dragSlide",
    displayName: "Drag-Slide",
    family: "travel",
    input: "brush",
    styles: ["flatfoot", "buck"],
    durationTicks: FROLIC_PPQ * 2,
    exitRule: "opposite",
    contacts: [
      contact(0, "lead", "flat", 0.5, "softSole"),
      contact(30, "trail", "drag", 0.5, "drag"),
      contact(84, "trail", "slide", 0.46, "slide"),
      contact(120, "trail", "flat", 0.58, "flatContact"),
      contact(162, "lead", "drag", 0.5, "drag"),
    ],
    rootMotion: { forward: 3, lateral: 2 },
    directionOptions: ["forward", "back", "left", "right"],
    entryTags: ["standing", "low", "weighted"],
    exitTags: ["standing", "low", "open"],
    transitionTags: ["slide-recover", "weight-shift"],
    scoreTraits: ["flow", "texture", "restraint"],
    difficulty: 2,
    sourceNotes: [
      "Close-to-floor drags and slides recur in flatfoot description and contemporary teaching.",
    ],
  }),
  movement({
    id: "rockStep",
    displayName: "Rock Step / Ball Change",
    family: "foundation",
    input: "drive",
    styles: ALL_STYLES,
    durationTicks: FROLIC_PPQ,
    exitRule: "same",
    contacts: [
      contact(0, "trail", "toe", 0.58, "toeBall"),
      contact(48, "lead", "flat", 0.7, "flatContact"),
      contact(72, "trail", "toe", 0.6, "toeBall"),
    ],
    rootMotion: { forward: 0, lateral: 1 },
    directionOptions: ["neutral", "back", "cross"],
    entryTags: ["standing", "open", "balanced"],
    exitTags: ["standing", "open", "weighted"],
    transitionTags: ["rear-recover", "weight-shift"],
    scoreTraits: ["foundation", "flow", "phrase-space"],
    difficulty: 1,
    sourceNotes: [
      "Rock-step structures appear in beginner clogging instruction; the game keeps the family broad across profiles.",
    ],
  }),
  movement({
    id: "doubleStep",
    displayName: "Double Step",
    family: "drive",
    input: "drive",
    styles: BUCK_CLOG,
    durationTicks: FROLIC_PPQ,
    exitRule: "opposite",
    contacts: [
      contact(0, "lead", "brush", 0.58, "brush"),
      contact(18, "lead", "toe", 0.66, "toeBall"),
      contact(36, "lead", "flat", 0.76, "flatContact"),
      contact(72, "trail", "flat", 0.72, "flatContact"),
    ],
    rootMotion: { forward: 2, lateral: 1 },
    directionOptions: ["neutral", "forward", "left", "right", "cross"],
    entryTags: ["standing", "open", "balanced"],
    exitTags: ["standing", "open", "weighted"],
    transitionTags: ["weight-shift", "brush-return"],
    scoreTraits: ["precision", "projection", "pattern"],
    difficulty: 2,
    sourceNotes: [
      "The double-toe/step structure follows documented beginning clogging instruction.",
    ],
  }),
  movement({
    id: "tripleStep",
    displayName: "Triple Step",
    family: "drive",
    input: "drive",
    styles: BUCK_CLOG,
    durationTicks: FROLIC_PPQ * 2,
    exitRule: "opposite",
    contacts: [
      contact(0, "lead", "brush", 0.58, "brush"),
      contact(18, "lead", "toe", 0.66, "toeBall"),
      contact(36, "lead", "flat", 0.78, "flatContact"),
      contact(72, "trail", "flat", 0.7, "flatContact"),
      contact(96, "lead", "brush", 0.6, "brush"),
      contact(114, "lead", "toe", 0.68, "toeBall"),
      contact(132, "lead", "flat", 0.8, "flatContact"),
      contact(168, "trail", "flat", 0.72, "flatContact"),
    ],
    rootMotion: { forward: 3, lateral: 2 },
    directionOptions: ["neutral", "forward", "left", "right"],
    entryTags: ["standing", "open", "balanced"],
    exitTags: ["standing", "open", "weighted"],
    transitionTags: ["weight-shift", "brush-return"],
    scoreTraits: ["precision", "pattern", "projection"],
    difficulty: 3,
    sourceNotes: [
      "Triple-step vocabulary is documented in clogging instruction; this clip is an original Kaki-Dance phrase.",
    ],
  }),
  movement({
    id: "crisscross",
    displayName: "Crisscross / Scissor Step",
    family: "lick",
    input: "lick",
    styles: ALL_STYLES,
    durationTicks: FROLIC_PPQ * 2,
    exitRule: "opposite",
    contacts: [
      contact(0, "trail", "flat", 0.56, "flatContact"),
      contact(48, "lead", "toe", 0.72, "toeBall"),
      contact(96, "trail", "toe", 0.76, "toeBall"),
      contact(144, "lead", "flat", 0.8, "flatContact"),
    ],
    rootMotion: { forward: 1, lateral: 3 },
    directionOptions: ["cross", "left", "right"],
    entryTags: ["standing", "open", "balanced"],
    exitTags: ["standing", "crossed", "weighted"],
    transitionTags: ["cross-recover"],
    scoreTraits: ["signature", "syncopation", "silhouette"],
    difficulty: 3,
    sourceNotes: [
      "Thomas Maupin is documented for crisscrossing and scissor steps.",
      "The game treats this as a broad movement family and does not reproduce Maupin's personal signature phrase.",
    ],
  }),
  movement({
    id: "turnaround",
    displayName: "Turnaround",
    family: "lick",
    input: "lick",
    styles: ALL_STYLES,
    durationTicks: FROLIC_PPQ * 2,
    exitRule: "same",
    contacts: [
      contact(0, "lead", "flat", 0.66, "flatContact"),
      contact(48, "trail", "toe", 0.74, "toeBall"),
      contact(96, "lead", "heel", 0.78, "heel"),
      contact(144, "trail", "flat", 0.9, "heavyAccent"),
    ],
    rootMotion: { forward: 0, lateral: 3 },
    directionOptions: ["turn-left", "turn-right"],
    entryTags: ["standing", "open", "crossed", "weighted"],
    exitTags: ["standing", "open", "resolved"],
    transitionTags: ["turn-resolve"],
    scoreTraits: ["phrase-ending", "confidence", "tune"],
    difficulty: 2,
    sourceNotes: [
      "An original game turnaround built from general weight-transfer and phrase-ending principles.",
    ],
  }),
  movement({
    id: "controlledEnding",
    displayName: "Controlled Ending",
    family: "lick",
    input: "lick",
    styles: ALL_STYLES,
    durationTicks: FROLIC_PPQ * 2,
    exitRule: "same",
    contacts: [
      contact(0, "lead", "toe", 0.68, "toeBall"),
      contact(72, "trail", "heel", 0.76, "heel"),
      contact(144, "both", "flat", 1, "heavyAccent"),
    ],
    rootMotion: { forward: 0, lateral: 0 },
    directionOptions: ["neutral"],
    entryTags: ["standing", "open", "crossed", "weighted"],
    exitTags: ["standing", "closed", "resolved"],
    transitionTags: ["turn-resolve"],
    scoreTraits: ["phrase-ending", "restraint", "control"],
    difficulty: 2,
    sourceNotes: [
      "An original Kaki-Dance ending; it is not presented as a named traditional step.",
    ],
  }),
];

export const FOOTWORK_CATALOG = deepFreeze(Object.fromEntries(rawCatalog.map((value) => [
  value.id,
  {
    ...value,
    animationByHeroAndStyle: animationMap(value.id, value.styles),
    audioSampleIds: Object.freeze([...new Set(value.contacts.map((entry) => entry.sampleGroup))]),
  },
])));

export const FOOTWORK_IDS = Object.freeze(Object.keys(FOOTWORK_CATALOG));
export const CORE_FOOTWORK_IDS = Object.freeze(FOOTWORK_IDS.filter(
  (id) => !["turnaround", "controlledEnding"].includes(id),
));

export function getFootwork(id) {
  return FOOTWORK_CATALOG[id] ?? null;
}

export function footworkForStyle(style) {
  const normalized = normalizeFrolicStyle(style);
  return Object.values(FOOTWORK_CATALOG).filter((move) => move.styles.includes(normalized));
}

export function normalizeFrolicStyle(value) {
  return FROLIC_STYLE_IDS.includes(value) ? value : "flatfoot";
}

export function oppositeFoot(foot) {
  return foot === "right" ? "left" : "right";
}

export function resolveExitFoot(move, entryFoot) {
  const normalized = entryFoot === "right" ? "right" : "left";
  if (!move) return normalized;
  return move.exitRule === "opposite" ? oppositeFoot(normalized) : normalized;
}

export function resolveContactFoot(contactValue, entryFoot) {
  if (contactValue === "both") return "both";
  const lead = entryFoot === "right" ? "right" : "left";
  return contactValue === "trail" ? oppositeFoot(lead) : lead;
}

export function resolvedContacts(move, entryFoot) {
  return Object.freeze((move?.contacts ?? []).map((value) => Object.freeze({
    ...value,
    foot: resolveContactFoot(value.foot, entryFoot),
  })));
}

export function validateFootworkCatalog(catalog = FOOTWORK_CATALOG) {
  const errors = [];
  for (const [id, move] of Object.entries(catalog)) {
    if (move.id !== id) errors.push(`${id} key and id differ.`);
    if (!(move.durationTicks > 0)) errors.push(`${id} needs a positive duration.`);
    if (!move.styles?.length || !move.styles.every((style) => FROLIC_STYLE_IDS.includes(style))) {
      errors.push(`${id} has invalid style availability.`);
    }
    if (!["same", "opposite"].includes(move.exitRule)) errors.push(`${id} has an invalid exit-foot rule.`);
    if (!move.contacts?.length) errors.push(`${id} needs contact metadata.`);
    for (const value of move.contacts ?? []) {
      if (!(value.tick >= 0 && value.tick < move.durationTicks)) {
        errors.push(`${id} contact ${value.tick} is outside its clip.`);
      }
      if (!["lead", "trail", "both"].includes(value.foot)) errors.push(`${id} has an invalid contact foot.`);
      if (!(value.intensity >= 0 && value.intensity <= 1)) errors.push(`${id} has an invalid intensity.`);
    }
    for (const hero of ["kitty", "soder"]) {
      for (const style of move.styles ?? []) {
        if (!move.animationByHeroAndStyle?.[hero]?.[style]) {
          errors.push(`${id} lacks ${hero}/${style} animation.`);
        }
      }
    }
  }
  return errors;
}

function movement(value) {
  return {
    entryFoot: "either",
    balanceRequirements: ["supporting-leg-under-pelvis", "free-foot-clear"],
    requiredTransitionClips: ["weightShift"],
    ...value,
  };
}

function contact(tick, foot, articulation, intensity, sampleGroup) {
  return Object.freeze({ tick, foot, articulation, intensity, sampleGroup });
}

function animationMap(id, styles) {
  return Object.freeze(Object.fromEntries(["kitty", "soder"].map((hero) => [
    hero,
    Object.freeze(Object.fromEntries(styles.map((style) => [
      style,
      `frolic-${style}-${id}`,
    ]))),
  ])));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
