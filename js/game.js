import { resolveMotionSettings, announce } from "./accessibility.js";
import { loadBeatmap } from "./audio/beatmap.js";
import { FootPercussionPlayer } from "./audio/foot-percussion-player.js";
import { MusicTransport } from "./audio/music-transport.js";
import { SoundEffects } from "./audio/sfx.js";
import { AppalachianJamSimulation } from "./appalachian/simulation.js";
import { APPALACHIAN_TUNE_MAP } from "./appalachian/tune-map.js";
import { normalizeFrolicStyle } from "./appalachian/footwork-catalog.js";
import { DEFAULT_SETTINGS, FIXED_STEP, TIMING_WINDOWS } from "./config.js";
import { FixedStepLoop } from "./core/fixed-step.js";
import { characterDefinition, normalizeCharacterId } from "./dance/character-catalog.js";
import { MeasureMatchSimulation } from "./dance/measure-match-simulation.js";
import { DanceSimulation } from "./dance/simulation.js";
import { InputManager, createInputStep } from "./input.js";
import { KakiDanceRenderer } from "./render/renderer.js";
import { buildMoveQaSnapshot } from "./render/qa-frame.js";
import { loadSave, saveGame } from "./storage.js";

const EMPTY_INPUT = Object.freeze(createInputStep());
const MEASURE_TRACK_URL = new URL("../assets/audio/moon-block-party.wav", import.meta.url);
const FROLIC_TRACK_URL = new URL("../assets/audio/frolic/board-and-bow.wav", import.meta.url);
const FROLIC_MODES = new Set(["frolic", "stepShed"]);

export class KakiDanceGame {
  constructor({
    host,
    beatmap,
    externalInput = null,
    externalAudio = null,
    storage = null,
    settings = null,
    profile = null,
    onExit = null,
    onRoundComplete = null,
    onBattleComplete = null,
    qaScene = null,
  } = {}) {
    this.host = host;
    this.beatmap = beatmap;
    this.activeBeatmap = beatmap;
    this.storage = storage;
    this.save = loadSave(storage);
    if (settings) this.save.settings = { ...this.save.settings, ...settings };
    if (profile?.character) this.save.selectedCharacter = normalizeCharacterId(profile.character);
    this.settings = this.save.settings;
    this.selectedCharacter = normalizeCharacterId(this.save.selectedCharacter);
    this.selectedFrolicStyle = normalizeFrolicStyle(this.save.selectedFrolicStyle);
    this.onExit = onExit;
    this.onRoundComplete = onRoundComplete;
    this.onBattleComplete = onBattleComplete;
    this.qaScene = qaScene;
    this.elements = collectElements(host);
    this.input = externalInput ?? new InputManager({
      target: globalThis.window,
      touchRoot: this.elements.touchControls,
      controlMode: this.settings.controlMode,
      bindings: objectBindings(this.settings.bindings),
    });
    this.ownsInput = !externalInput;
    this.transport = externalAudio ?? new MusicTransport({ beatmap });
    this.ownsAudio = !externalAudio;
    this.sfx = new SoundEffects(this.transport);
    this.footPercussion = new FootPercussionPlayer({ transport: this.transport });
    this.motion = resolveMotionSettings(this.settings);
    this.renderer = new KakiDanceRenderer(this.elements.canvas, {
      settings: { ...this.settings, ...this.motion },
      seed: 0x4b414b49,
    });
    this.replayRenderer = new KakiDanceRenderer(this.elements.replayCanvas, {
      settings: { ...this.settings, ...this.motion, reducedMotion: true, screenShake: 0 },
      seed: 0x5245504c,
    });
    this.state = "title";
    this.mode = "measure";
    this.simulation = null;
    this.attract = null;
    this.snapshot = null;
    this.destroyed = false;
    this.remapAction = "";
    this.listeners = new AbortController();
    this.bindUi();
    this.syncUiFromSettings();
    this.selectCharacter(this.selectedCharacter, { persist: false });
    this.selectFrolicStyle(this.selectedFrolicStyle, { persist: false });
    this.createAttractSimulation();
    this.loop = new FixedStepLoop({
      step: FIXED_STEP,
      beforeFrame: (dt) => this.beforeFrame(dt),
      update: (dt) => this.fixedUpdate(dt),
      render: (_alpha, dt) => this.render(dt),
    });
  }

  start(options = {}) {
    if (this.destroyed) return;
    if (!this.loop.running) this.loop.start();
    if (this.qaScene && !options.mode) {
      this.state = "qa";
      this.snapshot = buildMoveQaSnapshot(this.qaScene);
      this.renderer.reset();
      this.showLayer(null);
      return this.getSnapshot();
    }
    if (options.character) this.selectCharacter(options.character);
    if (options.style) this.selectFrolicStyle(options.style);
    if (options.mode) {
      if (options.immediate) {
        return this.startMode(options.mode, {
          offsetSeconds: options.offsetSeconds,
        });
      }
      this.mode = options.mode;
    }
    delete this.host.dataset.mode;
    this.showLayer("title");
    return this.getSnapshot();
  }

  async startMode(mode = this.mode, { offsetSeconds = 0 } = {}) {
    if (this.destroyed) return;
    this.mode = ["measure", "practice", "frolic", "stepShed", "freestyle", "battle"].includes(mode) ? mode : "measure";
    this.host.dataset.mode = this.mode;
    const isFrolic = FROLIC_MODES.has(this.mode);
    this.activeBeatmap = isFrolic ? APPALACHIAN_TUNE_MAP : this.beatmap;
    this.configureTransport(this.activeBeatmap, isFrolic ? FROLIC_TRACK_URL : MEASURE_TRACK_URL);
    this.state = "loading";
    this.updateModePresentation();
    announce(this.elements.liveStatus, isFrolic ? "Setting the board and tuning the band." : "Loading the Moon Block Party beat.");
    this.input.clear?.();
    try {
      await Promise.all([
        this.transport.unlock?.(),
        this.renderer.enterMode(this.mode, this.selectedCharacter, this.selectedFrolicStyle),
      ]);
      if (isFrolic) await this.footPercussion.preload();
    } catch {
      // The fallback clock still permits play if audio hardware is unavailable.
    }
    this.applyAudioSettings();
    this.transport.setLatency?.(this.settings.latencyMs);
    this.footPercussion.setLatency(this.settings.audioLatencyMs);
    this.transport.start?.({ offsetSeconds: Math.max(0, Number(offsetSeconds) || 0) });
    const beatSnapshot = this.transport.clock.getSnapshot();
    this.simulation = this.createSimulation();
    this.simulation.begin(beatSnapshot);
    this.state = "running";
    this.renderer.reset();
    this.showLayer(null);
    this.elements.canvas.focus({ preventScroll: true });
    this.loop.resetClock();
    announce(this.elements.liveStatus, `${modeLabel(this.mode)} started with ${characterDefinition(this.selectedCharacter).displayName}.`);
  }

  createSimulation() {
    if (FROLIC_MODES.has(this.mode)) {
      return new AppalachianJamSimulation({
        mode: this.mode,
        character: this.selectedCharacter,
        style: this.selectedFrolicStyle,
        tuneMap: APPALACHIAN_TUNE_MAP,
        difficulty: this.settings.timingWindow === "extra" ? "easy" : "standard",
        reducedMotion: this.motion.reducedMotion,
        seed: 0x4b414b49,
      });
    }
    const Simulation = this.mode === "measure" || this.mode === "practice"
      ? MeasureMatchSimulation
      : DanceSimulation;
    return new Simulation({
      mode: this.mode,
      character: this.selectedCharacter,
      beatmap: this.beatmap,
      timingWindows: TIMING_WINDOWS[this.settings.timingWindow] ?? TIMING_WINDOWS.standard,
      reducedMotion: this.motion.reducedMotion,
      seed: 0x4b414b49,
    });
  }

  replayTutorialPattern(callBar = 2) {
    if (this.mode !== "measure" && this.mode !== "practice") return;
    const beat = (Math.max(1, callBar) - 1) * this.beatmap.beatsPerBar;
    const offsetSeconds = this.beatmap.offsetSeconds + beat * 60 / this.beatmap.bpm;
    this.input.clear?.();
    this.transport.start?.({ offsetSeconds });
    const beatSnapshot = this.transport.clock.getSnapshot();
    this.simulation = this.createSimulation();
    this.simulation.begin(beatSnapshot);
    this.renderer.reset();
    this.loop.resetClock();
    announce(this.elements.liveStatus, "Listen once more, then copy with Space.");
  }

  pause(reason = "player") {
    if (this.state !== "running") return;
    this.state = "paused";
    this.pauseReason = reason;
    this.transport.pause?.();
    this.sfx.stopAll();
    this.footPercussion.stopAll();
    this.input.clear?.();
    this.showLayer("pause");
    announce(this.elements.liveStatus, reason === "visibility" ? "Game paused because the tab was hidden." : "Game paused.");
  }

  resume() {
    if (this.state !== "paused") return;
    this.transport.resume?.();
    this.input.clear?.();
    this.state = "running";
    this.showLayer(null);
    this.loop.resetClock();
    this.elements.canvas.focus({ preventScroll: true });
    announce(this.elements.liveStatus, "Back to the beat.");
  }

  restart() {
    if (!this.mode) return;
    return this.startMode(this.mode);
  }

  quitToTitle() {
    this.transport.stop?.();
    this.sfx.stopAll();
    this.footPercussion.stopAll();
    this.input.clear?.();
    this.state = "title";
    delete this.host.dataset.mode;
    this.updateModePresentation();
    this.createAttractSimulation();
    this.showLayer("title");
    announce(this.elements.liveStatus, "Returned to the title.");
    this.onExit?.({ reason: "quit", snapshot: this.getSnapshot() });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.state = "destroyed";
    this.loop.stop();
    this.listeners.abort();
    if (this.ownsInput) this.input.destroy?.();
    else this.input.clear?.();
    if (this.ownsAudio) this.transport.destroy?.();
    else this.transport.stop?.();
    this.footPercussion.stopAll();
    this.host.replaceChildren();
  }

  beforeFrame(dt) {
    if (
      this.state === "running"
      && globalThis.document?.visibilityState !== "hidden"
    ) {
      this.transport.ensureRunning?.();
    }
    if (this.state === "running") this.input.update?.(dt);
  }

  fixedUpdate(dt) {
    if (this.state === "running" && this.simulation) {
      const input = this.input.consumeStep?.() ?? EMPTY_INPUT;
      if (input.pausePressed) {
        this.pause();
        return;
      }
      const beatSnapshot = this.transport.clock.getSnapshot();
      this.simulation.update(dt, beatSnapshot, input);
      this.processSimulationEvents(beatSnapshot);
      if (this.simulation.complete) this.showResults();
      return;
    }
    if (this.state === "title" && this.attract) {
      const time = performance.now() / 1000;
      const beat = time * this.beatmap.bpm / 60;
      const beatSnapshot = syntheticBeatSnapshot(beat, time, this.beatmap);
      this.attract.update(dt, beatSnapshot, EMPTY_INPUT);
    }
  }

  render(dt) {
    if (this.state === "title" && this.attract) {
      const beat = performance.now() / 1000 * this.beatmap.bpm / 60;
      const beatSnapshot = syntheticBeatSnapshot(beat, performance.now() / 1000, this.beatmap);
      const value = this.attract.getSnapshot(beatSnapshot);
      this.snapshot = Object.freeze({ ...value, started: false, callout: "", crowdHeat: 42 });
    } else if (this.simulation) {
      const beatSnapshot = this.state === "running"
        ? this.transport.clock.getSnapshot()
        : this.snapshot?.beat;
      this.snapshot = this.simulation.getSnapshot(beatSnapshot);
    }
    if (!this.snapshot) return;
    this.renderer.update(dt, this.snapshot);
    this.renderer.render(this.snapshot);
  }

  processSimulationEvents(beatSnapshot) {
    const snapshot = this.simulation.getSnapshot(beatSnapshot);
    this.simulation.consumeEvents((event) => {
      this.renderer.onEvent(event, snapshot);
      if (event.type === "moveStarted") {
        this.sfx.play(event.family === "freeze" ? "freeze" : event.family === "power" ? "powerExtend" : "moveStart");
        if (event.timing === "perfect") this.sfx.play("perfect");
      }
      if (event.type === "extended") {
        this.sfx.play("powerExtend");
        if (event.accented) this.transport.duck?.(0.1, 0.1);
      }
      if (event.type === "moveFailed") this.sfx.play("fail");
      if (event.type === "goldenChain") {
        this.sfx.play("crowd", { strength: 1, crowd: true });
        this.transport.duck?.(0.15, 0.16);
      }
      if (event.type === "rhythmHit") {
        this.sfx.play(event.judgment === "perfect" ? "perfect" : "footContact", {
          strength: event.strength ?? 0.75,
        });
      }
      if (event.type === "footContact") {
        this.footPercussion.playContact(event.immediate
          ? {
              ...event,
              inputAudioTime: this.transport.getAudioTime?.() ?? event.inputAudioTime,
            }
          : event);
        if (event.immediate && globalThis.navigator?.vibrate) globalThis.navigator.vibrate(8);
      }
      if (event.type === "tradeCall") {
        this.footPercussion.playContact({
          ...event,
          foot: "both",
          style: this.selectedFrolicStyle,
          inputAudioTime: beatSnapshot.audioTime,
          immediate: false,
        });
      }
      if (event.type === "phrasePulse" && event.score?.total >= 72) {
        this.sfx.play("crowd", { strength: 0.48, crowd: true });
      }
      if (event.type === "measureCompleted") {
        if (event.result.grade === "PURRFECT" || event.result.grade === "CLEAN") {
          this.sfx.play("crowd", { strength: event.result.grade === "PURRFECT" ? 1 : 0.65, crowd: true });
        }
      }
      if (event.type === "tutorialReplay") {
        this.replayTutorialPattern(event.callBar);
      }
      if (event.type === "roundStarted") {
        this.sfx.play("crowd", { strength: 0.7, crowd: true });
      }
      if (event.type === "roundCompleted") {
        this.onRoundComplete?.(event.breakdown);
      }
      if (event.type === "complete") {
        if (this.mode === "battle") this.onBattleComplete?.(event.result);
      }
      if (event.message) announce(this.elements.liveStatus, event.message);
    });
  }

  showResults() {
    if (this.state === "results") return;
    this.state = "results";
    this.transport.pause?.();
    this.sfx.stopAll();
    this.footPercussion.stopAll();
    this.input.clear?.();
    const result = this.simulation.result;
    const player = result.player;
    const opponent = result.opponent;
    const won = result.winner === "player";
    const isFrolic = FROLIC_MODES.has(this.mode);
    const highlight = this.simulation.getHighlightSnapshot();
    this.elements.replayHighlight.hidden = !highlight;
    if (highlight) {
      this.replayRenderer.setSettings({ ...this.settings, ...this.motion, reducedMotion: true, screenShake: 0 });
      this.replayRenderer.render(Object.freeze({
        ...highlight,
        callout: "HIGHLIGHT!",
        calloutAge: 0.35,
      }));
    }
    this.elements.resultsKicker.textContent = isFrolic
      ? this.mode === "stepShed" ? "STEP SHED COMPLETE" : "THE TUNE RESOLVES"
      : this.mode === "battle"
      ? won ? "CYPHER WON" : result.winner === "tie" ? "TIE BREAK ENERGY" : "MIKAN TAKES IT"
      : this.mode === "measure" || this.mode === "practice" ? "PHRASE COMPLETE"
      : "ROUND COMPLETE";
    this.elements.resultsTitle.textContent = isFrolic
      ? player.total >= 82 ? "Board & band, together!" : player.total >= 62 ? "The board found the tune!" : "Leave a little more air"
      : this.mode === "battle"
      ? won
        ? `${characterDefinition(this.selectedCharacter).displayName} cooked!`
        : result.winner === "tie" ? "Dead even!" : "Run it back!"
      : this.mode === "measure" || this.mode === "practice"
        ? player.total >= 82 ? "PURRFECT echo!" : player.total >= 62 ? "In the pocket!" : "Run the echo again"
        : player.total >= 70 ? "Clean round!" : "Build the next phrase";
    const resultCategories = isFrolic
      ? ["time", "tune", "flow", "footwork", "spirit"]
      : ["musicality", "vocabulary", "originality", "technique", "execution"];
    this.elements.judgeGrid.replaceChildren(...resultCategories.map((category) => {
      const cell = document.createElement("div");
      cell.className = "judge-score";
      const score = document.createElement("strong");
      score.textContent = opponent ? `${player[category]}/${opponent[category]}` : String(player[category]);
      const label = document.createElement("span");
      label.textContent = category;
      cell.append(score, label);
      return cell;
    }));
    this.elements.resultsReason.textContent = player.reasons?.slice(0, 3).join(" ")
      || (this.mode === "measure" || this.mode === "practice"
        ? "Listen to one bar, then echo the lit cells."
        : "Keep listening, varying families, and finishing cleanly.");
    this.updateRecords(result);
    this.showLayer("results");
    announce(this.elements.liveStatus, `${this.elements.resultsTitle.textContent} Score ${player.total}.`);
  }

  updateRecords(result) {
    const player = result.player;
    if (this.mode === "frolic") this.save.records.frolicBest = Math.max(this.save.records.frolicBest, player.total);
    if (this.mode === "stepShed") this.save.records.stepShedComplete = true;
    if (this.mode === "freestyle") this.save.records.freestyleBest = Math.max(this.save.records.freestyleBest, player.total);
    if (this.mode === "battle" && result.winner === "player") this.save.records.battleWins += 1;
    this.save.records.bestCrowdHeat = Math.max(this.save.records.bestCrowdHeat, player.maxCrowdHeat ?? 0);
    saveGame(this.save, this.storage);
  }

  createAttractSimulation() {
    this.renderer.preloadCharacter(this.selectedCharacter);
    const beat = performance.now() / 1000 * this.beatmap.bpm / 60;
    const snapshot = syntheticBeatSnapshot(beat, performance.now() / 1000, this.beatmap);
    this.attract = new DanceSimulation({
      mode: "practice",
      character: this.selectedCharacter,
      beatmap: this.beatmap,
      timingWindows: TIMING_WINDOWS.standard,
      reducedMotion: this.motion.reducedMotion,
    });
    this.attract.begin(snapshot);
  }

  selectCharacter(character, { persist = true } = {}) {
    this.selectedCharacter = normalizeCharacterId(character);
    this.save.selectedCharacter = this.selectedCharacter;
    this.renderer.preloadCharacter(this.selectedCharacter);
    this.replayRenderer.preloadCharacter(this.selectedCharacter);
    for (const button of this.elements.characterButtons) {
      const selected = button.dataset.character === this.selectedCharacter;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    }
    if (persist) saveGame(this.save, this.storage);
    if (this.state === "title") this.createAttractSimulation();
  }

  selectFrolicStyle(style, { persist = true } = {}) {
    this.selectedFrolicStyle = normalizeFrolicStyle(style);
    this.save.selectedFrolicStyle = this.selectedFrolicStyle;
    for (const button of this.elements.frolicStyleButtons) {
      const selected = button.dataset.frolicStyle === this.selectedFrolicStyle;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    }
    if (persist) saveGame(this.save, this.storage);
  }

  bindUi() {
    const signal = this.listeners.signal;
    for (const button of this.elements.startButtons) {
      button.addEventListener("click", () => this.startMode(button.dataset.startMode), { signal });
    }
    for (const button of this.elements.characterButtons) {
      button.addEventListener("click", () => this.selectCharacter(button.dataset.character), { signal });
    }
    for (const button of this.elements.frolicStyleButtons) {
      button.addEventListener("click", () => this.selectFrolicStyle(button.dataset.frolicStyle), { signal });
    }
    this.elements.settingsButton.addEventListener("click", () => this.showLayer("settings"), { signal });
    this.elements.controlsButton.addEventListener("click", () => this.showLayer("controls"), { signal });
    for (const button of this.host.querySelectorAll("[data-close-layer]")) {
      button.addEventListener("click", () => this.showLayer("title"), { signal });
    }
    this.elements.resumeButton.addEventListener("click", () => this.resume(), { signal });
    this.elements.restartButton.addEventListener("click", () => this.restart(), { signal });
    this.elements.quitButton.addEventListener("click", () => this.quitToTitle(), { signal });
    this.elements.resultsRetry.addEventListener("click", () => this.restart(), { signal });
    this.elements.resultsTitleButton.addEventListener("click", () => this.quitToTitle(), { signal });
    this.elements.muteButton.addEventListener("click", () => {
      this.settings.masterMute = !this.settings.masterMute;
      this.elements.muteButton.textContent = this.settings.masterMute ? "Sound off" : "Sound on";
      this.elements.muteButton.setAttribute("aria-pressed", String(this.settings.masterMute));
      this.applyAudioSettings();
      saveGame(this.save, this.storage);
    }, { signal });
    this.bindSettings(signal);
    this.bindRemapping(signal);
    globalThis.document?.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "running") this.pause("visibility");
    }, { signal });
  }

  bindSettings(signal) {
    const definitions = [
      ["controlMode", this.elements.controlMode, (value) => value],
      ["timingWindow", this.elements.timing, (value) => value],
      ["latencyMs", this.elements.latency, Number],
      ["audioLatencyMs", this.elements.audioLatency, Number],
      ["visualLatencyMs", this.elements.visualLatency, Number],
      ["screenShake", this.elements.shake, (value) => Number(value) / 100],
      ["musicVolume", this.elements.music, (value) => Number(value) / 100],
      ["effectsVolume", this.elements.effects, (value) => Number(value) / 100],
      ["crowdVolume", this.elements.crowd, (value) => Number(value) / 100],
      ["beatPulse", this.elements.beatPulse, (_value, element) => element.checked],
      ["timingLabels", this.elements.timingLabels, (_value, element) => element.checked],
      ["reducedMotion", this.elements.reducedMotion, (_value, element) => element.checked],
      ["reduceFlashes", this.elements.reduceFlashes, (_value, element) => element.checked],
    ];
    for (const [key, element, transform] of definitions) {
      element.addEventListener("input", () => {
        this.settings[key] = transform(element.value, element);
        this.motion = resolveMotionSettings(this.settings);
        this.renderer.setSettings({ ...this.settings, ...this.motion });
        if (key === "controlMode") this.input.setControlMode?.(this.settings.controlMode);
        if (key === "latencyMs") this.transport.setLatency?.(this.settings.latencyMs);
        if (key === "audioLatencyMs") this.footPercussion.setLatency(this.settings.audioLatencyMs);
        if (["musicVolume", "effectsVolume", "crowdVolume"].includes(key)) this.applyAudioSettings();
        this.syncSettingOutputs();
        saveGame(this.save, this.storage);
      }, { signal });
    }
  }

  bindRemapping(signal) {
    for (const button of this.elements.remapButtons) {
      button.addEventListener("click", () => {
        this.remapAction = button.dataset.remap;
        for (const other of this.elements.remapButtons) other.classList.toggle("is-listening", other === button);
        this.elements.remapHelp.textContent = `Press a key for ${this.remapAction}. Escape cancels.`;
      }, { signal });
    }
    globalThis.window?.addEventListener("keydown", (event) => {
      if (!this.remapAction) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code !== "Escape") {
        this.settings.bindings[this.remapAction] = event.code;
        this.input.setBindings?.(objectBindings(this.settings.bindings));
        saveGame(this.save, this.storage);
      }
      this.remapAction = "";
      this.syncRemapLabels();
      for (const button of this.elements.remapButtons) button.classList.remove("is-listening");
      this.elements.remapHelp.textContent = "Select a keycap, then press a new key. Gamepad: A / X / Y / B.";
    }, { capture: true, signal });
  }

  syncUiFromSettings() {
    this.elements.controlMode.value = this.settings.controlMode;
    this.elements.timing.value = this.settings.timingWindow;
    this.elements.latency.value = this.settings.latencyMs;
    this.elements.audioLatency.value = this.settings.audioLatencyMs;
    this.elements.visualLatency.value = this.settings.visualLatencyMs;
    this.elements.shake.value = Math.round(this.settings.screenShake * 100);
    this.elements.music.value = Math.round(this.settings.musicVolume * 100);
    this.elements.effects.value = Math.round(this.settings.effectsVolume * 100);
    this.elements.crowd.value = Math.round(this.settings.crowdVolume * 100);
    this.elements.beatPulse.checked = this.settings.beatPulse;
    this.elements.timingLabels.checked = this.settings.timingLabels;
    this.elements.reducedMotion.checked = this.settings.reducedMotion;
    this.elements.reduceFlashes.checked = this.settings.reduceFlashes;
    this.elements.muteButton.textContent = this.settings.masterMute ? "Sound off" : "Sound on";
    this.elements.muteButton.setAttribute("aria-pressed", String(this.settings.masterMute));
    this.syncSettingOutputs();
    this.syncRemapLabels();
  }

  syncSettingOutputs() {
    this.elements.latencyOutput.textContent = `${this.settings.latencyMs} ms`;
    this.elements.audioLatencyOutput.textContent = `${this.settings.audioLatencyMs} ms`;
    this.elements.visualLatencyOutput.textContent = `${this.settings.visualLatencyMs} ms`;
    this.elements.shakeOutput.textContent = `${Math.round(this.settings.screenShake * 100)}%`;
    this.elements.musicOutput.textContent = `${Math.round(this.settings.musicVolume * 100)}%`;
    this.elements.effectsOutput.textContent = `${Math.round(this.settings.effectsVolume * 100)}%`;
    this.elements.crowdOutput.textContent = `${Math.round(this.settings.crowdVolume * 100)}%`;
  }

  syncRemapLabels() {
    for (const button of this.elements.remapButtons) {
      button.textContent = keyLabel(this.settings.bindings[button.dataset.remap]);
    }
  }

  applyAudioSettings() {
    this.transport.setSettings?.({
      musicVolume: this.settings.musicVolume,
      effectsVolume: this.settings.effectsVolume,
      crowdVolume: this.settings.crowdVolume,
      masterMute: this.settings.masterMute,
    });
  }

  configureTransport(beatmap, trackUrl) {
    if (this.transport.configure) {
      this.transport.configure({ beatmap, trackUrl });
      return;
    }
    if (this.transport.clock) this.transport.clock.beatmap = beatmap;
  }

  updateModePresentation() {
    const isFrolic = FROLIC_MODES.has(this.mode) && this.state !== "title";
    if (this.elements.nowPlaying) {
      this.elements.nowPlaying.textContent = isFrolic
        ? "BOARD & BOW · 120 BPM · AABB"
        : "MOON BLOCK PARTY · 100 BPM";
    }
    if (this.elements.railMotto) {
      this.elements.railMotto.textContent = isFrolic
        ? "FOUNDATION / LICK / TRADE / FROLIC"
        : "LISTEN / COPY / FREEZE";
    }
    const labels = isFrolic
      ? { action: "STEP", style: "BRUSH", power: "DRIVE", freeze: "LICK" }
      : { action: "PAW", style: "S", power: "P", freeze: "F" };
    for (const button of this.elements.touchButtons) {
      const control = button.dataset.control;
      if (labels[control]) {
        button.textContent = labels[control];
        button.setAttribute("aria-label", labels[control]);
      }
    }
  }

  showLayer(name) {
    const mapping = {
      title: this.elements.titleLayer,
      settings: this.elements.settingsLayer,
      controls: this.elements.controlsLayer,
      pause: this.elements.pauseLayer,
      results: this.elements.resultsLayer,
    };
    for (const [key, layer] of Object.entries(mapping)) {
      const visible = key === name;
      layer.hidden = !visible;
      layer.classList.toggle("is-visible", visible);
    }
  }

  getSnapshot() {
    return Object.freeze({
      state: this.state,
      mode: this.mode,
      character: this.selectedCharacter,
      frolicStyle: this.selectedFrolicStyle,
      transport: Object.freeze({
        contextState: this.transport.context?.state ?? "fallback",
        audioClockFallback: Boolean(this.transport.clockProgress?.fallbackActive),
      }),
      settings: Object.freeze({ ...this.settings, bindings: Object.freeze({ ...this.settings.bindings }) }),
      simulation: this.snapshot,
    });
  }
}

export async function createGameDependencies() {
  const beatmap = await loadBeatmap();
  return { beatmap };
}

function collectElements(host) {
  const byId = (id) => host.querySelector(`#${id}`) ?? document.getElementById(id);
  return {
    canvas: byId("game-canvas"),
    touchControls: byId("touch-controls"),
    titleLayer: byId("title-layer"),
    settingsLayer: byId("settings-layer"),
    controlsLayer: byId("controls-layer"),
    pauseLayer: byId("pause-layer"),
    resultsLayer: byId("results-layer"),
    startButtons: [...host.querySelectorAll("[data-start-mode]")],
    characterButtons: [...host.querySelectorAll("[data-character]")],
    frolicStyleButtons: [...host.querySelectorAll("[data-frolic-style]")],
    touchButtons: [...host.querySelectorAll("#touch-controls [data-control]")],
    settingsButton: byId("settings-button"),
    controlsButton: byId("controls-button"),
    resumeButton: byId("resume-button"),
    restartButton: byId("restart-button"),
    quitButton: byId("quit-button"),
    resultsRetry: byId("results-retry"),
    resultsTitleButton: byId("results-title-button"),
    resultsKicker: byId("results-kicker"),
    resultsTitle: byId("results-title"),
    resultsReason: byId("results-reason"),
    replayHighlight: byId("replay-highlight"),
    replayCanvas: byId("replay-canvas"),
    judgeGrid: byId("judge-grid"),
    muteButton: byId("mute-button"),
    liveStatus: byId("live-status"),
    controlMode: byId("setting-control-mode"),
    timing: byId("setting-timing"),
    latency: byId("setting-latency"),
    latencyOutput: byId("latency-output"),
    audioLatency: byId("setting-audio-latency"),
    audioLatencyOutput: byId("audio-latency-output"),
    visualLatency: byId("setting-visual-latency"),
    visualLatencyOutput: byId("visual-latency-output"),
    shake: byId("setting-shake"),
    shakeOutput: byId("shake-output"),
    music: byId("setting-music"),
    musicOutput: byId("music-output"),
    effects: byId("setting-effects"),
    effectsOutput: byId("effects-output"),
    crowd: byId("setting-crowd"),
    crowdOutput: byId("crowd-output"),
    beatPulse: byId("setting-beat-pulse"),
    timingLabels: byId("setting-timing-labels"),
    reducedMotion: byId("setting-reduced-motion"),
    reduceFlashes: byId("setting-flash"),
    remapButtons: [...host.querySelectorAll("[data-remap]")],
    remapHelp: byId("remap-help"),
    nowPlaying: byId("now-playing"),
    railMotto: host.querySelector(".rail-motto"),
  };
}

function objectBindings(bindings) {
  return Object.fromEntries(Object.entries(bindings ?? {}).map(([key, code]) => [key, [code]]));
}

function syntheticBeatSnapshot(beat, time, beatmap) {
  const beatIndex = Math.floor(beat);
  const beatPhase = ((beat % 1) + 1) % 1;
  const barIndex = Math.floor(beat / beatmap.beatsPerBar);
  return Object.freeze({
    audioTime: time,
    playbackSeconds: beat * 60 / beatmap.bpm,
    beat,
    beatIndex,
    beatPhase,
    beatInBar: ((beatIndex % beatmap.beatsPerBar) + beatmap.beatsPerBar) % beatmap.beatsPerBar,
    barIndex,
    measure: barIndex + 1,
    phrase: Math.floor(barIndex / beatmap.barsPerPhrase) + 1,
    section: "attract",
    intensity: 0.62,
    bpm: beatmap.bpm,
    paused: false,
    running: true,
  });
}

function keyLabel(code) {
  return {
    Space: "Space",
    ShiftLeft: "L Shift",
    ShiftRight: "R Shift",
    KeyF: "F",
    KeyT: "T",
  }[code] ?? String(code ?? "").replace(/^Key/, "").replace(/^Digit/, "");
}

function modeLabel(mode) {
  return {
    measure: "Measure Match",
    practice: "Practice",
    frolic: "Appalachian Frolic",
    stepShed: "Step Shed",
    freestyle: "60 second Freestyle",
    battle: "Cypher Battle",
  }[mode] ?? mode;
}
