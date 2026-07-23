import { MOVE_FAMILIES, MOVE_CATALOG, getMoveDefinition } from "./dance/move-catalog.js";
import { goldenChainIds } from "./dance/move-session.js";
import { KakiDanceRenderer } from "./render/renderer.js";
import { buildMoveQaSnapshot } from "./render/qa-frame.js";

const controls = {
  character: document.getElementById("qa-character"),
  family: document.getElementById("qa-family"),
  reduced: document.getElementById("qa-reduced"),
  rebuild: document.getElementById("qa-rebuild"),
};
const galleries = {
  golden: document.getElementById("golden-gallery"),
  moves: document.getElementById("move-gallery"),
  edges: document.getElementById("edge-gallery"),
};

for (const family of MOVE_FAMILIES) {
  const option = document.createElement("option");
  option.value = family;
  option.textContent = family.toUpperCase();
  controls.family.append(option);
}
const requestedFamily = new URLSearchParams(globalThis.location?.search ?? "").get("family");
if (requestedFamily === "all" || MOVE_FAMILIES.includes(requestedFamily)) {
  controls.family.value = requestedFamily;
}
controls.rebuild.addEventListener("click", rebuild);
controls.character.addEventListener("change", rebuild);
controls.family.addEventListener("change", rebuild);
controls.reduced.addEventListener("change", rebuild);

rebuild();

function rebuild() {
  galleries.golden.replaceChildren();
  galleries.moves.replaceChildren();
  galleries.edges.replaceChildren();
  const character = controls.character.value;
  const reducedMotion = controls.reduced.checked;
  goldenChainIds().forEach((moveId, index) => {
    galleries.golden.append(createCard({
      label: `${index + 1}. ${getMoveDefinition(moveId).displayName}`,
      state: "golden",
      moveId,
      phase: moveId === "babyFreeze" ? 0.5 : 0.72,
      character,
      reducedMotion,
      beat: 16 + index * 2,
    }));
  });

  const family = controls.family.value;
  for (const move of Object.values(MOVE_CATALOG)) {
    if (family !== "all" && move.family !== family) continue;
    const accent = move.accentWindows.find((value) => value > 0.05 && value < 0.95) ?? 0.78;
    const phases = [
      ["entry", 0.04],
      ["mid", 0.5],
      ["accent", accent],
      ["exit", 0.96],
    ];
    for (const [state, phase] of phases) {
      galleries.moves.append(createCard({
        label: move.displayName,
        state,
        moveId: move.id,
        phase,
        character,
        reducedMotion,
      }));
    }
  }

  const edgeCases = [
    { label: "Baby Freeze", state: "stable", moveId: "babyFreeze", phase: 0.6, balance: 0.08, wobble: 0.08 },
    { label: "Baby Freeze", state: "failing", moveId: "babyFreeze", phase: 0.65, balance: 1.12, wobble: 1.05 },
    { label: "Windmill", state: "clockwise", moveId: "windmill", phase: 0.48, mirror: false },
    { label: "Windmill", state: "counterclockwise", moveId: "windmill", phase: 0.48, mirror: true },
    { label: "6-Step", state: "mirrored", moveId: "sixStep", phase: 0.66, mirror: true },
    { label: "Headspin", state: "signature", moveId: "headspin", phase: 0.52 },
    { label: "Battle", state: "opponent turn", moveId: "flare", phase: 0.72, mode: "battle", performer: "opponent" },
    { label: "Reduced motion", state: "windmill", moveId: "windmill", phase: 0.76, reducedMotion: true },
  ];
  for (const edge of edgeCases) {
    galleries.edges.append(createCard({ character, reducedMotion, ...edge }));
  }
}

function createCard(options) {
  const figure = document.createElement("figure");
  figure.className = "qa-card";
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 216;
  const caption = document.createElement("figcaption");
  const name = document.createElement("span");
  name.textContent = options.label;
  const state = document.createElement("span");
  state.textContent = options.state;
  caption.append(name, state);
  figure.append(canvas, caption);

  const snapshot = buildMoveQaSnapshot({
    moveId: options.moveId,
    phase: options.phase,
    character: options.character,
    mirror: options.mirror,
    balance: options.balance,
    wobble: options.wobble,
    reducedMotion: options.reducedMotion,
    beat: options.beat ?? 16 + options.phase,
    mode: options.mode,
    performer: options.performer,
  });
  const renderer = new KakiDanceRenderer(canvas, {
    settings: {
      beatPulse: true,
      reducedMotion: options.reducedMotion,
      reduceFlashes: true,
      screenShake: 0,
    },
  });
  renderer.render(snapshot);
  figure.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = `kaki-dance-${options.character}-${options.moveId}-${options.state}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
  return figure;
}
