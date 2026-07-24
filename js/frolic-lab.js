import {
  FROLIC_STYLE_PROFILES,
  footworkForStyle,
  getFootwork,
  normalizeFrolicStyle,
  resolveExitFoot,
  resolvedContacts,
} from "./appalachian/footwork-catalog.js";
import { FootworkTransitionGraph } from "./appalachian/transition-graph.js";
import { KakiDanceRenderer } from "./render/renderer.js";
import { FrolicAtlasRenderer, sharedFrolicAtlasLibrary } from "./render/frolic-atlas.js";

const elements = {
  hero: byId("frolic-hero"),
  style: byId("frolic-style"),
  move: byId("frolic-move"),
  entryFoot: byId("frolic-entry-foot"),
  speed: byId("frolic-speed"),
  phase: byId("frolic-phase"),
  phaseOutput: byId("frolic-phase-output"),
  fromMove: byId("frolic-from-move"),
  transition: byId("frolic-transition"),
  transitionReadout: byId("transition-readout"),
  skeleton: byId("frolic-skeleton"),
  contacts: byId("frolic-contacts"),
  centerOfMass: byId("frolic-com"),
  rootTrail: byId("frolic-root-trail"),
  bounds: byId("frolic-bounds"),
  metronome: byId("frolic-metronome"),
  sample: byId("frolic-sample"),
  playSample: byId("frolic-play-sample"),
  stage: byId("frolic-stage-canvas"),
  neutral: byId("frolic-neutral-canvas"),
  atlasPage: byId("frolic-atlas-page"),
  status: byId("lab-status"),
  stageReadout: byId("stage-readout"),
  packReadout: byId("pack-readout"),
  data: byId("frolic-data"),
};

const stageRenderer = new KakiDanceRenderer(elements.stage, {
  settings: {
    reducedMotion: true,
    screenShake: 0,
    reduceFlashes: true,
    timingLabels: false,
    beatPulse: false,
  },
});
const neutralRenderer = new FrolicAtlasRenderer();
const neutralContext = elements.neutral.getContext("2d", { alpha: false });
neutralContext.imageSmoothingEnabled = false;

const state = {
  hero: "kitty",
  style: "flatfoot",
  moveId: "walkingStep",
  entryFoot: "left",
  fromMoveId: "walkingStep",
  phase: 0,
  speed: 1,
  lastTime: performance.now(),
  lastBeat: -1,
};

populateSamples();
populateMoves();
bindControls();
await loadActivePack();
requestAnimationFrame(frame);

globalThis.frolicLab = Object.freeze({
  getState: () => snapshotState(),
  setState: async (patch = {}) => {
    Object.assign(state, patch);
    syncControls();
    if (patch.hero || patch.style) await loadActivePack();
    render();
    return snapshotState();
  },
  render,
  canvas: elements.stage,
  neutralCanvas: elements.neutral,
});

function bindControls() {
  for (const element of [
    elements.hero,
    elements.style,
    elements.move,
    elements.entryFoot,
    elements.speed,
    elements.fromMove,
    elements.transition,
    elements.skeleton,
    elements.contacts,
    elements.centerOfMass,
    elements.rootTrail,
    elements.bounds,
    elements.metronome,
  ]) {
    element.addEventListener("input", async () => {
      const previousHero = state.hero;
      const previousStyle = state.style;
      state.hero = elements.hero.value;
      state.style = normalizeFrolicStyle(elements.style.value);
      state.moveId = elements.move.value;
      state.entryFoot = elements.entryFoot.value;
      state.speed = Number(elements.speed.value);
      state.fromMoveId = elements.fromMove.value;
      if (previousStyle !== state.style) populateMoves();
      if (previousHero !== state.hero || previousStyle !== state.style) await loadActivePack();
      render();
    });
  }
  elements.phase.addEventListener("input", () => {
    state.phase = Number(elements.phase.value);
    state.speed = 0;
    elements.speed.value = "0";
    render();
  });
  elements.playSample.addEventListener("click", () => playSample(elements.sample.value));
}

function populateMoves() {
  const ids = footworkForStyle(state.style).map((move) => move.id);
  fillSelect(elements.move, ids, state.moveId);
  fillSelect(elements.fromMove, ids, state.fromMoveId);
  state.moveId = elements.move.value;
  state.fromMoveId = elements.fromMove.value;
}

function populateSamples() {
  const groups = [
    "softSole", "flatContact", "heel", "toeBall", "brush", "scuff", "chug",
    "drag", "slide", "tapHeel", "tapToe", "heavyAccent", "rivalBoard",
  ];
  for (const group of groups) {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    elements.sample.append(option);
  }
}

async function loadActivePack() {
  elements.status.textContent = "LOADING ACTIVE PACK…";
  sharedFrolicAtlasLibrary.releaseExcept(state.hero, state.style);
  const record = await neutralRenderer.preload(state.hero, state.style);
  await stageRenderer.enterMode("frolic", state.hero, state.style);
  if (record.status !== "ready") throw record.error ?? new Error("Frolic atlas pack failed.");
  elements.atlasPage.src = new URL(
    `../assets/heroes/${state.hero}/frolic/${state.style}/${record.metadata.pages[0]}`,
    import.meta.url,
  ).href;
  const decodedMiB = record.metadata.pages.reduce((sum, _page, index) => {
    const image = record.pages[index];
    return sum + image.naturalWidth * image.naturalHeight * 4;
  }, 0) / 1024 / 1024;
  const frameCount = Object.values(record.metadata.clips).reduce((sum, clip) => sum + clip.frames.length, 0);
  elements.packReadout.textContent = `${frameCount} FRAMES · ${decodedMiB.toFixed(2)} MIB DECODED`;
  elements.status.textContent = `${state.hero.toUpperCase()} / ${state.style.toUpperCase()} · READY`;
  render();
  requestAnimationFrame(() => {
    const viewport = elements.neutral.parentElement;
    viewport.scrollLeft = Math.max(0, (elements.neutral.clientWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (elements.neutral.clientHeight - viewport.clientHeight) * 0.58);
  });
}

function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - state.lastTime) / 1000));
  state.lastTime = now;
  if (state.speed > 0) {
    const move = getFootwork(state.moveId);
    const durationSeconds = move.durationTicks / 96 * 0.5;
    const previous = state.phase;
    state.phase = (state.phase + dt * state.speed / durationSeconds) % 1;
    if (elements.metronome.checked && state.phase < previous) clickMetronome();
    elements.phase.value = String(state.phase);
  }
  render();
  requestAnimationFrame(frame);
}

function render() {
  const move = getFootwork(state.moveId) ?? getFootwork("walkingStep");
  const transition = resolveTransition();
  const useTransition = elements.transition.checked && transition.ok;
  const presentationClip = useTransition ? transition.transitionClip : move.id;
  const dancer = Object.freeze({
    moveId: move.id,
    moveName: move.displayName,
    family: useTransition ? "transition" : move.family,
    presentationClip,
    presentationPhase: state.phase,
    phase: state.phase,
    entryFoot: state.entryFoot,
    exitFoot: state.entryFoot === "left" ? "right" : "left",
    supportingFoot: state.entryFoot,
    queuedMove: useTransition ? move.id : "",
    direction: 1,
    mirror: state.entryFoot === "right",
    rootX: rootOffset(move, state.phase),
    microResponse: 0,
    microFoot: state.entryFoot,
    stamina: 100,
    balance: { offset: 0, wobble: 0, failed: false },
  });
  const snapshot = labSnapshot(dancer);
  const debug = {
    skeleton: elements.skeleton.checked,
    contacts: elements.contacts.checked,
    centerOfMass: elements.centerOfMass.checked,
    bounds: elements.bounds.checked,
    pivot: elements.rootTrail.checked,
  };
  stageRenderer.setDebug({ frolic: debug });
  stageRenderer.render(snapshot);
  if (elements.rootTrail.checked) drawRootTrail(elements.stage.getContext("2d"), move);
  drawNeutral(dancer, debug);
  updateReadout(move, transition);
}

function drawNeutral(dancer, debug) {
  neutralContext.fillStyle = "#20262b";
  neutralContext.fillRect(0, 0, 192, 216);
  neutralContext.fillStyle = "#ded6bf";
  neutralContext.fillRect(192, 0, 192, 216);
  neutralContext.fillStyle = "#101418";
  neutralContext.fillRect(0, 178, 384, 38);
  neutralContext.fillStyle = "#f2bd65";
  neutralContext.fillRect(0, 177, 384, 1);
  neutralRenderer.draw(neutralContext, dancer, state.hero, state.style, {
    x: 192,
    floorY: 178,
    scale: 1.25,
    phase: state.phase,
    debug,
  });
}

function updateReadout(move, transition) {
  const record = sharedFrolicAtlasLibrary.get(state.hero, state.style);
  const selection = neutralRenderer.select(
    {
      presentationClip: elements.transition.checked && transition.ok ? transition.transitionClip : move.id,
      presentationPhase: state.phase,
    },
    state.hero,
    state.style,
  );
  const frameData = selection?.frame;
  const contacts = resolvedContacts(move, state.entryFoot);
  elements.phaseOutput.textContent = state.phase.toFixed(3);
  elements.stageReadout.textContent = `${move.displayName.toUpperCase()} · ${state.entryFoot.toUpperCase()} ENTRY`;
  elements.transitionReadout.textContent = transition.ok
    ? `${transition.transitionClip.toUpperCase()} · ${transition.transitionTicks} TICKS`
    : `BLOCKED · ${transition.reason}`;
  const anchors = frameData?.semanticAnchors ?? {};
  const leftFoot = anchors.leftFoot ?? [0, 0];
  const rightFoot = anchors.rightFoot ?? [0, 0];
  elements.data.textContent = [
    `PACK       ${record?.key ?? "loading"}`,
    `CLIP       ${selection?.clipId ?? "-"}`,
    `FRAME      ${selection?.frameIndex ?? "-"} / ${(selection?.clip?.frames?.length ?? 1) - 1}`,
    `TOPOLOGY   ${record?.metadata?.topology ?? "-"}`,
    `SUPPORT    ${frameData?.support ?? "-"}`,
    `LEFT FOOT  local ${leftFoot.map(round).join(", ")} · world ${worldFoot(leftFoot).join(", ")}`,
    `RIGHT FOOT local ${rightFoot.map(round).join(", ")} · world ${worldFoot(rightFoot).join(", ")}`,
    `CENTER     ${(frameData?.centerOfMass ?? [0, 0]).map(round).join(", ")}`,
    `CONTACTS   ${contacts.map((contact) => `${contact.tick}:${contact.foot}:${contact.articulation}`).join(" | ")}`,
    `ENTRY/EXIT ${state.entryFoot} → ${resolveExitFoot(move, state.entryFoot)}`,
    `SUCCESSORS ${new FootworkTransitionGraph({ style: state.style }).successors(move.id).join(", ")}`,
    `ACTIVE     ${sharedFrolicAtlasLibrary.activeKeys().join(", ")}`,
  ].join("\n");
}

function resolveTransition() {
  const graph = new FootworkTransitionGraph({ style: state.style });
  return graph.resolve({
    fromId: state.fromMoveId,
    toId: state.moveId,
    entryFoot: state.entryFoot,
    direction: "neutral",
    landingTick: 96,
  });
}

function labSnapshot(dancer) {
  const beat = state.phase * 2;
  return Object.freeze({
    mode: "frolic",
    started: false,
    complete: false,
    performer: "player",
    character: state.hero,
    dancer,
    beat: {
      beat,
      beatPhase: beat % 1,
      beatInBar: Math.floor(beat) % 4,
      bpm: 120,
    },
    crowdHeat: 60,
    callout: "",
    frolic: {
      state: "OPEN_JAM",
      stateLabel: "FOOTWORK LAB",
      style: state.style,
      profile: FROLIC_STYLE_PROFILES[state.style],
      bar: 1,
      tick: Math.round(beat * 96),
      localTick: Math.round(beat * 96),
      strain: { id: "A1" },
      currentMove: dancer.moveId,
      queuedMove: dancer.queuedMove,
      supportingFoot: dancer.supportingFoot,
      restraint: 1,
      score: { total: 0 },
      practice: null,
    },
  });
}

function drawRootTrail(context, move) {
  context.save();
  context.strokeStyle = "#f2bd65";
  context.setLineDash([2, 2]);
  context.beginPath();
  context.moveTo(192, 184);
  context.lineTo(192 + (move.rootMotion?.lateral ?? 0) * 4, 184 - (move.rootMotion?.forward ?? 0));
  context.stroke();
  context.restore();
}

function rootOffset(move, phase) {
  return (move.rootMotion?.lateral ?? 0) * phase;
}

function worldFoot(anchor) {
  return [
    round(192 + (anchor[0] - 48) * 1.25),
    round(178 + (anchor[1] - 76) * 1.25),
  ];
}

function fillSelect(select, ids, selected) {
  select.replaceChildren(...ids.map((id) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = getFootwork(id).displayName;
    option.selected = id === selected;
    return option;
  }));
}

function syncControls() {
  elements.hero.value = state.hero;
  elements.style.value = state.style;
  populateMoves();
  elements.move.value = state.moveId;
  elements.entryFoot.value = state.entryFoot;
  elements.fromMove.value = state.fromMoveId;
  elements.speed.value = String(state.speed);
  elements.phase.value = String(state.phase);
}

function snapshotState() {
  return Object.freeze({
    ...state,
    activePacks: sharedFrolicAtlasLibrary.activeKeys(),
    transition: resolveTransition(),
  });
}

function playSample(group) {
  const audio = new Audio(new URL(`../assets/audio/frolic/feet/${group}-1.wav`, import.meta.url));
  audio.volume = 0.8;
  void audio.play();
}

function clickMetronome() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Context) return;
  clickMetronome.context ??= new Context({ latencyHint: "interactive" });
  const context = clickMetronome.context;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.035, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.035);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.04);
}

function round(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function byId(id) {
  return document.getElementById(id);
}
