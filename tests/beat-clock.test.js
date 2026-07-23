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

test("beatmap helpers validate boundaries and wrap accents", () => {
  assert.deepEqual(validateBeatmap(BEATMAP), []);
  assert.equal(sectionAtBeat(17, BEATMAP).id, "b");
  assert.equal(sectionAtBeat(33, BEATMAP).id, "a");
  assert.equal(nearestAccent(31.8, BEATMAP).label, "downbeat");
  assert.ok(validateBeatmap({ bpm: 0 }).length >= 4);
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
