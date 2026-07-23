import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDeadZone,
  InputManager,
  pollGamepad,
  touchStickVector,
} from "../js/input.js";

test("press and release edges survive a complete tap between simulation polls", () => {
  const input = new InputManager({ target: null });
  input.bufferCode("Space", true);
  input.bufferCode("Space", false);
  input.update(1 / 120);
  const step = input.consumeStep();
  assert.equal(step.actionPressed, true);
  assert.equal(step.actionReleased, true);
  assert.equal(step.action, false);
  assert.equal(input.consumeStep().actionPressed, false);
  input.destroy();
});

test("simple and advanced mappings preserve contextual and Q/E/F/T controls", () => {
  const input = new InputManager({ target: null, controlMode: "simple" });
  input.bufferCode("KeyF", true);
  assert.equal(input.consumeStep().stylePressed, true);
  input.setControlMode("advanced");
  input.bufferCode("KeyQ", true);
  input.bufferCode("KeyE", true);
  input.bufferCode("KeyF", true);
  const step = input.consumeStep();
  assert.equal(step.toprockPressed, true);
  assert.equal(step.footworkPressed, true);
  assert.equal(step.powerPressed, true);
  assert.equal(step.stylePressed, false);
  input.destroy();
});

test("analog dead zones and touch vectors are normalized", () => {
  assert.equal(applyDeadZone(0.1), 0);
  assert.equal(applyDeadZone(-0.18), 0);
  assert.ok(applyDeadZone(0.6) > 0 && applyDeadZone(0.6) < 0.6);
  assert.deepEqual(touchStickVector(1, 1, 40), { x: 0, y: 0 });
  const diagonal = touchStickVector(40, 40, 40);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9);
});

test("gamepad polling exposes the same actions without hidden input rules", () => {
  const buttons = Array.from({ length: 10 }, () => ({ pressed: false, value: 0 }));
  buttons[0].pressed = true;
  buttons[3].value = 1;
  const result = pollGamepad(() => [{ axes: [0.5, -0.5], buttons }]);
  assert.equal(result.active, true);
  assert.equal(result.action, true);
  assert.equal(result.power, true);
  assert.ok(result.x > 0);
  assert.ok(result.y < 0);
});

test("direction keys are remappable while arrow-key accessibility stays available", () => {
  const input = new InputManager({ target: null, bindings: { left: ["KeyJ"] } });
  input.keys.add("KeyJ");
  input.update(1 / 120);
  assert.equal(input.consumeStep().x, -1);
  input.keys.clear();
  input.keys.add("KeyA");
  input.update(1 / 120);
  assert.equal(input.consumeStep().x, 0);
  input.keys.clear();
  input.keys.add("ArrowLeft");
  input.update(1 / 120);
  assert.equal(input.consumeStep().x, -1);
  input.destroy();
});
