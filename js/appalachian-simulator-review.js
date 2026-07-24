import { AppalachianJamSimulation } from "./appalachian/simulation.js";
import { APPALACHIAN_TUNE_MAP, FROLIC_PPQ } from "./appalachian/tune-map.js";
import { FixedStepLoop } from "./core/fixed-step.js";
import { createInputStep, InputManager } from "./input.js";
import { KakiDanceRenderer } from "./render/renderer.js";

const canvas = document.getElementById("simulator-canvas");
const root = document.getElementById("sim-review");
const music = document.getElementById("review-music");
const manifestUrl = new URL("../assets/models/appalachian/simulator-manifest.json", import.meta.url);

class AppalachianSimulatorReview {
  constructor() {
    this.hero = "kitty";
    this.style = "flatfoot";
    this.speed = 1;
    this.paused = false;
    this.soundEnabled = false;
    this.foleyEnabled = true;
    this.musicEnabled = true;
    this.demo = "";
    this.demoTime = 0;
    this.beat = 0;
    this.lastSnapshot = null;
    this.lastInput = createInputStep();
    this.contactIndex = 0;
    this.debug = {};
    this.renderer = new KakiDanceRenderer(canvas, {
      settings: {
        reducedMotion: false,
        screenShake: 0,
        beatPulse: true,
        timingLabels: true,
        visualLatencyMs: 0,
      },
      seed: 0x53494d52,
    });
    this.renderer.setAppalachianRenderMode("live");
    this.input = new InputManager({
      target: window,
      touchRoot: document.getElementById("review-touch-controls"),
      profile: "appalachian",
      controlMode: "advanced",
    });
    this.simulation = this.createSimulation();
    this.bind();
    this.loop = new FixedStepLoop({
      step: 1 / 120,
      beforeFrame: (dt) => this.input.update(dt),
      update: (dt) => this.update(dt),
      render: (_alpha, dt) => this.render(dt),
    });
  }

  async start() {
    await this.renderer.enterMode("frolic", this.hero, this.style);
    const diagnostics = this.renderer.getAppalachianDiagnostics();
    document.getElementById("review-status").textContent = diagnostics.ready
      ? "Live shared rig ready. Approval remains with human reviewers."
      : `Live rig fallback: ${diagnostics.error || "atlas active"}`;
    canvas.focus({ preventScroll: true });
    this.loop.start();
  }

  createSimulation() {
    const simulation = new AppalachianJamSimulation({
      mode: "frolic",
      character: this.hero,
      style: this.style,
      tuneMap: APPALACHIAN_TUNE_MAP,
    });
    simulation.begin(beatSnapshot(this.beat));
    return simulation;
  }

  async resetPerformer() {
    this.beat = 0;
    this.demoTime = 0;
    this.simulation = this.createSimulation();
    await this.renderer.enterMode("frolic", this.hero, this.style);
    canvas.focus({ preventScroll: true });
  }

  update(dt, forcedInput = null) {
    if (this.paused && !forcedInput) return;
    const stepDt = dt * this.speed;
    this.beat += stepDt * APPALACHIAN_TUNE_MAP.bpm / 60;
    this.demoTime += stepDt;
    const live = forcedInput ?? this.input.consumeStep();
    const scripted = this.demo ? demoInput(this.demo, this.demoTime, this.style) : null;
    const input = scripted ? mergeInput(live, scripted) : live;
    this.lastInput = input;
    const beat = beatSnapshot(this.beat);
    this.simulation.update(stepDt, beat, input);
    this.simulation.consumeEvents((event) => this.onEvent(event));
    if (this.simulation.complete) {
      this.beat = 0;
      this.simulation = this.createSimulation();
    }
  }

  render(dt) {
    const snapshot = this.simulation.getSnapshot(beatSnapshot(this.beat));
    this.lastSnapshot = snapshot;
    this.renderer.update(dt, snapshot);
    this.renderer.render(snapshot);
    this.updateReadouts(snapshot);
  }

  onEvent(event) {
    this.renderer.onEvent(event, this.simulation.getSnapshot(beatSnapshot(this.beat)));
    if (event.type === "footContact" && this.soundEnabled && this.foleyEnabled) {
      playReviewFoley(event, this.contactIndex++);
    }
  }

  bind() {
    for (const button of document.querySelectorAll("[data-hero]")) {
      button.addEventListener("click", async () => {
        this.hero = button.dataset.hero;
        selectButtons("[data-hero]", button);
        await this.resetPerformer();
      });
    }
    for (const button of document.querySelectorAll("[data-style]")) {
      button.addEventListener("click", async () => {
        this.style = button.dataset.style;
        selectButtons("[data-style]", button);
        await this.resetPerformer();
      });
    }
    document.getElementById("move-browser").addEventListener("change", (event) => {
      const tick = this.beat * FROLIC_PPQ;
      this.simulation.animation.request(event.target.value, {
        tick,
        direction: "neutral",
        entryFoot: this.simulation.animation.base.freeFoot,
        phrasePhase: (tick % FROLIC_PPQ) / FROLIC_PPQ,
      });
      canvas.focus({ preventScroll: true });
    });
    document.getElementById("pause-review").addEventListener("click", (event) => {
      this.paused = !this.paused;
      event.currentTarget.textContent = this.paused ? "Resume" : "Pause";
    });
    document.getElementById("frame-step").addEventListener("click", () => {
      this.paused = true;
      document.getElementById("pause-review").textContent = "Resume";
      this.update(1 / 120, createInputStep());
      this.render(0);
    });
    document.getElementById("sound-review").addEventListener("click", async (event) => {
      this.soundEnabled = !this.soundEnabled;
      if (this.soundEnabled && this.musicEnabled) {
        music.volume = 0.5;
        await music.play().catch(() => {});
      } else {
        music.pause();
      }
      event.currentTarget.textContent = this.soundEnabled ? "Mute sound" : "Enable sound";
    });
    document.getElementById("music-toggle").addEventListener("change", (event) => {
      this.musicEnabled = event.target.checked;
      if (this.soundEnabled && this.musicEnabled) void music.play().catch(() => {});
      else music.pause();
    });
    document.getElementById("foley-toggle").addEventListener("change", (event) => {
      this.foleyEnabled = event.target.checked;
    });
    for (const button of document.querySelectorAll("[data-speed]")) {
      button.addEventListener("click", () => {
        this.speed = Number(button.dataset.speed) || 1;
        selectButtons("[data-speed]", button);
        music.playbackRate = this.speed;
      });
    }
    for (const checkbox of document.querySelectorAll("[data-debug]")) {
      checkbox.addEventListener("change", () => {
        this.debug[checkbox.dataset.debug] = checkbox.checked;
        this.renderer.setDebug({ frolic: this.debug });
      });
    }
    for (const button of document.querySelectorAll("[data-renderer]")) {
      button.addEventListener("click", () => {
        this.renderer.setAppalachianRenderMode(button.dataset.renderer);
        selectButtons("[data-renderer]", button);
      });
    }
    for (const button of document.querySelectorAll("[data-demo]")) {
      button.addEventListener("click", () => {
        this.demo = button.dataset.demo;
        this.demoTime = 0;
        selectButtons("[data-demo]", button);
        canvas.focus({ preventScroll: true });
      });
    }
  }

  updateReadouts(snapshot) {
    const dancer = snapshot.dancer;
    const frolic = snapshot.frolic;
    const diagnostics = this.renderer.getAppalachianDiagnostics();
    document.getElementById("now-move").textContent = dancer.moveName;
    document.getElementById("now-support").textContent = `support · ${dancer.supportingFoot}`;
    document.getElementById("now-region").textContent = frolic.boardRegion.label;
    document.getElementById("now-backend").textContent = this.renderer.appalachianRenderMode === "atlas"
      ? "ATLAS · FLATFOOT FALLBACK"
      : diagnostics.ready
      ? `${diagnostics.backend.actual} · ${diagnostics.skinnedMeshCount} skins`
      : "atlas fallback";
    const arm = dancer.upperBody;
    const cursor = document.getElementById("arm-cursor");
    cursor.style.left = `${50 + arm.coordinated.x * 42}%`;
    cursor.style.top = `${50 - arm.coordinated.y * 42}%`;
    document.getElementById("arm-readout").textContent = [
      arm.leftOverride ? "left override" : "",
      arm.rightOverride ? "right override" : "",
      arm.bodyActive ? "body line" : "",
    ].filter(Boolean).join(" + ") || "both · coordinated";
    document.getElementById("input-data").textContent = [
      `device  ${this.lastInput.device}`,
      `travel  ${fixed(this.lastInput.travelX)}, ${fixed(this.lastInput.travelY)}`,
      `arms    ${fixed(this.lastInput.armX)}, ${fixed(this.lastInput.armY)}`,
      `mods    ${modifierText(this.lastInput)}`,
      `buttons ${buttonText(this.lastInput)}`,
    ].join("\n");
    document.getElementById("air-data").textContent = [
      `state   ${dancer.jump.state}`,
      `charge  ${Math.round(dancer.jump.chargeSeconds * 1000)} ms`,
      `height  ${fixed(dancer.jump.height)} m`,
      `variant ${dancer.jump.variation || "—"}`,
      `landing ${Math.round(dancer.jump.landingQuality * 100)}%`,
      `contact ${dancer.contactIK.lockedFoot} · ${fixed(diagnostics.plantedFootDriftMeters * 100)} cm`,
    ].join("\n");
    document.getElementById("layer-bars").replaceChildren(...Object.entries(dancer.layers).map(([name, weight]) => {
      const row = document.createElement("div");
      row.className = "layer-bar";
      row.style.setProperty("--weight", `${Math.round(weight * 100)}%`);
      row.innerHTML = `<span>${name}</span><i></i><b>${Math.round(weight * 100)}%</b>`;
      return row;
    }));
    const transitions = document.getElementById("transition-data");
    transitions.replaceChildren(...(dancer.transitionCandidates ?? []).slice(0, 4).map((candidate) => {
      const item = document.createElement("li");
      item.textContent = `${candidate.move.id} @ ${fixed(candidate.entryPhase)} · ${fixed(candidate.score)}`;
      return item;
    }));
    document.getElementById("runtime-data").textContent = [
      `backend ${diagnostics.backend.actual}`,
      `target  ${diagnostics.internalSize.join("×")}`,
      `skins   ${diagnostics.skinnedMeshCount}`,
      `bones   ${diagnostics.boneCount}`,
      `actions ${diagnostics.actionCount}`,
      `render  ${fixed(diagnostics.renderP95Milliseconds)} ms p95`,
      `tail support ${diagnostics.tailSupportEligible}`,
    ].join("\n");
  }
}

function demoInput(name, time, style) {
  const input = createInputStep();
  input.profile = "appalachian";
  input.device = `review:${name}`;
  if (name === "figureEight") {
    input.travelX = Math.sin(time * 1.05);
    input.travelY = Math.sin(time * 2.1) * 0.72;
    input.x = input.travelX;
    input.y = input.travelY;
  }
  if (name === "armCircle") {
    input.armX = Math.cos(time * 1.7);
    input.armY = Math.sin(time * 1.7);
  }
  if (name === "independentArms") {
    input.armX = Math.sin(time * 1.8);
    input.armY = Math.cos(time * 1.3);
    input.leftArmModifier = Math.floor(time / 2) % 2 === 0;
    input.rightArmModifier = !input.leftArmModifier;
  }
  if (name === "styleHop") {
    const phase = time % 2.4;
    input.jump = phase < 0.4;
    input.jumpPressed = phase < 0.05;
    input.jumpReleased = phase >= 0.4 && phase < 0.47;
    input.commitModifier = style !== "flatfoot";
    input.stylePressed = phase > 0.62 && phase < 0.7;
  }
  if (name === "danceLine") {
    input.travelX = Math.sin(time * 0.75) * 0.82;
    input.travelY = Math.cos(time * 0.48) * 0.64;
    input.x = input.travelX;
    input.y = input.travelY;
    input.armX = Math.sin(time * 0.88);
    input.armY = Math.cos(time * 0.66) * 0.78;
    const index = Math.floor(time / 0.72) % 8;
    const edge = time % 0.72 < 1 / 120;
    input.actionPressed = edge && [0, 3, 6].includes(index);
    input.stylePressed = edge && [1, 4].includes(index);
    input.powerPressed = edge && [2, 5, 7].includes(index);
    input.stepPressed = input.actionPressed;
    input.brushPressed = input.stylePressed;
    input.drivePressed = input.powerPressed;
    const hopPhase = time % 5.76;
    input.jump = hopPhase > 2.6 && hopPhase < 3;
    input.jumpPressed = hopPhase > 2.6 && hopPhase < 2.66;
    input.jumpReleased = hopPhase >= 3 && hopPhase < 3.08;
  }
  return input;
}

function mergeInput(live, scripted) {
  const value = { ...live, ...scripted };
  for (const key of Object.keys(live)) {
    if (typeof live[key] === "boolean") value[key] = Boolean(live[key] || scripted[key]);
  }
  return value;
}

function beatSnapshot(beat) {
  const beatIndex = Math.floor(beat);
  return Object.freeze({
    audioTime: beat * 0.5,
    playbackSeconds: beat * 0.5,
    beat,
    beatIndex,
    beatPhase: ((beat % 1) + 1) % 1,
    beatInBar: beatIndex % 4,
    barIndex: Math.floor(beat / 4),
    measure: Math.floor(beat / 4) + 1,
    phrase: Math.floor(beat / 32) + 1,
    section: "review",
    intensity: 0.72,
    bpm: 120,
    paused: false,
    running: true,
  });
}

function playReviewFoley(event, index) {
  const group = reviewSampleGroup(event.sampleGroup, event.style);
  const strength = event.intensity >= 0.78 ? "strong" : event.intensity >= 0.52 ? "medium" : "soft";
  const take = index % 2 + 1;
  const audio = new Audio(`./assets/audio/frolic/feet/${group}-${strength}-${take}.wav`);
  audio.volume = Math.min(0.84, 0.28 + (Number(event.intensity) || 0.5) * 0.52);
  void audio.play().catch(() => {});
}

function reviewSampleGroup(value, style) {
  const allowed = new Set([
    "softSole", "flatContact", "heel", "toeBall", "brush", "scuff",
    "drag", "slide", "chug", "tapHeel", "tapToe",
  ]);
  if (value === "landing") return style === "clog" ? "tapHeel" : "flatContact";
  return allowed.has(value) ? value : "softSole";
}

function selectButtons(selector, selected) {
  for (const button of document.querySelectorAll(selector)) {
    button.classList.toggle("is-selected", button === selected);
  }
}

function modifierText(input) {
  return [
    input.leftArmModifier ? "LB/Q" : "",
    input.rightArmModifier ? "RB/E" : "",
    input.bodyModifier ? "LT/Ctrl" : "",
    input.commitModifier ? "RT/Shift" : "",
  ].filter(Boolean).join(" ") || "—";
}

function buttonText(input) {
  return [
    input.action ? "STEP" : "",
    input.style ? "BRUSH" : "",
    input.power ? "DRIVE" : "",
    input.jump ? "JUMP" : "",
  ].filter(Boolean).join(" ") || "—";
}

function fixed(value) {
  return (Number(value) || 0).toFixed(2);
}

const app = new AppalachianSimulatorReview();
globalThis.appalachianSimulatorReview = app;
fetch(manifestUrl).then((response) => response.json()).then((manifest) => {
  document.getElementById("source-data").textContent = [
    `${manifest.sharedSkeleton}`,
    `${manifest.gateCounts.groundedMovements} grounded · ${manifest.gateCounts.jumpPrototypes} jumps`,
    `${manifest.gateCounts.armPoseSamples} arm-field poses`,
    manifest.candidateStatus,
  ].join("\n");
}).catch((error) => {
  document.getElementById("source-data").textContent = error.message;
});
await app.start();
