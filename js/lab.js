import { DEFAULT_BEATMAP } from "./audio/beatmap.js";
import { MusicTransport } from "./audio/music-transport.js";
import { TIMING_WINDOWS } from "./config.js";
import { characterDefinition } from "./dance/character-catalog.js";
import { MOVE_CATALOG, MOVE_FAMILIES, getMoveDefinition } from "./dance/move-catalog.js";
import { timingJudgment } from "./dance/scoring.js";
import { KakiDanceRenderer } from "./render/renderer.js";
import { buildMoveQaSnapshot } from "./render/qa-frame.js";
import { drawPixelText } from "./render/pixel-font.js";
import { pixelLine, pixelRect } from "./render/primitives.js";

const canvas = document.getElementById("lab-canvas");
const renderer = new KakiDanceRenderer(canvas, {
  settings: { beatPulse: true, reducedMotion: false, reduceFlashes: true, screenShake: 0 },
});
const controls = {
  character: document.getElementById("lab-character"),
  move: document.getElementById("lab-move"),
  phase: document.getElementById("lab-phase"),
  phaseOutput: document.getElementById("phase-output"),
  speed: document.getElementById("lab-speed"),
  stamina: document.getElementById("lab-stamina"),
  staminaOutput: document.getElementById("stamina-output"),
  balance: document.getElementById("lab-balance"),
  balanceOutput: document.getElementById("balance-output"),
  mirror: document.getElementById("lab-mirror"),
  skeleton: document.getElementById("lab-skeleton"),
  contacts: document.getElementById("lab-contacts"),
  com: document.getElementById("lab-com"),
  support: document.getElementById("lab-support"),
  reduced: document.getElementById("lab-reduced"),
  transition: document.getElementById("lab-transition"),
  testTransition: document.getElementById("test-transition"),
  capture: document.getElementById("capture-frame"),
  data: document.getElementById("move-data"),
  readout: document.getElementById("lab-readout"),
};

populateMoves();
let phase = Number(controls.phase.value);
let lastFrame = performance.now();
let transitionTarget = "";
let transitionMix = 0;

for (const element of Object.values(controls)) {
  if (!element?.addEventListener) continue;
  element.addEventListener("input", () => {
    phase = Number(controls.phase.value);
    transitionTarget = "";
    transitionMix = 0;
    updateControls();
  });
}
controls.move.addEventListener("change", updateMoveData);
controls.character.addEventListener("change", updateMoveData);
controls.testTransition.addEventListener("click", () => {
  transitionTarget = controls.transition.value;
  transitionMix = 0;
});
controls.capture.addEventListener("click", captureFrame);

for (const tab of document.querySelectorAll('[role="tab"]')) {
  tab.addEventListener("click", () => selectTab(tab));
}

updateMoveData();
requestAnimationFrame(frame);

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const speed = Number(controls.speed.value);
  if (speed > 0) {
    const move = getMoveDefinition(controls.move.value);
    const durationSeconds = move.durationBeats * 60 / DEFAULT_BEATMAP.bpm;
    phase = (phase + dt * speed / durationSeconds) % 1;
    controls.phase.value = phase;
  }
  if (transitionTarget) {
    transitionMix += dt * 2.5;
    if (transitionMix >= 1) {
      controls.move.value = transitionTarget;
      phase = 0;
      controls.phase.value = 0;
      transitionTarget = "";
      transitionMix = 0;
      updateMoveData();
    }
  }
  render();
  updateControls();
  updateRhythm();
  requestAnimationFrame(frame);
}

function render() {
  const balance = Number(controls.balance.value);
  const snapshot = buildMoveQaSnapshot({
    moveId: controls.move.value,
    phase,
    character: controls.character.value,
    mirror: controls.mirror.checked,
    balance,
    wobble: Math.max(0, Math.abs(balance) - 0.45),
    reducedMotion: controls.reduced.checked,
    beat: 16 + phase,
  });
  const dancer = Object.freeze({ ...snapshot.dancer, stamina: Number(controls.stamina.value) });
  const adjusted = Object.freeze({ ...snapshot, dancer, player: dancer });
  renderer.setSettings({ beatPulse: true, reducedMotion: controls.reduced.checked, reduceFlashes: true, screenShake: 0 });
  renderer.setDebug({
    skeleton: controls.skeleton.checked,
    contacts: controls.contacts.checked,
    com: controls.com.checked,
  });
  renderer.render(adjusted);
  if (controls.support.checked) drawSupport(adjusted);
  const contactError = adjusted.dancer.contacts.measured?.average ?? 0;
  controls.readout.textContent = [
    `clip ${adjusted.dancer.pose.label}`,
    `sample ${adjusted.dancer.pose.sampledPhase.toFixed(3)}`,
    `IK/contact avg ${contactError.toFixed(2)} px`,
    `support ${adjusted.dancer.contacts.support.width.toFixed(1)} px`,
    `rig ${adjusted.dancer.rig.topology}`,
  ].join("  ·  ");
}

function drawSupport(snapshot) {
  const ctx = renderer.ctx;
  const support = snapshot.dancer.contacts.support;
  const floorY = 158;
  const scale = 1.45;
  const min = Math.round(192 + support.min * scale);
  const max = Math.round(192 + support.max * scale);
  pixelLine(ctx, { x: min, y: floorY + 5 }, { x: max, y: floorY + 5 }, 2, "#f4c95d");
  pixelRect(ctx, min - 1, floorY + 3, 2, 5, "#f4c95d");
  pixelRect(ctx, max - 1, floorY + 3, 2, 5, "#f4c95d");
  const com = Math.round(192 + snapshot.dancer.rig.centerOfMass.x * scale);
  drawPixelText(ctx, "COM", com, floorY + 9, { align: "center", color: "#f4c95d", scale: 1, shadow: "#090b1b" });
}

function populateMoves() {
  for (const family of MOVE_FAMILIES) {
    const group = document.createElement("optgroup");
    group.label = family.toUpperCase();
    for (const move of Object.values(MOVE_CATALOG).filter((value) => value.family === family)) {
      const option = document.createElement("option");
      option.value = move.id;
      option.textContent = move.displayName;
      group.append(option);
    }
    controls.move.append(group);
  }
  controls.move.value = "sixStep";
}

function updateMoveData() {
  const move = getMoveDefinition(controls.move.value);
  controls.transition.replaceChildren(...move.validFollowUps.map((id) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = getMoveDefinition(id).displayName;
    return option;
  }));
  controls.testTransition.disabled = !move.validFollowUps.length;
  controls.data.textContent = [
    `${move.displayName} · ${move.family} · difficulty ${move.difficulty.toFixed(2)}`,
    `${move.durationBeats} beats · ${move.poseCadence} fps drawings · stamina ${move.staminaCost}`,
    `entry: ${move.entryTags.join(", ")}`,
    `exit: ${move.exitTags.join(", ")}`,
    `cancel: ${move.cancelWindows.map(([a, b]) => `${a.toFixed(2)}–${b.toFixed(2)}`).join(" / ")}`,
    `accents: ${move.accentWindows.join(", ")}`,
    `contacts: ${move.contacts.map((contact) => `${contact.limb} ${contact.start.toFixed(2)}–${contact.end.toFixed(2)}`).join(" · ") || "none"}`,
    `follow-ups: ${move.validFollowUps.join(", ")}`,
    `failure: ${move.failureRecovery}`,
  ].join("\n");
}

function updateControls() {
  controls.phaseOutput.textContent = phase.toFixed(2);
  controls.staminaOutput.textContent = controls.stamina.value;
  controls.balanceOutput.textContent = Number(controls.balance.value).toFixed(2);
}

function captureFrame() {
  const link = document.createElement("a");
  link.download = `kaki-dance-${controls.character.value}-${controls.move.value}-${phase.toFixed(3)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function selectTab(tab) {
  for (const candidate of document.querySelectorAll('[role="tab"]')) {
    const selected = candidate === tab;
    candidate.setAttribute("aria-selected", String(selected));
    const panel = document.getElementById(candidate.getAttribute("aria-controls"));
    panel.hidden = !selected;
    panel.classList.toggle("is-active", selected);
  }
}

// Rhythm Lab
const rhythm = {
  transport: new MusicTransport({ beatmap: DEFAULT_BEATMAP }),
  start: document.getElementById("rhythm-start"),
  pause: document.getElementById("rhythm-pause"),
  tap: document.getElementById("rhythm-tap"),
  calibration: document.getElementById("calibration-offset"),
  calibrationOutput: document.getElementById("calibration-output"),
  metrics: Object.fromEntries([...document.querySelectorAll("[data-metric]")].map((element) => [element.dataset.metric, element])),
  history: document.getElementById("tap-history"),
  taps: [],
  startedPerformance: 0,
  startedAudio: 0,
  running: false,
};

rhythm.start.addEventListener("click", async () => {
  await rhythm.transport.unlock();
  rhythm.transport.start({ offsetSeconds: 0 });
  rhythm.transport.setLatency(Number(rhythm.calibration.value));
  rhythm.startedPerformance = performance.now() / 1000;
  rhythm.startedAudio = rhythm.transport.context?.currentTime ?? rhythm.startedPerformance;
  rhythm.running = true;
  rhythm.start.disabled = true;
  rhythm.pause.disabled = false;
  rhythm.tap.disabled = false;
});
rhythm.pause.addEventListener("click", () => {
  if (rhythm.transport.clock.paused) {
    rhythm.transport.resume();
    rhythm.pause.textContent = "Pause";
    rhythm.metrics.transport.textContent = "running";
  } else {
    rhythm.transport.pause();
    rhythm.pause.textContent = "Resume";
    rhythm.metrics.transport.textContent = "paused";
  }
});
rhythm.tap.addEventListener("click", recordTap);
globalThis.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !document.activeElement?.matches("input,select,button") && rhythm.running) {
    event.preventDefault();
    recordTap();
  }
});
rhythm.calibration.addEventListener("input", () => {
  const value = Number(rhythm.calibration.value);
  rhythm.transport.setLatency(value);
  rhythm.calibrationOutput.textContent = `${value} ms`;
});

function recordTap() {
  const snapshot = rhythm.transport.clock.getSnapshot();
  const judgment = timingJudgment(snapshot.beat, snapshot.bpm, TIMING_WINDOWS.standard, DEFAULT_BEATMAP);
  const entry = {
    audioTime: snapshot.audioTime,
    beat: snapshot.beat,
    deltaMs: Math.round(judgment.deltaSeconds * 1000),
    judgment: judgment.label,
  };
  rhythm.taps.push(entry);
  if (rhythm.taps.length > 16) rhythm.taps.shift();
  rhythm.metrics.inputTime.textContent = snapshot.audioTime.toFixed(3);
  rhythm.metrics.judgment.textContent = `${judgment.label} ${entry.deltaMs >= 0 ? "+" : ""}${entry.deltaMs} ms`;
  rhythm.history.textContent = rhythm.taps.map((tap, index) => (
    `${String(index + 1).padStart(2, "0")}  beat ${tap.beat.toFixed(3)}  ${tap.judgment.padEnd(8)}  ${tap.deltaMs >= 0 ? "+" : ""}${tap.deltaMs} ms`
  )).join("\n");
}

function updateRhythm() {
  if (!rhythm.running) return;
  const snapshot = rhythm.transport.clock.getSnapshot();
  rhythm.metrics.audioTime.textContent = snapshot.audioTime.toFixed(3);
  rhythm.metrics.beat.textContent = snapshot.beat.toFixed(3);
  rhythm.metrics.beatPhase.textContent = snapshot.beatPhase.toFixed(3);
  rhythm.metrics.measure.textContent = snapshot.measure;
  rhythm.metrics.phrase.textContent = snapshot.phrase;
  rhythm.metrics.section.textContent = snapshot.section;
  rhythm.metrics.transport.textContent = snapshot.paused ? "paused" : "running";
  const performanceElapsed = performance.now() / 1000 - rhythm.startedPerformance;
  const audioElapsed = snapshot.audioTime - rhythm.startedAudio;
  rhythm.metrics.drift.textContent = `${((performanceElapsed - audioElapsed) * 1000).toFixed(1)} ms`;
}
