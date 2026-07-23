import { BeatClock } from "./beat-clock.js";
import { DEFAULT_BEATMAP } from "./beatmap.js";

const DEFAULT_TRACK_URL = new URL("../../assets/audio/moon-block-party.wav", import.meta.url);

export class MusicTransport {
  constructor({
    beatmap = DEFAULT_BEATMAP,
    trackUrl = DEFAULT_TRACK_URL,
    audioContext = null,
    fetchImpl = globalThis.fetch?.bind(globalThis),
  } = {}) {
    this.beatmap = beatmap;
    this.trackUrl = trackUrl;
    this.context = audioContext;
    this.fetchImpl = fetchImpl;
    this.clock = new BeatClock({ audioContext: this.context, beatmap });
    this.buffer = null;
    this.loadPromise = null;
    this.source = null;
    this.musicGain = null;
    this.effectsGain = null;
    this.crowdGain = null;
    this.masterGain = null;
    this.settings = {
      musicVolume: 0.8,
      effectsVolume: 0.8,
      crowdVolume: 0.75,
      masterMute: false,
    };
    this.offsetOnPause = 0;
    this.started = false;
    this.fallbackStartMs = 0;
  }

  async unlock() {
    if (!this.context) {
      const AudioContextConstructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (typeof AudioContextConstructor !== "function") {
        this.installFallbackClock();
        return false;
      }
      this.context = new AudioContextConstructor({ latencyHint: "interactive" });
      this.clock.audioContext = this.context;
      this.clock.now = () => this.context.currentTime;
    }
    if (this.context.state === "suspended") await this.context.resume();
    this.ensureGainGraph();
    await this.loadTrack();
    return Boolean(this.buffer);
  }

  ensureGainGraph() {
    if (!this.context?.createGain || this.masterGain) return;
    this.musicGain = this.context.createGain();
    this.effectsGain = this.context.createGain();
    this.crowdGain = this.context.createGain();
    this.masterGain = this.context.createGain();
    this.musicGain.connect(this.masterGain);
    this.effectsGain.connect(this.masterGain);
    this.crowdGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
    this.applySettings();
  }

  async loadTrack() {
    if (this.buffer || this.loadPromise || !this.context?.decodeAudioData || !this.fetchImpl) {
      return this.loadPromise ?? this.buffer;
    }
    this.loadPromise = (async () => {
      try {
        const response = await this.fetchImpl(this.trackUrl);
        if (!response.ok) throw new Error(`Track request failed: ${response.status}`);
        const bytes = await response.arrayBuffer();
        this.buffer = await this.context.decodeAudioData(bytes);
        return this.buffer;
      } catch {
        this.buffer = null;
        return null;
      }
    })();
    return this.loadPromise;
  }

  start({ offsetSeconds = 0 } = {}) {
    this.stopSource();
    const offset = Math.max(0, Number(offsetSeconds) || 0);
    if (this.buffer && this.context?.createBufferSource) {
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = this.buffer.duration;
      source.connect(this.musicGain);
      const startAt = this.context.currentTime + 0.035;
      source.start(startAt, offset % this.buffer.duration);
      this.source = source;
      this.clock.start({ audioTime: startAt, playbackOffset: offset });
    } else {
      this.fallbackStartMs = performance.now() - offset * 1000;
      this.installFallbackClock();
      this.clock.start({ audioTime: this.clock.now(), playbackOffset: offset });
    }
    this.started = true;
    this.offsetOnPause = offset;
  }

  pause() {
    if (!this.started) return;
    const snapshot = this.clock.pause();
    this.offsetOnPause = snapshot.playbackSeconds;
    this.stopSource();
    this.fadeMaster(0, 0.025);
  }

  resume() {
    if (!this.started) return this.start({ offsetSeconds: this.offsetOnPause });
    this.fadeMaster(this.settings.masterMute ? 0 : 1, 0.04);
    this.start({ offsetSeconds: this.offsetOnPause });
  }

  restart() {
    this.start({ offsetSeconds: 0 });
  }

  stop() {
    this.stopSource();
    this.clock.stop();
    this.started = false;
    this.offsetOnPause = 0;
  }

  destroy() {
    this.stop();
    this.context?.close?.();
  }

  setLatency(milliseconds) {
    this.clock.setLatency(milliseconds);
  }

  setSettings(settings = {}) {
    Object.assign(this.settings, settings);
    this.applySettings();
  }

  applySettings() {
    const now = this.context?.currentTime ?? 0;
    setGain(this.musicGain, this.settings.musicVolume, now);
    setGain(this.effectsGain, this.settings.effectsVolume, now);
    setGain(this.crowdGain, this.settings.crowdVolume, now);
    setGain(this.masterGain, this.settings.masterMute ? 0 : 1, now);
  }

  fadeMaster(value, duration = 0.03) {
    if (!this.masterGain || !this.context) return;
    const now = this.context.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(value, now + duration);
  }

  duck(amount = 0.12, duration = 0.12) {
    if (!this.musicGain || !this.context) return;
    const now = this.context.currentTime;
    const base = this.settings.musicVolume;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(base * (1 - amount), now);
    this.musicGain.gain.linearRampToValueAtTime(base, now + duration);
  }

  stopSource() {
    try {
      this.source?.stop();
    } catch {
      // A source can already be stopped during rapid pause/retry.
    }
    try {
      this.source?.disconnect();
    } catch {
      // Disconnect is optional for fallback/fake nodes.
    }
    this.source = null;
  }

  installFallbackClock() {
    if (this.context) return;
    this.clock.audioContext = null;
    this.clock.now = () => performance.now() / 1000;
  }
}

function setGain(node, value, time) {
  if (!node?.gain) return;
  const normalized = Math.max(0, Math.min(1, Number(value) || 0));
  node.gain.cancelScheduledValues?.(time);
  node.gain.setValueAtTime?.(normalized, time);
  if (!node.gain.setValueAtTime) node.gain.value = normalized;
}
