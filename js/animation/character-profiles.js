import { deepFreeze } from "../core/math.js";

export const BIPED_ANCHOR_NAMES = Object.freeze([
  "root",
  "pelvis",
  "chest",
  "neck",
  "head",
  "leftShoulder",
  "leftElbow",
  "leftWrist",
  "leftHand",
  "rightShoulder",
  "rightElbow",
  "rightWrist",
  "rightHand",
  "leftHip",
  "leftKnee",
  "leftAnkle",
  "leftFoot",
  "rightHip",
  "rightKnee",
  "rightAnkle",
  "rightFoot",
]);

const SHARED_BIPED = {
  torsoLength: 7.4,
  neckLength: 2.2,
  shoulderSpread: 6.25,
  hipSpread: 3.5,
  upperArmLength: 9.7,
  forearmLength: 8.8,
  handLength: 3.4,
  thighLength: 10.35,
  shinLength: 9.95,
  footLength: 6.2,
  elbowLimits: [0.22, 2.92],
  kneeLimits: [0.32, 2.96],
};

const SHARED_BEND_PREFERENCES = {
  leftArm: -1,
  rightArm: 1,
  leftLeg: 1,
  rightLeg: -1,
};

export const kittyProfile = deepFreeze({
  id: "kitty",
  topology: "biped",
  skeleton: { ...SHARED_BIPED },
  bendPreferences: { ...SHARED_BEND_PREFERENCES },
  volumes: {
    upperArm: [3.8, 3.25],
    forearm: [3.2, 2.55],
    thigh: [4.75, 4.05],
    shin: [3.9, 3.1],
    hand: [3.25, 2.45],
    foot: [5.15, 2.7],
    pelvis: [7.2, 4.7],
    chest: [7.8, 7.2],
    head: [10.2, 9.25],
  },
  costume: {
    kind: "kittyStreetwear",
    sleeveBreak: 0.54,
    trouserBreak: 0.52,
    cuffWidth: 2.75,
    ankleWidth: 2.9,
    hoodDepth: 2.2,
  },
  palette: {
    fur: "#f5e9c9",
    furShade: "#c9bda6",
    furHighlight: "#fff8df",
    hair: "#4db8e8",
    hairShade: "#2776b8",
    hairHighlight: "#7ad8f5",
    torso: "#17172f",
    torsoLight: "#30345d",
    pants: "#121329",
    pantsLight: "#292d52",
    pantsShade: "#090a19",
    cuff: "#f5e9c9",
    shoe: "#17172f",
    shoeLight: "#343961",
    sole: "#090b1b",
    accent: "#f46b45",
    outline: "#090b1b",
  },
  secondaryMotion: {
    headDrag: 0.18,
    earLag: 0.52,
    tailLag: 0.68,
    costumeBounce: 0.2,
  },
});

export const soderProfile = deepFreeze({
  id: "soder",
  topology: "biped",
  // Soder wears more volume on the same athletic biped skeleton.
  skeleton: { ...SHARED_BIPED },
  bendPreferences: { ...SHARED_BEND_PREFERENCES },
  volumes: {
    upperArm: [4.25, 3.55],
    forearm: [3.65, 2.8],
    thigh: [5.15, 4.35],
    shin: [4.35, 3.4],
    hand: [3.2, 2.4],
    foot: [5.35, 2.8],
    pelvis: [7.65, 5.05],
    chest: [8.35, 7.65],
    head: [10.1, 9.15],
  },
  costume: {
    kind: "snakeKigurumi",
    sleeveBreak: 0.62,
    trouserBreak: 0.58,
    cuffWidth: 3.05,
    ankleWidth: 3.15,
    hoodDepth: 3.2,
  },
  palette: {
    fur: "#e4d8c5",
    furShade: "#b7aa98",
    furHighlight: "#fff1d9",
    hair: "#4db8e8",
    hairShade: "#2776b8",
    hairHighlight: "#78d6ef",
    torso: "#5f963b",
    torsoLight: "#8bc45a",
    torsoShade: "#3f6f2d",
    pants: "#568c35",
    pantsLight: "#7eb64e",
    pantsShade: "#3c6b2d",
    cuff: "#3c692d",
    shoe: "#4f8434",
    shoeLight: "#86bb50",
    sole: "#17251a",
    belly: "#9b7049",
    bellyLight: "#c4925d",
    hoodMouth: "#4f2340",
    accent: "#e178a5",
    outline: "#090b1b",
  },
  secondaryMotion: {
    headDrag: 0.2,
    earLag: 0,
    tailLag: 0.84,
    costumeBounce: 0.42,
  },
});

export const CHARACTER_PROFILES = deepFreeze({
  kitty: kittyProfile,
  soder: soderProfile,
});

export function getCharacterProfile(value) {
  const id = typeof value === "string"
    ? value
    : value?.profileId ?? value?.id;
  return CHARACTER_PROFILES[id] ?? kittyProfile;
}
