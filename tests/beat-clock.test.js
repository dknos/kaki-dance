import assert from "node:assert/strict";
import test from "node:test";

import { BeatClock } from "../js/audio/beat-clock.js";
import { MusicTransport } from "../js/audio/music-transport.js";
import { nearestAccent, sectionAtBeat, validateBeatmap } from "../js/audio/beatmap.js";
import { FixedStepLoop } from "../js/core/fixed-step.js";

const BEATMAP = Object.freeze({
  id: "test",
  bpm: 120,
  offsetSeconds: 0,
  beatsPerBar: 4,
  barsPerPhrase: 4,
  loopBars: 8,
  sections: [
    { id: "a", startBar: 0, endBar: 4, intensity: 0.5 },
    { id: "b", startBar: 4, endBar: 8, intensity: 0.8 },
  ],
  accents: [{ beat: 0, strength: 1, label: "downbeat" }, { beat: 7, strength: 0.8, label: "fill" }],
});

test("BeatClock follows audio time through latency, pause, resume, and seek", () => {
  let audioTime = 10;
  const clock = new BeatClock({ beatmap: BEATMAP, now: () => audioTime });
  clock.start();
  approximate(clock.getSnapshot().beat, 0);

  audioTime = 10.75;
  approximate(clock.getSnapshot().beat, 1.5);
  clock.pause();
  audioTime = 50;
  approximate(clock.getSnapshot().beat, 1.5);
  assert.equal(clock.getSnapshot().paused, true);

  clock.resume();
  audioTime = 50.5;
  approximate(clock.getSnapshot().beat, 2.5);
  clock.setLatency(50);
  approximate(clock.getSnapshot().beat, 2.6);

  clock.seek(8);
  const snapshot = clock.getSnapshot();
  approximate(snapshot.beat, 16.1);
  assert.equal(snapshot.measure, 5);
  assert.equal(snapshot.phrase, 2);
  assert.equal(snapshot.section, "b");
});

test("MusicTransport resumes at the exact paused audio offset", () => {
  const starts = [];
  const context = {
    currentTime: 0,
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect() {},
        disconnect() {},
        stop() {},
        start(time, offset) {
          starts.push({ time, offset });
        },
      };
    },
  };
  const transport = new MusicTransport({ beatmap: BEATMAP, audioContext: context });
  transport.buffer = { duration: 32 };
  transport.musicGain = {};
  transport.start();
  context.currentTime = 1.035;
  transport.pause();
  approximate(transport.offsetOnPause, 1);

  context.currentTime = 5;
  transport.resume();
  context.currentTime = 6.035;
  approximate(transport.clock.getSnapshot().playbackSeconds, 2);
  assert.equal(starts.length, 2);
  approximate(starts[0].time, 0.035);
  approximate(starts[0].offset, 0);
  approximate(starts[1].time, 5.035);
  approximate(starts[1].offset, 1);
});

test("a one-chorus beatmap does not loop its audio source", () => {
  let source = null;
  const context = {
    currentTime: 0,
    createBufferSource() {
      source = {
        buffer: null,
        loop: true,
        connect() {},
        disconnect() {},
        stop() {},
        start() {},
      };
      return source;
    },
  };
  const transport = new MusicTransport({
    beatmap: { ...BEATMAP, loop: false },
    audioContext: context,
  });
  transport.buffer = { duration: 68 };
  transport.musicGain = {};
  transport.start();
  assert.equal(source.loop, false);
});

test("a visible running transport resumes a browser-suspended audio context", async () => {
  let resumes = 0;
  const context = {
    state: "suspended",
    resume() {
      resumes += 1;
      this.state = "running";
      return Promise.resolve();
    },
  };
  const transport = new MusicTransport({ beatmap: BEATMAP, audioContext: context });
  assert.equal(transport.ensureRunning(), true);
  assert.equal(transport.ensureRunning(), false);
  await transport.contextResumePromise;
  assert.equal(resumes, 1);
  assert.equal(context.state, "running");
});

test("a running but stalled Web Audio clock advances from a monotonic failover", () => {
  const context = {
    state: "running",
    currentTime: 12,
  };
  const transport = new MusicTransport({ beatmap: BEATMAP, audioContext: context });
  transport.started = true;
  transport.source = {};
  const wallMs = performance.now();
  transport.clockProgress = {
    rawAudioTime: 12,
    logicalAudioTime: 12,
    wallMs: wallMs - 1_000,
    lastRawAdvanceWallMs: wallMs - 1_000,
    fallbackActive: false,
  };
  const first = transport.audioClockNow();
  assert.ok(first >= 12.99);
  assert.equal(transport.clockProgress.fallbackActive, true);
  transport.clockProgress.wallMs = performance.now() - 500;
  context.currentTime = 12.1;
  assert.ok(transport.audioClockNow() >= first + 0.49);
});

test("beatmap helpers validate boundaries and wrap accents", () => {
  assert.deepEqual(validateBeatmap(BEATMAP), []);
  assert.equal(sectionAtBeat(17, BEATMAP).id, "b");
  assert.equal(sectionAtBeat(33, BEATMAP).id, "a");
  assert.equal(nearestAccent(31.8, BEATMAP).label, "downbeat");
  assert.ok(validateBeatmap({ bpm: 0 }).length >= 4);
});

test("a sixteen-bar audio loop returns to beat zero at the authored downbeat offset", () => {
  let audioTime = 0;
  const beatmap = {
    ...BEATMAP,
    bpm: 100,
    offsetSeconds: 0.084,
    loopBars: 16,
    sections: [{ id: "loop", startBar: 0, endBar: 16, intensity: 1 }],
  };
  const clock = new BeatClock({ beatmap, now: () => audioTime });
  clock.start();
  audioTime = 0.084;
  approximate(clock.getSnapshot().beat, 0);
  audioTime = 38.484;
  approximate(clock.getSnapshot().beat, 64);
  assert.equal(sectionAtBeat(clock.getSnapshot().beat, beatmap).id, "loop");
});

test("fixed-step loop caps catch-up work and stays frame-rate independent", () => {
  let scheduled = null;
  let updates = 0;
  let renderAlpha = -1;
  const loop = new FixedStepLoop({
    step: 0.01,
    maxSteps: 5,
    update: () => { updates += 1; },
    render: (alpha) => { renderAlpha = alpha; },
    now: () => 0,
    requestFrame: (callback) => {
      scheduled = callback;
      return 1;
    },
    cancelFrame() {},
  });
  loop.start();
  scheduled(1000);
  assert.equal(updates, 5);
  assert.ok(renderAlpha >= 0 && renderAlpha < 1e-8);
  loop.stop();
});

function approximate(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}
