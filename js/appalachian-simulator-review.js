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
    this.eventLog = [];
    this.contactTimeline = [];
    this.recording = false;
    this.recordedSteps = [];
    this.replayCursor = -1;
    this.freeCamera = false;
    this.cameraDrag = null;
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
    let input = live;
    if (this.replayCursor >= 0) {
      input = this.recordedSteps[this.replayCursor] ?? createInputStep();
      this.replayCursor += 1;
      if (this.replayCursor >= this.recordedSteps.length) {
        this.replayCursor = -1;
        this.updateRecordingStatus();
      }
    } else if (this.demo) {
      input = mergeInput(live, demoInput(this.demo, this.demoTime, this.style));
    }
    if (this.recording) {
      this.recordedSteps.push(cloneInputStep(input));
      if (this.recordedSteps.length >= 120 * 90) this.stopRecording();
    }
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
    if (["footAnticipation", "frolicInput", "frolicInputRejected"].includes(event.type)) {
      this.eventLog.unshift(`${event.type} · ${event.foot ?? "—"} · ${event.inputKind ?? ""}`);
      this.eventLog.splice(8);
    }
    if (event.type === "footContact") {
      this.contactTimeline.unshift(
        `T${Math.round(event.tick)} ${event.foot} ${event.articulation} → ${event.sampleGroup}`,
      );
      this.contactTimeline.splice(8);
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
    document.getElementById("record-input").addEventListener("click", async () => {
      this.demo = "";
      this.recordedSteps = [];
      this.replayCursor = -1;
      this.recording = true;
      this.paused = false;
      document.getElementById("pause-review").textContent = "Pause";
      await this.resetPerformer();
      this.updateRecordingStatus();
    });
    document.getElementById("stop-recording").addEventListener("click", () => this.stopRecording());
    document.getElementById("replay-recording").addEventListener("click", async () => {
      if (!this.recordedSteps.length) return;
      this.recording = false;
      this.demo = "";
      this.replayCursor = 0;
      this.paused = false;
      document.getElementById("pause-review").textContent = "Pause";
      await this.resetPerformer();
      this.updateRecordingStatus();
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
    for (const button of document.querySelectorAll("[data-camera]")) {
      button.addEventListener("click", () => {
        this.renderer.setAppalachianCameraPreset(button.dataset.camera);
        selectButtons("[data-camera]", button);
        this.render(0);
      });
    }
    document.getElementById("free-camera").addEventListener("change", (event) => {
      this.freeCamera = event.target.checked;
      this.renderer.setAppalachianFreeCamera?.(this.freeCamera);
      if (!this.freeCamera) this.renderer.setAppalachianCameraPreset("gameplay");
      canvas.focus({ preventScroll: true });
    });
    canvas.addEventListener("pointerdown", (event) => {
      if (!this.freeCamera) return;
      this.cameraDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.cameraDrag || this.cameraDrag.pointerId !== event.pointerId) return;
      const dx = event.clientX - this.cameraDrag.x;
      const dy = event.clientY - this.cameraDrag.y;
      this.cameraDrag.x = event.clientX;
      this.cameraDrag.y = event.clientY;
      this.renderer.orbitAppalachianCamera?.(dx * 0.008, dy * 0.006, 0);
      this.render(0);
    });
    const releaseCamera = (event) => {
      if (this.cameraDrag?.pointerId === event.pointerId) this.cameraDrag = null;
    };
    canvas.addEventListener("pointerup", releaseCamera);
    canvas.addEventListener("pointercancel", releaseCamera);
    canvas.addEventListener("wheel", (event) => {
      if (!this.freeCamera) return;
      event.preventDefault();
      this.renderer.orbitAppalachianCamera?.(0, 0, Math.sign(event.deltaY) * 0.5);
      this.render(0);
    }, { passive: false });
    for (const button of document.querySelectorAll("[data-demo]")) {
      button.addEventListener("click", () => {
        this.demo = button.dataset.demo;
        this.demoTime = 0;
        this.recording = false;
        this.replayCursor = -1;
        this.updateRecordingStatus();
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
      `edges   ${(this.lastInput.performanceEdges ?? []).map((edge) => edge.action).join(" + ") || "—"}`,
    ].join("\n");
    document.getElementById("air-data").textContent = [
      `state   ${dancer.jump.state}`,
      `charge  ${Math.round(dancer.jump.chargeSeconds * 1000)} ms`,
      `height  ${fixed(dancer.jump.height)} m`,
      `variant ${dancer.jump.variation || "—"}`,
      `landing ${Math.round(dancer.jump.landingQuality * 100)}%`,
      `contact ${dancer.contactIK.lockedFoot} · ${fixed(diagnostics.plantedFootDriftMeters * 100)} cm`,
    ].join("\n");
    document.getElementById("feet-data").textContent = [
      `L  ${dancer.feet.left.stage} · ${dancer.feet.left.contact}/${dancer.feet.left.articulation} · q${dancer.feet.left.queueDepth}`,
      `R  ${dancer.feet.right.stage} · ${dancer.feet.right.contact}/${dancer.feet.right.articulation} · q${dancer.feet.right.queueDepth}`,
      `weight ${Math.round(dancer.weightDistribution.left * 100)} / ${Math.round(dancer.weightDistribution.right * 100)}`,
      `buffer ${frolic.inputBuffers.left.length}L ${frolic.inputBuffers.right.length}R ${frolic.inputBuffers.families.length} family`,
      `chord  ${frolic.modifierChord
        ? `${frolic.modifierChord.foot} ${frolic.modifierChord.family} ${frolic.modifierChord.variant}`
        : "—"}`,
      `facing ${Math.round((dancer.facing || 0) * 180 / Math.PI)}°`,
      `root fwd ${fixed(diagnostics.footBasis?.intendedForward?.[0])}, ${fixed(diagnostics.footBasis?.intendedForward?.[2])}`,
      `toe dot ${fixed(diagnostics.footBasis?.left?.dot)} / ${fixed(diagnostics.footBasis?.right?.dot)}`,
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
      `foot layers ${diagnostics.footLayerActionCount}`,
      `render  ${fixed(diagnostics.renderP95Milliseconds)} ms p95`,
      `tail support ${diagnostics.tailSupportEligible}`,
    ].join("\n");
    document.getElementById("clock-data").textContent = [
      `fixed   120 Hz`,
      `beat    ${fixed(snapshot.beat.beat)}`,
      `bar     ${snapshot.beat.barIndex + 1}`,
      `phase   ${fixed(snapshot.beat.beatPhase)}`,
      `music   ${fixed(snapshot.beat.audioTime)} s`,
      `sim     ${fixed(this.demoTime)} s @ ${this.speed}×`,
      `state   ${frolic.state}`,
      `record  ${this.recording ? `${this.recordedSteps.length} frames` : this.replayCursor >= 0 ? `replay ${this.replayCursor}/${this.recordedSteps.length}` : "idle"}`,
    ].join("\n");
    document.getElementById("event-log").textContent = this.eventLog.join("\n") || "waiting for foot edges…";
    document.getElementById("contact-timeline").textContent = this.contactTimeline.join("\n") || "waiting for authored contact…";
    if (this.recording || this.replayCursor >= 0) this.updateRecordingStatus();
  }

  stopRecording() {
    this.recording = false;
    this.replayCursor = -1;
    this.updateRecordingStatus();
  }

  updateRecordingStatus() {
    const status = document.getElementById("recording-status");
    if (this.recording) {
      status.textContent = `RECORDING · ${this.recordedSteps.length} FRAMES`;
    } else if (this.replayCursor >= 0) {
      status.textContent = `REPLAY · ${this.replayCursor}/${this.recordedSteps.length}`;
    } else if (this.recordedSteps.length) {
      status.textContent = `${this.recordedSteps.length} FRAMES · ${(this.recordedSteps.length / 120).toFixed(2)} S`;
    } else {
      status.textContent = "NO RECORDING";
    }
  }
}

function demoInput(name, time, style) {
  const input = createInputStep();
  input.profile = "appalachian";
  input.device = `review:${name}`;
  const frame = Math.floor(time * 120 + 1e-5);
  if (name === "eighths") addFootPattern(input, frame, 30, ["left", "right"]);
  if (name === "sixteenths") addFootPattern(input, frame, 15, ["left", "right"]);
  if (name === "leftLeftRight") addFootPattern(input, frame, 24, ["left", "left", "right"]);
  if (name === "brushStepStep") {
    addFootPattern(input, frame, 30, ["left", "right", "left"], ["brush", "basic", "basic"]);
  }
  if (name === "toeHeelToe") {
    addFootPattern(
      input,
      frame,
      30,
      ["left", "right", "left"],
      ["articulation", "articulation", "articulation"],
      ["toe", "heel", "toe"],
    );
  }
  if (name === "doubleStomp" && frame % 120 === 0) {
    input.performanceEdges = Object.freeze([
      reviewEdge("leftFoot", time),
      reviewEdge("rightFoot", time),
    ]);
  }
  if (name === "travelTap") {
    input.travelX = Math.sin(time * 0.84) * 0.8;
    input.travelY = Math.cos(time * 0.42) * 0.58;
    input.x = input.travelX;
    input.y = input.travelY;
    addFootPattern(input, frame, 30, ["left", "right"]);
  }
  if (name === "turnTap") {
    input.travelX = Math.sin(time * 0.8) * 0.55;
    input.turnDirection = Math.sin(time * 0.4) < 0 ? -1 : 1;
    addFootPattern(input, frame, 30, ["left", "right"], ["basic", "turn", "basic", "turn"]);
  }
  if (name === "jumpBeatOne") {
    const barPhase = time % 2;
    input.jump = barPhase >= 1.08 && barPhase < 1.42;
    input.jumpPressed = frame % 240 === 130;
    input.jumpReleased = frame % 240 === 170;
    input.groundModifier = barPhase > 1.84 || barPhase < 0.12;
    if (frame % 240 === 0) {
      input.performanceEdges = Object.freeze([
        reviewEdge("leftFoot", time),
        reviewEdge("rightFoot", time),
      ]);
    }
  }
  if (name === "figureEight") {
    input.travelX = Math.sin(time * 1.05);
    input.travelY = Math.sin(time * 2.1) * 0.72;
    input.x = input.travelX;
    input.y = input.travelY;
  }
  if (name === "armCircle") {
    input.armX = Math.cos(time * 1.7);
    input.armY = Math.sin(time * 1.7);
    input.armActive = true;
    input.armInputMode = "absolute";
  }
  if (name === "independentArms") {
    input.armX = Math.sin(time * 1.8);
    input.armY = Math.cos(time * 1.3);
    input.armActive = true;
    input.armInputMode = "absolute";
    input.leftArmModifier = Math.floor(time / 2) % 2 === 0;
    input.rightArmModifier = !input.leftArmModifier;
  }
  if (name === "styleHop") {
    const phase = time % 2.4;
    input.jump = phase < 0.4;
    input.jumpPressed = phase < 0.05;
    input.jumpReleased = phase >= 0.4 && phase < 0.47;
    input.commitModifier = style !== "flatfoot";
    input.brushPressed = phase > 0.62 && phase < 0.7;
  }
  if (name === "danceLine") {
    input.travelX = Math.sin(time * 0.75) * 0.82;
    input.travelY = Math.cos(time * 0.48) * 0.64;
    input.x = input.travelX;
    input.y = input.travelY;
    input.armX = Math.sin(time * 0.88);
    input.armY = Math.cos(time * 0.66) * 0.78;
    input.armActive = true;
    input.armInputMode = "absolute";
    const index = Math.floor(time / 0.72) % 8;
    const edge = time % 0.72 < 1 / 120;
    if (edge) {
      const footAction = index % 2 ? "rightFoot" : "leftFoot";
      const family = ["basic", "brush", "articulation", "drive", "brush", "drive", "turn", "basic"][index];
      input.performanceEdges = Object.freeze([
        reviewEdge(footAction, time),
        ...(family === "basic" ? [] : [reviewEdge(family, time)]),
      ]);
    }
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
    input.brushModifier ? "brush" : "",
    input.heelModifier ? "heel" : "",
    input.toeModifier ? "toe" : "",
  ].filter(Boolean).join(" ") || "—";
}

function buttonText(input) {
  return [
    input.leftFoot ? "L FOOT" : "",
    input.rightFoot ? "R FOOT" : "",
    input.brush ? "BRUSH" : "",
    input.articulation ? "HEEL·TOE" : "",
    input.drive ? "DRIVE" : "",
    input.turn ? "TURN" : "",
    input.jump ? "JUMP" : "",
  ].filter(Boolean).join(" ") || "—";
}

function reviewEdge(action, time, articulationModifier = "") {
  return Object.freeze({
    action,
    rawTimeStamp: time * 1000,
    receivedTimeStamp: time * 1000,
    device: "review:danceLine",
    code: "",
    grounded: false,
    committed: false,
    articulationModifier,
  });
}

function addFootPattern(input, frame, interval, feet, families = [], articulations = []) {
  if (frame % interval !== 0) return;
  const index = Math.floor(frame / interval);
  const foot = feet[index % feet.length];
  const family = families.length ? families[index % families.length] : "basic";
  const articulationModifier = articulations.length ? articulations[index % articulations.length] : "";
  const time = frame / 120;
  input.performanceEdges = Object.freeze([
    reviewEdge(foot === "right" ? "rightFoot" : "leftFoot", time, articulationModifier),
    ...(family === "basic" ? [] : [reviewEdge(family, time, articulationModifier)]),
  ]);
}

function cloneInputStep(input) {
  return Object.freeze({
    ...input,
    performanceEdges: Object.freeze((input.performanceEdges ?? []).map((edge) => Object.freeze({ ...edge }))),
  });
}

function fixed(value) {
  return (Number(value) || 0).toFixed(2);
}

const app = new AppalachianSimulatorReview();
globalThis.appalachianSimulatorReview = app;
fetch(manifestUrl).then((response) => response.json()).then((manifest) => {
  document.getElementById("source-data").textContent = [
    `${manifest.sharedSkeleton}`,
    `${manifest.gateCounts.actions} actions · ${manifest.gateCounts.goldenPairedGestures} paired golden gestures`,
    `${manifest.gateCounts.armPoseSamples} arm-field poses`,
    manifest.candidateStatus,
  ].join("\n");
}).catch((error) => {
  document.getElementById("source-data").textContent = error.message;
});
await app.start();
