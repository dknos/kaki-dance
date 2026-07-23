import { deepFreeze } from "../core/math.js";

export const CHARACTER_CATALOG = deepFreeze({
  kitty: {
    id: "kitty",
    displayName: "KittyKaki",
    shortName: "KAKI",
    rig: "kaki",
    portrait: "./assets/portraits/kittykaki.webp",
    description: "Plush precision, expressive paws, bright musical accents.",
    palette: {
      fur: "#f5e9c9",
      furShade: "#c9bda6",
      hair: "#4db8e8",
      hairShade: "#2776b8",
      hoodie: "#17172f",
      hoodieLight: "#30345d",
      accent: "#f46b45",
      outline: "#090b1b",
    },
    moveNames: {},
  },
  soder: {
    id: "soder",
    displayName: "Soder",
    shortName: "SODER",
    rig: "soder",
    portrait: "./assets/portraits/soder.png",
    description: "Coil momentum, elastic shapes, tremendous tongue control.",
    palette: {
      fur: "#e4d8c5",
      furShade: "#b7aa98",
      hair: "#4db8e8",
      hairShade: "#2776b8",
      hoodie: "#669b3f",
      hoodieLight: "#91c45d",
      accent: "#e178a5",
      belly: "#9b7049",
      outline: "#090b1b",
    },
    moveNames: {
      basicRock: "COIL ROCK",
      sixStep: "SCALE SIX",
      coffeeGrinder: "TAIL GRINDER",
      backspin: "TAILSPIN",
      swipe: "SNEK SWIPE",
      windmill: "SODER SPIRAL",
      flare: "COIL FLARE",
      headspin: "HOODSPIN",
      babyFreeze: "POCKET COIL",
      chairFreeze: "SNEK CHAIR",
      turtleFreeze: "SHELL FREEZE",
      headstandFreeze: "HOODSTAND",
    },
  },
});

export const PLAYABLE_CHARACTER_IDS = Object.freeze(Object.keys(CHARACTER_CATALOG));

export function normalizeCharacterId(value) {
  const id = typeof value === "string" ? value : value?.id;
  return Object.hasOwn(CHARACTER_CATALOG, id) ? id : "kitty";
}

export function characterDefinition(value) {
  return CHARACTER_CATALOG[normalizeCharacterId(value)];
}

export function characterMoveName(character, move) {
  const definition = characterDefinition(character);
  return definition.moveNames[move.id] ?? move.displayName;
}

export const CROWD_PROFILES = deepFreeze([
  { id: "aoiPaw", ears: "cat", hair: "blue", outfit: "ink", accent: "mint", prop: "paw", energy: 0.78 },
  { id: "mossHood", ears: "hood", hair: "aqua", outfit: "moss", accent: "lavender", prop: "hood", energy: 0.92 },
  { id: "lilacBow", ears: "fox", hair: "cream", outfit: "lavender", accent: "lavender", prop: "bow", energy: 0.72 },
  { id: "nightPhones", ears: "cat", hair: "navy", outfit: "aqua", accent: "lavender", prop: "phones", energy: 0.86 },
  { id: "berryBun", ears: "rabbit", hair: "pink", outfit: "pink", accent: "mint", prop: "ribbon", energy: 0.68 },
  { id: "denimWolf", ears: "wolf", hair: "slate", outfit: "denim", accent: "moon", prop: "mic", energy: 0.96 },
  { id: "cherryCat", ears: "cat", hair: "brown", outfit: "plum", accent: "pink", prop: "cherries", energy: 0.82 },
  { id: "mintMouse", ears: "mouse", hair: "mint", outfit: "moon", accent: "gold", prop: "flower", energy: 0.74 },
  { id: "ramJam", ears: "ram", hair: "lavender", outfit: "lavender", accent: "gold", prop: "horns", energy: 0.88 },
  { id: "blockCap", ears: "fox", hair: "caramel", outfit: "persimmon", accent: "moon", prop: "cap", energy: 1 },
  { id: "moonBeanie", ears: "rabbit", hair: "ice", outfit: "denim", accent: "gold", prop: "beanie", energy: 0.64 },
  { id: "pawPom", ears: "cat", hair: "pink", outfit: "pink", accent: "moon", prop: "poms", energy: 0.94 },
]);
