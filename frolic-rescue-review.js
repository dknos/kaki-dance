const frame = document.getElementById("game-frame");
const canvas = document.getElementById("review-canvas");
const context = canvas.getContext("2d");
const empty = document.getElementById("camera-empty");
const state = {
  started: false,
  hero: "kitty",
  art: "candidate",
  foley: "candidate",
  music: true,
  effects: true,
  overlay: false,
  speed: 1,
  heldDirection: "",
  manifest: null,
  roundRobin: 0,
};

context.imageSmoothingEnabled = false;
frame.addEventListener("load", () => mirrorFrame());
document.getElementById("start-review").addEventListener("click", startReview);

for (const button of document.querySelectorAll("[data-hero]")) {
  button.addEventListener("click", async () => {
    state.hero = button.dataset.hero;
    selectPressed("[data-hero]", "hero", state.hero);
    await app()?.start({
      mode: "frolic",
      character: state.hero,
      style: "flatfoot",
      offsetSeconds: 4,
      immediate: true,
    });
    await applyRuntimeReviewState();
    updateMedia();
  });
}

for (const button of document.querySelectorAll("[data-art]")) {
  button.addEventListener("click", async () => {
    state.art = button.dataset.art;
    selectPressed("[data-art]", "art", state.art);
    await app()?.setFrolicReviewArt(state.art);
    updateCaption();
  });
}

for (const button of document.querySelectorAll("[data-foley]")) {
  button.addEventListener("click", async () => {
    state.foley = button.dataset.foley;
    selectPressed("[data-foley]", "foley", state.foley);
    await app()?.setFrolicReviewFoley(state.foley);
    await loadFoleyManifest();
    updateCaption();
  });
}

document.getElementById("overlay-toggle").addEventListener("change", (event) => {
  state.overlay = event.target.checked;
  app()?.setFrolicDebugOverlay(state.overlay);
});

document.getElementById("music-toggle").addEventListener("change", (event) => {
  state.music = event.target.checked;
  applyMix();
});

document.getElementById("effects-toggle").addEventListener("change", (event) => {
  state.effects = event.target.checked;
  app()?.setFrolicQaMode(!state.effects);
  applyMix();
});

for (const button of document.querySelectorAll("[data-key]")) {
  const code = button.dataset.key;
  const direction = code.startsWith("Arrow");
  if (direction) {
    button.addEventListener("pointerdown", () => {
      state.heldDirection = code;
      dispatchKey(code, "keydown");
    });
    const release = () => {
      dispatchKey(code, "keyup");
      if (state.heldDirection === code) state.heldDirection = "";
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", (event) => {
      if (event.buttons) release();
    });
  } else {
    button.addEventListener("click", () => {
      button.dataset.pressCount = String((Number(button.dataset.pressCount) || 0) + 1);
      dispatchKey(code, "keydown");
      dispatchKey(code, "keyup");
      button.classList.add("flash");
      setTimeout(() => button.classList.remove("flash"), 120);
      updateLatency();
    });
  }
}

for (const button of document.querySelectorAll("[data-speed]")) {
  button.addEventListener("click", () => {
    state.speed = Number(button.dataset.speed);
    selectPressed("[data-speed]", "speed", String(state.speed));
    const video = document.getElementById("movement-video");
    video.playbackRate = state.speed;
    document.getElementById("movement-caption").textContent =
      `${state.hero === "kitty" ? "KittyKaki" : "Soter"} · ${state.speed === 0.5 ? "half" : "normal"} speed`;
  });
}

const family = document.getElementById("foley-family");
const layer = document.getElementById("foley-layer");
family.addEventListener("change", rebuildSampleButtons);
layer.addEventListener("change", rebuildSampleButtons);
document.getElementById("round-robin").addEventListener("click", playRoundRobin);
document.getElementById("random-sequence").addEventListener("click", playRandomSequence);
document.getElementById("audition-music").addEventListener("change", toggleAuditionMusic);

let audio = null;
function ensureAudio() {
  if (audio) return audio;
  const audioContext = new AudioContext({ latencyHint: "interactive" });
  const footInput = audioContext.createGain();
  const sourceHighpass = audioContext.createBiquadFilter();
  sourceHighpass.type = "highpass";
  sourceHighpass.frequency.value = state.foley === "candidate" ? 100 : 20;
  const busHighpass = audioContext.createBiquadFilter();
  busHighpass.type = "highpass";
  busHighpass.frequency.value = state.foley === "candidate" ? 70 : 20;
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.ratio.value = 2;
  const footAnalyser = audioContext.createAnalyser();
  const mixAnalyser = audioContext.createAnalyser();
  const musicGain = audioContext.createGain();
  const destination = audioContext.createGain();
  footInput.connect(sourceHighpass);
  sourceHighpass.connect(busHighpass);
  busHighpass.connect(compressor);
  compressor.connect(footAnalyser);
  footAnalyser.connect(mixAnalyser);
  musicGain.connect(mixAnalyser);
  mixAnalyser.connect(destination);
  destination.connect(audioContext.destination);
  const musicElement = document.getElementById("audition-music-track");
  const musicSource = audioContext.createMediaElementSource(musicElement);
  musicSource.connect(musicGain);
  audio = {
    context: audioContext,
    footInput,
    sourceHighpass,
    busHighpass,
    footAnalyser,
    mixAnalyser,
    musicGain,
    musicElement,
  };
  updateMeters();
  return audio;
}

async function startReview() {
  const game = app();
  if (!game) {
    document.getElementById("camera-caption").textContent = "Runtime is still loading. Press Start again.";
    return;
  }
  state.started = true;
  document.documentElement.dataset.runtime = "loading";
  await game.start({
    mode: "frolic",
    character: state.hero,
    style: "flatfoot",
    offsetSeconds: 4,
    immediate: true,
  });
  await applyRuntimeReviewState();
  await loadFoleyManifest();
  empty.hidden = true;
  document.documentElement.dataset.runtime = "ready";
  document.getElementById("start-review").textContent = "Restart live review";
}

async function applyRuntimeReviewState() {
  const game = app();
  if (!game) return;
  await game.setFrolicReviewArt(state.art);
  await game.setFrolicReviewFoley(state.foley);
  game.setFrolicDebugOverlay(state.overlay);
  game.setFrolicQaMode(!state.effects);
  applyMix();
  updateCaption();
}

function applyMix() {
  app()?.setFrolicReviewMix({ music: state.music, effects: state.effects });
}

function app() {
  return frame.contentWindow?.kakiDance ?? null;
}

function dispatchKey(code, type) {
  if (!state.started) return;
  app()?.setFrolicReviewKey(code, type === "keydown");
}

function mirrorFrame() {
  const source = frame.contentDocument?.getElementById("game-canvas");
  if (source) {
    context.clearRect(0, 0, 384, 216);
    context.drawImage(source, 0, 0, 384, 216);
  }
  requestAnimationFrame(mirrorFrame);
}

function updateLatency() {
  requestAnimationFrame(() => {
    const record = app()?.getFrolicLatencyRecords().at(-1);
    if (!record) return;
    setText("latency-simulation", milliseconds(record.simulationReceiptTimestamp - record.rawEventTimestamp));
    setText("latency-audio", milliseconds(record.audioSchedulingTimestamp - record.rawEventTimestamp));
    setText("latency-render", milliseconds(record.immediateRenderCompletedTimestamp - record.rawEventTimestamp));
    setText(
      "latency-context",
      `${(record.audioContextBaseLatency * 1000).toFixed(1)} / ${(record.audioContextOutputLatency * 1000).toFixed(1)} ms`,
    );
  });
}

async function loadFoleyManifest() {
  const path = state.foley === "candidate"
    ? "assets/audio/frolic/feet/manifest.json"
    : "docs/review/rejected-0c82fe7/assets/audio/frolic/feet/manifest.json";
  const response = await fetch(path);
  state.manifest = await response.json();
  family.replaceChildren(...Object.entries(state.manifest.groups)
    .filter(([, definition]) => !definition.aliasOf)
    .map(([id, definition]) => new Option(definition.label ?? id, id)));
  family.value = family.value || "heel";
  if (![...family.options].some((option) => option.value === family.value)) family.selectedIndex = 0;
  if (audio) {
    audio.sourceHighpass.frequency.value = state.foley === "candidate" ? 100 : 20;
    audio.busHighpass.frequency.value = state.foley === "candidate" ? 70 : 20;
  }
  rebuildSampleButtons();
}

function rebuildSampleButtons() {
  const definition = state.manifest?.groups?.[family.value];
  if (!definition) return;
  const files = definition.layers?.[layer.value] ?? definition.files;
  document.getElementById("sample-buttons").replaceChildren(...files.map((filename, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${layer.value} ${index + 1}`;
    button.addEventListener("click", () => playSample(filename));
    return button;
  }));
}

async function playRoundRobin() {
  const definition = state.manifest?.groups?.[family.value];
  if (!definition) return;
  const files = definition.layers?.[layer.value] ?? definition.files;
  const file = files[state.roundRobin % files.length];
  state.roundRobin += 1;
  await playSample(file);
}

async function playRandomSequence() {
  const definition = state.manifest?.groups?.[family.value];
  if (!definition) return;
  const files = [...(definition.layers?.[layer.value] ?? definition.files)];
  for (let index = files.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [files[index], files[swap]] = [files[swap], files[index]];
  }
  for (const file of files) {
    await playSample(file);
    await new Promise((resolve) => setTimeout(resolve, 240));
  }
}

async function playSample(filename) {
  const graph = ensureAudio();
  await graph.context.resume();
  const root = state.foley === "candidate"
    ? "assets/audio/frolic/feet/"
    : "docs/review/rejected-0c82fe7/assets/audio/frolic/feet/";
  const response = await fetch(`${root}${filename}`);
  const buffer = await graph.context.decodeAudioData(await response.arrayBuffer());
  const source = graph.context.createBufferSource();
  source.buffer = buffer;
  source.connect(graph.footInput);
  source.start();
  document.getElementById("audition-status").textContent =
    `${state.foley === "candidate" ? "Candidate" : "Rejected"} · ${family.options[family.selectedIndex].text} · ${filename}`;
}

async function toggleAuditionMusic(event) {
  const graph = ensureAudio();
  await graph.context.resume();
  if (event.target.checked) await graph.musicElement.play();
  else graph.musicElement.pause();
}

function updateMeters() {
  if (!audio) return;
  setMeter(audio.footAnalyser, document.getElementById("foot-meter"));
  setMeter(audio.mixAnalyser, document.getElementById("mix-meter"));
  requestAnimationFrame(updateMeters);
}

function setMeter(analyser, meter) {
  const samples = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
  meter.value = Math.min(1, Math.sqrt(sum / samples.length) * 2.8);
}

function updateCaption() {
  document.getElementById("camera-caption").textContent =
    `${capitalize(state.art)} art · ${capitalize(state.foley)} Foley · ${state.hero === "kitty" ? "KittyKaki" : "Soter"} · Flatfoot`;
}

function updateMedia() {
  const video = document.getElementById("movement-video");
  video.src = `docs/review/frolic-rescue-candidate-1/video/${state.hero}-flatfoot-normal.mp4`;
  video.playbackRate = state.speed;
  document.getElementById("diagnostic-image").src =
    `docs/review/frolic-rescue-candidate-1/diagnostics/${state.hero}-contact-diagnostic.png`;
  document.getElementById("diagnostic-image").alt =
    `${state.hero === "kitty" ? "KittyKaki" : "Soter"} skeleton and contact diagnostic`;
  document.getElementById("comparison-image").src =
    `docs/review/frolic-rescue-candidate-1/comparisons/${state.hero}-rejected-vs-candidate.png`;
  document.getElementById("movement-caption").textContent =
    `${state.hero === "kitty" ? "KittyKaki" : "Soter"} · ${state.speed === 0.5 ? "half" : "normal"} speed`;
}

function selectPressed(selector, key, value) {
  for (const button of document.querySelectorAll(selector)) {
    button.setAttribute("aria-pressed", String(button.dataset[key] === value));
  }
}

function milliseconds(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "—";
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function capitalize(value) {
  return value[0].toUpperCase() + value.slice(1);
}
