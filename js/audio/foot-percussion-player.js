import { clamp } from "../core/math.js";

const MANIFEST_URL = new URL("../../assets/audio/frolic/feet/manifest.json", import.meta.url);

const CLOG_SAMPLE_MAP = Object.freeze({
  heel: "tapHeel",
  toeBall: "tapToe",
  flatContact: "heavyAccent",
});

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
    this.loadPromise = null;
    this.audioLatencyMs = 0;
  }

  setLatency(milliseconds) {
    this.audioLatencyMs = clamp(Number(milliseconds) || 0, -200, 200);
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
        const decoded = await Promise.all(entries.flatMap(([group, definition]) => (
          definition.files.map(async (filename, index) => {
            const sampleResponse = await this.fetchImpl(new URL(filename, this.manifestUrl));
            if (!sampleResponse.ok) throw new Error(`Foot sample failed: ${sampleResponse.status}`);
            const bytes = await sampleResponse.arrayBuffer();
            const buffer = await context.decodeAudioData(bytes);
            return [group, index, buffer];
          })
        )));
        this.manifest = Object.freeze(manifest);
        for (const [group] of entries) this.buffers.set(group, []);
        for (const [group, index, buffer] of decoded) this.buffers.get(group)[index] = buffer;
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
    const requested = event.style === "clog"
      ? CLOG_SAMPLE_MAP[event.sampleGroup] ?? event.sampleGroup
      : event.sampleGroup;
    const group = this.buffers.has(requested) ? requested : event.sampleGroup;
    const variants = this.buffers.get(group);
    if (!variants?.length) {
      void this.preload();
      return false;
    }
    const cursor = this.cursors.get(group) ?? 0;
    const buffer = variants[cursor % variants.length];
    this.cursors.set(group, cursor + 1);
    if (!buffer) return false;

    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    const baseGain = this.manifest?.groups?.[group]?.baseGain ?? 0.7;
    const intensity = clamp(Number(event.intensity) || 0.55, 0.12, 1);
    const variation = 0.96 + ((cursor % 3) - 1) * 0.025;
    gain.gain.value = clamp(baseGain * (0.5 + intensity * 0.62) * variation, 0, 1.25);
    source.playbackRate.value = event.foot === "right" ? 1.012 : 0.992;
    source.connect(gain);

    let tail = gain;
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = event.foot === "left" ? -0.055 : event.foot === "right" ? 0.055 : 0;
      gain.connect(panner);
      tail = panner;
    }
    tail.connect(destination);

    const inputTime = Number(event.inputAudioTime);
    const baseTime = event.immediate && Number.isFinite(inputTime)
      ? Math.max(context.currentTime, inputTime)
      : context.currentTime;
    const scheduled = Math.max(context.currentTime, baseTime + this.audioLatencyMs / 1000);
    source.start(scheduled);
    this.active.add(source);
    source.addEventListener?.("ended", () => this.active.delete(source), { once: true });
    return true;
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
  }
}
