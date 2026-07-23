import { positiveModulo } from "../core/math.js";
import { DEFAULT_BEATMAP, sectionAtBeat } from "./beatmap.js";

export class BeatClock {
  constructor({
    audioContext = null,
    beatmap = DEFAULT_BEATMAP,
    latencyMs = 0,
    now = null,
  } = {}) {
    this.audioContext = audioContext;
    this.beatmap = beatmap;
    this.latencyMs = Number(latencyMs) || 0;
    this.now = now ?? (() => Number(this.audioContext?.currentTime) || 0);
    this.songStartAudioTime = 0;
    this.playbackOffset = 0;
    this.pausedPlayback = 0;
    this.running = false;
    this.paused = false;
  }

  start({
    audioTime = this.now(),
    playbackOffset = 0,
  } = {}) {
    this.songStartAudioTime = Number(audioTime) || 0;
    this.playbackOffset = Math.max(0, Number(playbackOffset) || 0);
    this.pausedPlayback = this.playbackOffset;
    this.running = true;
    this.paused = false;
    return this.getSnapshot(audioTime);
  }

  pause(audioTime = this.now()) {
    if (!this.running || this.paused) return this.getSnapshot(audioTime);
    this.pausedPlayback = this.playbackSecondsAt(audioTime);
    this.paused = true;
    return this.getSnapshot(audioTime);
  }

  resume(audioTime = this.now()) {
    if (!this.running) return this.start({ audioTime, playbackOffset: this.pausedPlayback });
    if (!this.paused) return this.getSnapshot(audioTime);
    this.songStartAudioTime = Number(audioTime) || 0;
    this.playbackOffset = this.pausedPlayback;
    this.paused = false;
    return this.getSnapshot(audioTime);
  }

  seek(playbackSeconds, audioTime = this.now()) {
    const target = Math.max(0, Number(playbackSeconds) || 0);
    this.playbackOffset = target;
    this.pausedPlayback = target;
    this.songStartAudioTime = Number(audioTime) || 0;
    return this.getSnapshot(audioTime);
  }

  stop() {
    this.running = false;
    this.paused = false;
    this.playbackOffset = 0;
    this.pausedPlayback = 0;
  }

  setLatency(milliseconds) {
    this.latencyMs = Number(milliseconds) || 0;
  }

  playbackSecondsAt(audioTime = this.now()) {
    if (!this.running) return this.playbackOffset;
    if (this.paused) return this.pausedPlayback;
    return Math.max(0, this.playbackOffset + (Number(audioTime) - this.songStartAudioTime));
  }

  beatAt(audioTime = this.now()) {
    const seconds = this.playbackSecondsAt(audioTime)
      - this.beatmap.offsetSeconds
      + this.latencyMs / 1000;
    return seconds * this.beatmap.bpm / 60;
  }

  getSnapshot(audioTime = this.now()) {
    const beat = this.beatAt(audioTime);
    const beatIndex = Math.floor(beat);
    const beatPhase = positiveModulo(beat, 1);
    const barIndex = Math.floor(beat / this.beatmap.beatsPerBar);
    const measure = barIndex + 1;
    const phrase = Math.floor(barIndex / this.beatmap.barsPerPhrase) + 1;
    const beatInBar = positiveModulo(beatIndex, this.beatmap.beatsPerBar);
    const section = sectionAtBeat(beat, this.beatmap);
    return Object.freeze({
      audioTime: Number(audioTime) || 0,
      playbackSeconds: this.playbackSecondsAt(audioTime),
      beat,
      beatIndex,
      beatPhase,
      beatInBar,
      barIndex,
      measure,
      phrase,
      section: section.id,
      intensity: section.intensity ?? 0.5,
      bpm: this.beatmap.bpm,
      paused: this.paused,
      running: this.running,
    });
  }
}
