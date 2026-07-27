import { clamp } from "../core/math.js";

const MANIFEST_URL = new URL("../../assets/audio/frolic/feet/manifest.json", import.meta.url);
const REJECTED_MANIFEST_URL = new URL(
  "../../docs/review/rejected-0c82fe7/assets/audio/frolic/feet/manifest.json",
  import.meta.url,
);

const CLOG_SAMPLE_MAP = Object.freeze({
  heel: "tapHeel",
  toeBall: "tapToe",
  flatContact: "tapHeel",
});

export const CONTACT_SAMPLE_MAP = Object.freeze({
  softSole: "softSole",
  flatContact: "flatContact",
  heel: "heel",
  toeBall: "toeBall",
  brush: "brush",
  skuff: "scuff",
  scuff: "scuff",
  drag: "drag",
  slide: "slide",
  chug: "chug",
  doubleTap: "tapToe",
  metalHeelTap: "tapHeel",
  metalToeTap: "tapToe",
  hopLaunch: "softSole",
  landing: "flatContact",
  boardResonance: "chug",
});

export function resolveFootSampleGroup(sampleGroup, style = "flatfoot") {
  const normalized = CONTACT_SAMPLE_MAP[sampleGroup] ?? sampleGroup;
  return style === "clog" ? CLOG_SAMPLE_MAP[normalized] ?? normalized : normalized;
}

export class FootPercussionPlayer {
  constructor({
    transport,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    manifestUrl = MANIFEST_URL,
  } = {}) {
    this.transport = transport;
    this.fetchImpl = fetchImpl;
    this.manifestUrl = manifestUrl;
    this.manifest = null;
    this.buffers = new Map();
    this.cursors = new Map();
    this.active = new Set();
    this.activeByGroup = new Map();
    this.loadPromise = null;
    this.audioLatencyMs = 0;
    this.lastSchedule = null;
    this.footBus = null;
    this.reviewVariant = "candidate";
  }

  setLatency(milliseconds) {
    this.audioLatencyMs = clamp(Number(milliseconds) || 0, -200, 200);
  }

  async setReviewVariant(value) {
    const variant = value === "rejected" ? "rejected" : "candidate";
    if (variant === this.reviewVariant && this.manifest) return true;
    this.stopAll();
    this.reviewVariant = variant;
    this.manifestUrl = variant === "rejected" ? REJECTED_MANIFEST_URL : MANIFEST_URL;
    this.manifest = null;
    this.buffers.clear();
    this.cursors.clear();
    this.loadPromise = null;
    return this.preload();
  }

  async preload() {
    if (this.loadPromise) return this.loadPromise;
    const context = this.transport?.context;
    if (!context?.decodeAudioData || !this.fetchImpl) return false;
    this.loadPromise = (async () => {
      try {
        const response = await this.fetchImpl(this.manifestUrl);
        if (!response.ok) throw new Error(`Foot percussion manifest failed: ${response.status}`);
        const manifest = await response.json();
        const entries = Object.entries(manifest.groups ?? {});
        const filenames = [...new Set(entries.flatMap(([, definition]) => definition.files))];
        const decoded = await Promise.all(filenames.map(async (filename) => {
            const sampleResponse = await this.fetchImpl(new URL(filename, this.manifestUrl));
            if (!sampleResponse.ok) throw new Error(`Foot sample failed: ${sampleResponse.status}`);
            const bytes = await sampleResponse.arrayBuffer();
            const buffer = await context.decodeAudioData(bytes);
            return [filename, buffer];
        }));
        this.manifest = Object.freeze(manifest);
        const byFilename = new Map(decoded);
        for (const [group, definition] of entries) {
          this.buffers.set(group, definition.files.map((filename) => byFilename.get(filename)));
        }
        this.ensureFootBus();
        return true;
      } catch {
        this.manifest = null;
        this.buffers.clear();
        this.loadPromise = null;
        return false;
      }
    })();
    return this.loadPromise;
  }

  playContact(event = {}) {
    const context = this.transport?.context;
    const destination = this.transport?.effectsGain;
    if (!context?.createBufferSource || !destination) return false;
    const requested = resolveFootSampleGroup(event.sampleGroup, event.style);
    const group = this.buffers.has(requested) ? requested : event.sampleGroup;
    const variants = this.buffers.get(group);
    if (!variants?.length) {
      void this.preload();
      return false;
    }
    const definition = this.manifest?.groups?.[group] ?? {};
    const layer = velocityLayer(event.intensity);
    const layerFiles = definition.layers?.[layer] ?? definition.files ?? [];
    const foot = event.foot === "right" ? "right" : event.foot === "left" ? "left" : "both";
    const cursorKey = `${group}:${layer}:${foot}`;
    const cursor = this.cursors.get(cursorKey) ?? 0;
    const footOffset = foot === "right" && Math.max(layerFiles.length, variants.length) > 1 ? 1 : 0;
    const filename = layerFiles[(cursor + footOffset) % Math.max(1, layerFiles.length)];
    const fileIndex = definition.files?.indexOf(filename) ?? -1;
    const buffer = fileIndex >= 0
      ? variants[fileIndex]
      : variants[(cursor + footOffset) % variants.length];
    this.cursors.set(cursorKey, cursor + 1);
    if (!buffer) return false;

    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    const baseGain = definition.baseGain ?? 0.7;
    const intensity = clamp(Number(event.intensity) || 0.55, 0.12, 1);
    const boardResonance = clamp(Number(event.boardResonance) || 1, 0.82, 1.18);
    gain.gain.value = clamp(baseGain * (0.5 + intensity * 0.62) * boardResonance, 0, 1.15);
    source.playbackRate.value = 1;
    source.connect(gain);

    let tail = gain;
    if (context.createBiquadFilter && foot !== "both") {
      const shoeColor = context.createBiquadFilter();
      shoeColor.type = "peaking";
      shoeColor.frequency.value = foot === "left" ? 420 : 760;
      shoeColor.Q.value = 0.62;
      shoeColor.gain.value = 0.8;
      gain.connect(shoeColor);
      tail = shoeColor;
    }
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = foot === "left" ? -0.12 : foot === "right" ? 0.12 : 0;
      tail.connect(panner);
      tail = panner;
    }
    tail.connect(this.ensureFootBus() ?? destination);

    const inputTime = Number(event.inputAudioTime);
    const baseTime = event.immediate && Number.isFinite(inputTime)
      ? Math.max(context.currentTime, inputTime)
      : context.currentTime;
    const scheduled = Math.max(context.currentTime, baseTime + this.audioLatencyMs / 1000);
    this.lastSchedule = Object.freeze({
      contactId: event.contactId ?? "",
      actionId: event.actionId ?? 0,
      rawInputTimestamp: Number.isFinite(Number(event.rawInputTimestamp))
        ? Number(event.rawInputTimestamp)
        : null,
      schedulingCallTimestamp: now(),
      scheduledAudioTime: scheduled,
      contextCurrentTime: context.currentTime,
      baseLatency: Number(context.baseLatency) || 0,
      outputLatency: Number(context.outputLatency) || 0,
      foot,
      sampleGroup: group,
      roundRobinIndex: cursor,
    });
    source.start(scheduled);
    this.active.add(source);
    const groupActive = this.activeByGroup.get(group) ?? [];
    const polyphony = Math.max(1, Number(definition.polyphony) || 5);
    while (groupActive.length >= polyphony) {
      const oldest = groupActive.shift();
      try {
        oldest?.stop();
      } catch {
        // It may have ended between the polyphony check and stop.
      }
      this.active.delete(oldest);
    }
    groupActive.push(source);
    this.activeByGroup.set(group, groupActive);
    source.addEventListener?.("ended", () => {
      this.active.delete(source);
      const active = this.activeByGroup.get(group);
      const index = active?.indexOf(source) ?? -1;
      if (index >= 0) active.splice(index, 1);
    }, { once: true });
    return true;
  }

  ensureFootBus() {
    if (this.footBus) return this.footBus;
    const context = this.transport?.context;
    const destination = this.transport?.effectsGain;
    if (!context || !destination) return destination ?? null;
    const input = context.createGain();
    input.gain.value = 1;
    let tail = input;
    if (context.createBiquadFilter) {
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 70;
      highpass.Q.value = 0.7;
      tail.connect(highpass);
      tail = highpass;
    }
    if (context.createDynamicsCompressor) {
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 8;
      compressor.ratio.value = 2;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.06;
      tail.connect(compressor);
      tail = compressor;
    }
    tail.connect(destination);
    this.footBus = input;
    return this.footBus;
  }

  stopAll() {
    for (const source of this.active) {
      try {
        source.stop();
      } catch {
        // A short sample may already have ended.
      }
      try {
        source.disconnect();
      } catch {
        // Fake audio nodes and ended sources may not expose disconnect.
      }
    }
    this.active.clear();
    this.activeByGroup.clear();
  }
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function velocityLayer(intensity) {
  const value = clamp(Number(intensity) || 0.55, 0, 1);
  if (value < 0.45) return "soft";
  if (value < 0.73) return "medium";
  return "strong";
}
