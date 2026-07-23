import { DEFAULT_BEATMAP } from "./audio/beatmap.js";
import { characterDefinition } from "./dance/character-catalog.js";
import { getMoveDefinition } from "./dance/move-catalog.js";
import { goldenChainIds } from "./dance/move-session.js";
import { drawPixelText } from "./render/pixel-font.js";
import { pixelLine, pixelRect } from "./render/primitives.js";
import { drawDancer } from "./render/dancer.js";
import { buildMoveQaSnapshot } from "./render/qa-frame.js";

const GOLDEN_KEYS = Object.freeze([
  ["basicRock", 0.24, "LEFT WEIGHT"],
  ["basicRock", 0.5, "CENTER POCKET"],
  ["basicRock", 0.76, "RIGHT WEIGHT"],
  ["basicGoDown", 0.12, "LIFT"],
  ["basicGoDown", 0.48, "REACH"],
  ["basicGoDown", 0.78, "WEIGHT TRANSFER"],
  ["basicGoDown", 1, "FLOOR READY"],
  ["sixStep", 0, "ONE"],
  ["sixStep", 1 / 6, "TWO"],
  ["sixStep", 2 / 6, "THREE"],
  ["sixStep", 0.5, "FOUR"],
  ["sixStep", 4 / 6, "FIVE"],
  ["sixStep", 5 / 6, "SIX"],
  ["windmill", 0, "LEFT SHOULDER"],
  ["windmill", 0.16, "SHOULDER ROLL"],
  ["windmill", 0.32, "BACK SCISSOR"],
  ["windmill", 0.5, "HIP WHIP"],
  ["windmill", 0.68, "RIGHT SHOULDER"],
  ["windmill", 0.82, "PAW KICK"],
  ["babyFreeze", 0.16, "LOAD"],
  ["babyFreeze", 0.28, "LOCK"],
  ["babyFreeze", 0.55, "HOLD"],
  ["cleanGetUp", 0, "RELEASE"],
  ["cleanGetUp", 0.16, "PLACE FOOT"],
  ["cleanGetUp", 0.34, "PUSH"],
  ["cleanGetUp", 0.55, "TORSO RISE"],
  ["cleanGetUp", 0.76, "RISE"],
  ["cleanGetUp", 1, "READY"],
]);

const CHAIN = goldenChainIds().map((id) => getMoveDefinition(id));
const CHAIN_BEATS = CHAIN.reduce((sum, move) => sum + move.durationBeats, 0);
const TRANSITION_BEATS = 0.22;
const canvas = document.getElementById("hero-lab-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const zoomCanvases = [
  document.getElementById("hero-lab-2x"),
  document.getElementById("hero-lab-4x"),
];
const controls = {
  chain: document.getElementById("hero-chain"),
  move: document.getElementById("hero-move"),
  speed: document.getElementById("hero-speed"),
  phase: document.getElementById("hero-phase"),
  phaseOutput: document.getElementById("hero-phase-output"),
  stamina: document.getElementById("hero-stamina"),
  staminaOutput: document.getElementById("hero-stamina-output"),
  balance: document.getElementById("hero-balance"),
  balanceOutput: document.getElementById("hero-balance-output"),
  previous: document.getElementById("hero-prev-frame"),
  next: document.getElementById("hero-next-frame"),
  mirror: document.getElementById("hero-mirror"),
  onion: document.getElementById("hero-onion"),
  skeleton: document.getElementById("hero-skeleton"),
  jointNames: document.getElementById("hero-joint-names"),
  contacts: document.getElementById("hero-contacts"),
  com: document.getElementById("hero-com"),
  support: document.getElementById("hero-support"),
  silhouette: document.getElementById("hero-silhouette"),
  zOrder: document.getElementById("hero-z-order"),
  boneWarnings: document.getElementById("hero-bone-warnings"),
  capture: document.getElementById("hero-capture"),
  readout: document.getElementById("hero-lab-readout"),
  track: document.getElementById("chain-track"),
  kittyStatus: document.getElementById("kitty-bone-status"),
  kittyMetrics: document.getElementById("kitty-rig-metrics"),
  soderStatus: document.getElementById("soder-bone-status"),
  soderMetrics: document.getElementById("soder-rig-metrics"),
};

let phase = 0;
let chainBeat = 0;
let lastTime = performance.now();
let activeSnapshots = null;

for (const move of CHAIN) {
  const option = document.createElement("option");
  option.value = move.id;
  option.textContent = move.displayName;
  controls.move.append(option);
  const segment = document.createElement("span");
  segment.title = move.displayName;
  controls.track.append(segment);
}

for (const control of Object.values(controls)) {
  if (!control?.addEventListener) continue;
  control.addEventListener("input", () => {
    if (control === controls.phase) {
      phase = Number(controls.phase.value);
      controls.chain.checked = false;
    }
    if (control === controls.move) {
      phase = 0;
      controls.phase.value = "0";
      controls.chain.checked = false;
    }
    render();
  });
}

controls.previous.addEventListener("click", () => stepDrawing(-1));
controls.next.addEventListener("click", () => stepDrawing(1));
controls.capture.addEventListener("click", () => downloadCanvas(
  canvas,
  `kaki-dance-hero-lab-${controls.move.value}-${phase.toFixed(3)}.png`,
));

buildContactSheet();
requestAnimationFrame(tick);

function tick(time) {
  const dt = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
  lastTime = time;
  const speed = Number(controls.speed.value);
  if (speed > 0) {
    if (controls.chain.checked) {
      chainBeat = (chainBeat + dt * DEFAULT_BEATMAP.bpm / 60 * speed) % CHAIN_BEATS;
      const state = chainStateAt(chainBeat);
      controls.move.value = state.move.id;
      phase = state.phase;
    } else {
      const move = getMoveDefinition(controls.move.value);
      const durationSeconds = move.durationBeats * 60 / DEFAULT_BEATMAP.bpm;
      phase = (phase + dt * speed / durationSeconds) % 1;
    }
    controls.phase.value = String(phase);
  }
  render();
  requestAnimationFrame(tick);
}

function render() {
  ctx.imageSmoothingEnabled = false;
  drawDeskBackground(ctx);
  const move = getMoveDefinition(controls.move.value);
  const chainState = controls.chain.checked ? chainStateAt(chainBeat) : null;
  const transitionFrom = chainState?.previousMove?.id ?? "";
  const transitionProgress = chainState?.transitionProgress ?? 1;
  const options = {
    moveId: move.id,
    phase,
    mirror: controls.mirror.checked,
    transitionFrom,
    transitionProgress,
    beat: 16 + chainBeat,
    stamina: Number(controls.stamina.value),
    balance: Number(controls.balance.value),
    wobble: Math.max(0, (Math.abs(Number(controls.balance.value)) - 0.62) * 0.72),
  };
  const kitty = buildMoveQaSnapshot({ ...options, character: "kitty" });
  const soder = buildMoveQaSnapshot({ ...options, character: "soder" });
  activeSnapshots = { kitty, soder };
  const debug = {
    skeleton: controls.skeleton.checked,
    jointNames: controls.jointNames.checked,
    contacts: controls.contacts.checked,
    com: controls.com.checked,
    zOrder: controls.zOrder.checked,
    boneWarnings: controls.boneWarnings.checked,
  };
  if (controls.onion.checked && !controls.silhouette.checked) {
    drawOnionSkin(ctx, options, "kitty", kitty.character, 111);
    drawOnionSkin(ctx, options, "soder", soder.character, 273);
  }
  drawDancer(ctx, kitty.dancer, kitty.character, {
    x: 111,
    floorY: 162,
    scale: 1.72,
    silhouette: controls.silhouette.checked,
    debug,
  });
  drawDancer(ctx, soder.dancer, soder.character, {
    x: 273,
    floorY: 162,
    scale: 1.72,
    silhouette: controls.silhouette.checked,
    debug,
  });
  if (controls.support.checked) {
    drawSupport(ctx, kitty, 111, 162, 1.72);
    drawSupport(ctx, soder, 273, 162, 1.72);
  }
  drawDeskLabels(ctx, move);
  copyZooms();
  updateReadout(move, kitty, soder, transitionFrom, transitionProgress);
  updateTrack(move.id);
}

function drawDeskBackground(target) {
  pixelRect(target, 0, 0, 384, 216, "#0b1020");
  for (let x = 0; x <= 384; x += 12) pixelRect(target, x, 0, 1, 216, "rgba(41,67,93,0.26)");
  for (let y = 0; y <= 216; y += 12) pixelRect(target, 0, y, 384, 1, "rgba(41,67,93,0.26)");
  pixelRect(target, 191, 12, 1, 181, "#29435d");
  pixelRect(target, 14, 162, 356, 1, "#63d6b3");
  pixelRect(target, 14, 163, 356, 1, "#14293a");
  drawRegistration(target, 111, 162);
  drawRegistration(target, 273, 162);
}

function drawRegistration(target, x, y) {
  pixelLine(target, { x: x - 5, y }, { x: x + 5, y }, 1, "#29435d");
  pixelLine(target, { x, y: y - 5 }, { x, y: y + 5 }, 1, "#29435d");
}

function drawDeskLabels(target, move) {
  drawPixelText(target, "KITTYKAKI", 111, 181, {
    align: "center",
    color: "#f5e9c9",
    shadow: "#080b18",
    scale: 1,
  });
  drawPixelText(target, "SODER", 273, 181, {
    align: "center",
    color: "#f5e9c9",
    shadow: "#080b18",
    scale: 1,
  });
  drawPixelText(target, move.displayName, 192, 199, {
    align: "center",
    color: "#63d6b3",
    shadow: "#080b18",
    scale: 1,
  });
}

function drawOnionSkin(target, options, character, definition, x) {
  const move = getMoveDefinition(options.moveId);
  const durationSeconds = move.durationBeats * 60 / DEFAULT_BEATMAP.bpm;
  const drawings = Math.max(2, Math.round(durationSeconds * move.poseCadence));
  const step = 1 / drawings;
  for (const [offset, alpha] of [[-step, 0.12], [step, 0.08]]) {
    const snapshot = buildMoveQaSnapshot({
      ...options,
      character,
      phase: Math.max(0, Math.min(1, phase + offset)),
      transitionFrom: "",
      transitionProgress: 1,
    });
    drawDancer(target, snapshot.dancer, definition, {
      x,
      floorY: 162,
      scale: 1.72,
      alpha,
      ghost: true,
    });
  }
}

function drawSupport(target, snapshot, x, floorY, scale) {
  const support = snapshot.dancer.contacts.support;
  if (!support.count) return;
  const minimum = Math.round(x + support.min * scale);
  const maximum = Math.round(x + support.max * scale);
  pixelLine(target, { x: minimum, y: floorY + 6 }, { x: maximum, y: floorY + 6 }, 2, "#f4c95d");
  pixelRect(target, minimum - 1, floorY + 4, 2, 5, "#f4c95d");
  pixelRect(target, maximum - 1, floorY + 4, 2, 5, "#f4c95d");
}

function copyZooms() {
  for (const zoom of zoomCanvases) {
    const zoomContext = zoom.getContext("2d", { alpha: false });
    zoomContext.imageSmoothingEnabled = false;
    zoomContext.clearRect(0, 0, 384, 216);
    zoomContext.drawImage(canvas, 0, 0);
  }
}

function updateReadout(move, kitty, soder, transitionFrom, transitionProgress) {
  controls.phaseOutput.textContent = phase.toFixed(3);
  controls.staminaOutput.textContent = String(Math.round(Number(controls.stamina.value)));
  controls.balanceOutput.textContent = Number(controls.balance.value).toFixed(2);
  const contacts = kitty.dancer.contacts.contacts.map((contact) => contact.limb).join(", ") || "air";
  const bridge = transitionFrom && transitionProgress < 1
    ? `bridge ${transitionFrom} ${(transitionProgress * 100).toFixed(0)}%`
    : "authored clip";
  controls.readout.textContent = `${move.displayName} · ${kitty.dancer.pose.label} · phase ${phase.toFixed(3)} · ${contacts} · ${bridge}`;
  updateCharacterMetrics("kitty", kitty);
  updateCharacterMetrics("soder", soder);
}

function updateCharacterMetrics(id, snapshot) {
  const rig = snapshot.dancer.rig;
  const status = controls[`${id}Status`];
  const metrics = controls[`${id}Metrics`];
  const contactError = snapshot.dancer.contacts.measured.largest;
  const healthy = rig.topology === "biped"
    && rig.maxBoneLengthError <= 1e-6
    && contactError <= 0.01
    && rig.finite;
  status.textContent = healthy ? "BIPED · CLEAN" : "CHECK RIG";
  status.style.color = healthy ? "#63d6b3" : "#f46b45";
  metrics.textContent = `bone Δ ${rig.maxBoneLengthError.toExponential(1)} · contact ${contactError.toExponential(1)} · ${rig.warnings.length} warnings`;
}

function updateTrack(moveId) {
  [...controls.track.children].forEach((element, index) => {
    element.classList.toggle("is-current", CHAIN[index].id === moveId);
  });
}

function stepDrawing(direction) {
  const move = getMoveDefinition(controls.move.value);
  const durationSeconds = move.durationBeats * 60 / DEFAULT_BEATMAP.bpm;
  const drawings = Math.max(2, Math.round(durationSeconds * move.poseCadence));
  phase = Math.max(0, Math.min(1, phase + direction / drawings));
  controls.phase.value = String(phase);
  controls.speed.value = "0";
  controls.chain.checked = false;
  render();
}

function chainStateAt(beat) {
  let cursor = 0;
  for (let index = 0; index < CHAIN.length; index += 1) {
    const move = CHAIN[index];
    const end = cursor + move.durationBeats;
    if (beat < end || index === CHAIN.length - 1) {
      const localBeat = beat - cursor;
      return {
        move,
        previousMove: index > 0 ? CHAIN[index - 1] : CHAIN.at(-1),
        phase: Math.max(0, Math.min(1, localBeat / move.durationBeats)),
        transitionProgress: localBeat < TRANSITION_BEATS
          ? localBeat / TRANSITION_BEATS
          : 1,
      };
    }
    cursor = end;
  }
  return { move: CHAIN[0], previousMove: CHAIN.at(-1), phase: 0, transitionProgress: 0 };
}

function buildContactSheet() {
  const host = document.getElementById("hero-contact-sheet");
  for (const [moveId, keyPhase, label] of GOLDEN_KEYS) {
    const figure = document.createElement("figure");
    figure.className = "contact-card";
    const cardCanvas = document.createElement("canvas");
    cardCanvas.width = 384;
    cardCanvas.height = 216;
    const cardContext = cardCanvas.getContext("2d", { alpha: false });
    drawDeskBackground(cardContext);
    for (const [character, x] of [["kitty", 111], ["soder", 273]]) {
      const snapshot = buildMoveQaSnapshot({
        moveId,
        phase: keyPhase,
        character,
        beat: 16 + keyPhase,
      });
      drawDancer(cardContext, snapshot.dancer, characterDefinition(character), {
        x,
        floorY: 162,
        scale: 1.72,
      });
    }
    const move = getMoveDefinition(moveId);
    drawDeskLabels(cardContext, move);
    const caption = document.createElement("figcaption");
    const name = document.createElement("span");
    name.textContent = `${move.displayName} · ${label}`;
    const phaseLabel = document.createElement("span");
    phaseLabel.textContent = keyPhase.toFixed(3);
    caption.append(name, phaseLabel);
    figure.append(cardCanvas, caption);
    figure.addEventListener("click", () => downloadCanvas(
      cardCanvas,
      `kaki-dance-heroes-${moveId}-${keyPhase.toFixed(3)}.png`,
    ));
    host.append(figure);
  }
}

function downloadCanvas(source, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = source.toDataURL("image/png");
  link.click();
}

globalThis.heroLab = Object.freeze({
  setState({
    moveId,
    nextPhase,
    mirror,
    chain,
    nextChainBeat,
    speed,
    stamina,
    balance,
  } = {}) {
    if (moveId && getMoveDefinition(moveId)) controls.move.value = moveId;
    if (Number.isFinite(nextPhase)) {
      phase = Math.max(0, Math.min(1, nextPhase));
      controls.phase.value = String(phase);
    }
    if (typeof mirror === "boolean") controls.mirror.checked = mirror;
    if (typeof chain === "boolean") controls.chain.checked = chain;
    if (Number.isFinite(nextChainBeat)) chainBeat = ((nextChainBeat % CHAIN_BEATS) + CHAIN_BEATS) % CHAIN_BEATS;
    if (Number.isFinite(speed)) controls.speed.value = String(speed);
    if (Number.isFinite(stamina)) controls.stamina.value = String(Math.max(0, Math.min(100, stamina)));
    if (Number.isFinite(balance)) controls.balance.value = String(Math.max(-1.25, Math.min(1.25, balance)));
    render();
  },
  render,
  getState() {
    return {
      moveId: controls.move.value,
      phase,
      chainBeat,
      chain: controls.chain.checked,
      mirror: controls.mirror.checked,
      stamina: Number(controls.stamina.value),
      balance: Number(controls.balance.value),
      snapshots: activeSnapshots,
    };
  },
  canvas,
  chainBeats: CHAIN_BEATS,
});
