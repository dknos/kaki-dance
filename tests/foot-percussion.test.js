import assert from "node:assert/strict";
import test from "node:test";

import { FootPercussionPlayer } from "../js/audio/foot-percussion-player.js";

test("foot percussion follows the real input timestamp, latency, and round-robin order", () => {
  const starts = [];
  const sources = [];
  const context = fakeContext(starts, sources);
  const player = new FootPercussionPlayer({
    transport: { context, effectsGain: { id: "effects" } },
  });
  const first = { id: "sole-1" };
  const second = { id: "sole-2" };
  player.manifest = { groups: { softSole: { baseGain: 0.7 } } };
  player.buffers.set("softSole", [first, second]);
  player.setLatency(25);

  assert.equal(player.playContact({
    sampleGroup: "softSole",
    style: "flatfoot",
    foot: "left",
    intensity: 0.6,
    immediate: true,
    inputAudioTime: 10.01,
  }), true);
  assert.equal(player.playContact({
    sampleGroup: "softSole",
    style: "flatfoot",
    foot: "right",
    intensity: 0.6,
    immediate: true,
    inputAudioTime: 10.02,
  }), true);

  assert.deepEqual(sources.map((source) => source.buffer), [first, second]);
  assert.deepEqual(starts, [10.035, 10.045]);
  assert.equal(sources[0].playbackRate.value, 1);
  assert.equal(sources[1].playbackRate.value, 1);
  assert.deepEqual(context.panners.map((panner) => panner.pan.value), [-0.12, 0.12]);
  assert.deepEqual(
    context.filters.filter((filter) => filter.type === "peaking").map((filter) => filter.frequency.value),
    [420, 760],
  );
  assert.deepEqual(
    [player.lastSchedule.foot, player.lastSchedule.sampleGroup, player.lastSchedule.roundRobinIndex],
    ["right", "softSole", 0],
  );
});

test("clog contacts select authored tap timbres without affecting other profiles", () => {
  const starts = [];
  const sources = [];
  const context = fakeContext(starts, sources);
  const player = new FootPercussionPlayer({
    transport: { context, effectsGain: { id: "effects" } },
  });
  const warmHeel = { id: "warm-heel" };
  const tapHeel = { id: "tap-heel" };
  player.manifest = {
    groups: {
      heel: { baseGain: 0.7 },
      tapHeel: { baseGain: 0.72 },
    },
  };
  player.buffers.set("heel", [warmHeel]);
  player.buffers.set("tapHeel", [tapHeel]);

  player.playContact({ sampleGroup: "heel", style: "flatfoot", foot: "left" });
  player.playContact({ sampleGroup: "heel", style: "clog", foot: "right" });

  assert.deepEqual(sources.map((source) => source.buffer), [warmHeel, tapHeel]);
});

function fakeContext(starts, sources) {
  const context = {
    currentTime: 10,
    panners: [],
    filters: [],
    createBufferSource() {
      const source = {
        buffer: null,
        playbackRate: { value: 1 },
        connect() {},
        start(time) {
          starts.push(time);
        },
        addEventListener() {},
      };
      sources.push(source);
      return source;
    },
    createGain() {
      return {
        gain: { value: 1 },
        connect() {},
      };
    },
    createStereoPanner() {
      const panner = {
        pan: { value: 0 },
        connect() {},
      };
      context.panners.push(panner);
      return panner;
    },
    createBiquadFilter() {
      const filter = {
        type: "",
        frequency: { value: 0 },
        Q: { value: 0 },
        gain: { value: 0 },
        connect() {},
      };
      context.filters.push(filter);
      return filter;
    },
  };
  return context;
}
