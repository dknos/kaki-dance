import { clamp } from "./core/math.js";

export const DEAD_ZONE = 0.18;
export const TOUCH_DEAD_ZONE = 0.12;
export const TOUCH_RADIUS = 41;
export const INPUT_BUFFER_SECONDS = 0.16;
export const CONTROL_MODES = Object.freeze({ SIMPLE: "simple", ADVANCED: "advanced" });

const DEFAULT_BINDINGS = Object.freeze({
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  action: ["Space"],
  style: ["KeyF", "KeyX"],
  power: ["ShiftLeft", "ShiftRight", "KeyY"],
  freeze: ["KeyT", "KeyB"],
  toprock: ["KeyQ"],
  footwork: ["KeyE"],
  pause: ["Escape", "KeyP"],
});

const ACTIONS = Object.freeze(["action", "style", "power", "freeze", "toprock", "footwork"]);

export function createInputStep() {
  const step = { x: 0, y: 0, pausePressed: false, device: "keyboard" };
  for (const action of ACTIONS) {
    step[action] = false;
    step[`${action}Pressed`] = false;
    step[`${action}Released`] = false;
  }
  return step;
}

export class InputManager {
  constructor({
    target = globalThis.window ?? null,
    touchRoot = null,
    getGamepads = () => globalThis.navigator?.getGamepads?.() ?? [],
    controlMode = "simple",
    bindings = {},
  } = {}) {
    this.target = target;
    this.getGamepads = getGamepads;
    this.controlMode = normalizeControlMode(controlMode);
    this.bindings = mergeBindings(bindings);
    this.keys = new Set();
    this.previous = booleanRecord([...ACTIONS, "pause"]);
    this.buffers = bufferRecord(ACTIONS);
    this.releaseBuffers = bufferRecord(ACTIONS);
    this.pauseBuffer = 0;
    this.touchButtons = new Map();
    this.touchPointers = new Map();
    this.touchStick = { pointerId: null, x: 0, y: 0, element: null, rect: null };
    this.gamepad = disconnectedGamepad();
    this.step = createInputStep();
    this.lastDevice = "keyboard";
    this.enabled = true;
    this.abort = new AbortController();
    this.bindKeyboard();
    if (touchRoot) this.bindTouch(touchRoot);
  }

  bindKeyboard() {
    if (!this.target?.addEventListener) return;
    const options = { signal: this.abort.signal };
    this.target.addEventListener("keydown", (event) => {
      if (!this.isBound(event.code) || event.repeat || !this.enabled) return;
      if (isTextControl(event.target)) return;
      event.preventDefault();
      const wasDown = this.keys.has(event.code);
      this.keys.add(event.code);
      if (!wasDown) this.bufferCode(event.code, true);
      this.lastDevice = "keyboard";
    }, options);
    this.target.addEventListener("keyup", (event) => {
      if (!this.isBound(event.code)) return;
      if (!isTextControl(event.target)) event.preventDefault();
      const wasDown = this.keys.has(event.code);
      this.keys.delete(event.code);
      if (wasDown) this.bufferCode(event.code, false);
    }, options);
    this.target.addEventListener("blur", () => this.clear(), options);
  }

  bindTouch(root) {
    const options = { signal: this.abort.signal };
    for (const button of root.querySelectorAll?.("[data-control]") ?? []) {
      const control = button.dataset.control;
      if (![...ACTIONS, "pause"].includes(control)) continue;
      const release = (event) => {
        if (this.touchPointers.get(event.pointerId)?.button !== button) return;
        this.touchPointers.delete(event.pointerId);
        this.touchButtons.delete(control);
        button.classList.remove("is-active");
        this.bufferAction(control, false);
      };
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (!this.enabled) return;
        this.touchPointers.set(event.pointerId, { button, control });
        this.touchButtons.set(control, event.pointerId);
        button.classList.add("is-active");
        this.bufferAction(control, true);
        this.lastDevice = "touch";
        button.setPointerCapture?.(event.pointerId);
      }, options);
      button.addEventListener("pointerup", release, options);
      button.addEventListener("pointercancel", release, options);
      button.addEventListener("lostpointercapture", release, options);
    }
    const stick = root.querySelector?.("[data-touch-stick]");
    if (!stick) return;
    this.touchStick.element = stick;
    const move = (event) => {
      if (this.touchStick.pointerId !== event.pointerId) return;
      event.preventDefault();
      const rect = this.touchStick.rect ?? stick.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const vector = touchStickVector(event.clientX - centerX, event.clientY - centerY, Math.min(rect.width, rect.height) / 2);
      this.touchStick.x = vector.x;
      this.touchStick.y = vector.y;
      stick.style.setProperty("--stick-x", `${vector.x * 23}px`);
      stick.style.setProperty("--stick-y", `${vector.y * 23}px`);
    };
    const releaseStick = (event) => {
      if (this.touchStick.pointerId !== event.pointerId) return;
      this.touchStick.pointerId = null;
      this.touchStick.x = 0;
      this.touchStick.y = 0;
      stick.classList.remove("is-active");
      stick.style.setProperty("--stick-x", "0px");
      stick.style.setProperty("--stick-y", "0px");
    };
    stick.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (!this.enabled || this.touchStick.pointerId !== null) return;
      this.touchStick.pointerId = event.pointerId;
      this.touchStick.rect = stick.getBoundingClientRect();
      stick.classList.add("is-active");
      this.lastDevice = "touch";
      stick.setPointerCapture?.(event.pointerId);
      move(event);
    }, options);
    stick.addEventListener("pointermove", move, options);
    stick.addEventListener("pointerup", releaseStick, options);
    stick.addEventListener("pointercancel", releaseStick, options);
    stick.addEventListener("lostpointercapture", releaseStick, options);
  }

  update(dt) {
    if (!this.enabled) return;
    this.gamepad = pollGamepad(this.getGamepads);
    const keyboardX = Number(this.keyHeld("right")) - Number(this.keyHeld("left"));
    const keyboardY = Number(this.keyHeld("down")) - Number(this.keyHeld("up"));
    const gamepadActive = this.gamepad.active;
    const touchActive = this.touchStick.pointerId !== null;
    if (gamepadActive) this.lastDevice = "gamepad";
    const x = touchActive ? this.touchStick.x : gamepadActive ? this.gamepad.x : keyboardX;
    const y = touchActive ? this.touchStick.y : gamepadActive ? this.gamepad.y : keyboardY;

    const held = {};
    for (const action of ACTIONS) {
      held[action] = this.actionHeld(action) || Boolean(this.gamepad[action]);
      if (held[action] && !this.previous[action]) this.buffers[action] = INPUT_BUFFER_SECONDS;
      if (!held[action] && this.previous[action]) this.releaseBuffers[action] = INPUT_BUFFER_SECONDS;
      this.previous[action] = held[action];
    }
    const pauseHeld = this.actionHeld("pause") || this.gamepad.pause;
    if (pauseHeld && !this.previous.pause) this.pauseBuffer = INPUT_BUFFER_SECONDS;
    this.previous.pause = pauseHeld;
    for (const action of ACTIONS) {
      this.buffers[action] = Math.max(0, this.buffers[action] - dt);
      this.releaseBuffers[action] = Math.max(0, this.releaseBuffers[action] - dt);
    }
    this.pauseBuffer = Math.max(0, this.pauseBuffer - dt);
    this.step.x = clamp(x, -1, 1);
    this.step.y = clamp(y, -1, 1);
    this.step.device = this.lastDevice;
  }

  consumeStep() {
    const result = createInputStep();
    result.x = this.step.x;
    result.y = this.step.y;
    result.device = this.lastDevice;
    for (const action of ACTIONS) {
      result[action] = this.previous[action];
      result[`${action}Pressed`] = this.buffers[action] > 0;
      result[`${action}Released`] = this.releaseBuffers[action] > 0;
      if (result[`${action}Pressed`]) this.buffers[action] = 0;
      if (result[`${action}Released`]) this.releaseBuffers[action] = 0;
    }
    result.pausePressed = this.pauseBuffer > 0;
    if (result.pausePressed) this.pauseBuffer = 0;
    return result;
  }

  setControlMode(mode) {
    this.controlMode = normalizeControlMode(mode);
    this.clearEdges();
  }

  setBindings(bindings = {}) {
    this.bindings = mergeBindings(bindings);
    this.clear();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.clear();
  }

  clearEdges() {
    for (const action of ACTIONS) {
      this.buffers[action] = 0;
      this.releaseBuffers[action] = 0;
      this.previous[action] = false;
    }
    this.pauseBuffer = 0;
    this.previous.pause = false;
  }

  clear() {
    this.keys.clear();
    this.touchButtons.clear();
    this.touchPointers.clear();
    this.touchStick.pointerId = null;
    this.touchStick.x = 0;
    this.touchStick.y = 0;
    this.touchStick.element?.classList.remove("is-active");
    this.touchStick.element?.style.setProperty("--stick-x", "0px");
    this.touchStick.element?.style.setProperty("--stick-y", "0px");
    this.gamepad = disconnectedGamepad();
    this.step = createInputStep();
    this.clearEdges();
  }

  destroy() {
    this.abort.abort();
    this.clear();
    this.enabled = false;
  }

  keyHeld(action) {
    if (this.controlMode === "advanced") {
      const direct = {
        action: ["Space"],
        style: ["KeyX"],
        power: ["KeyF"],
        freeze: ["KeyT"],
        toprock: ["KeyQ"],
        footwork: ["KeyE"],
      }[action];
      if (direct?.some((code) => this.keys.has(code))) return true;
    } else if (["toprock", "footwork"].includes(action)) {
      return false;
    }
    return (this.bindings[action] ?? []).some((code) => this.keys.has(code));
  }

  actionHeld(action) {
    return this.keyHeld(action) || this.touchButtons.has(action);
  }

  isBound(code) {
    return Object.values(this.bindings).some((codes) => codes.includes(code));
  }

  bufferCode(code, pressedEdge) {
    for (const action of this.actionsForCode(code)) this.bufferAction(action, pressedEdge);
  }

  bufferAction(action, pressedEdge) {
    if (action === "pause") {
      if (pressedEdge) this.pauseBuffer = INPUT_BUFFER_SECONDS;
      return;
    }
    if (!ACTIONS.includes(action)) return;
    if (pressedEdge) this.buffers[action] = INPUT_BUFFER_SECONDS;
    else this.releaseBuffers[action] = INPUT_BUFFER_SECONDS;
  }

  actionsForCode(code) {
    if (this.controlMode === "advanced") {
      const direct = {
        Space: "action",
        KeyX: "style",
        KeyF: "power",
        KeyT: "freeze",
        KeyQ: "toprock",
        KeyE: "footwork",
      }[code];
      if (direct) return [direct];
    }
    const actions = [];
    for (const [action, codes] of Object.entries(this.bindings)) {
      if (codes.includes(code)) actions.push(action);
    }
    if (this.controlMode !== "advanced") {
      return actions.filter((action) => !["toprock", "footwork"].includes(action));
    }
    return actions;
  }
}

export function applyDeadZone(value, deadZone = DEAD_ZONE) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const magnitude = Math.abs(numeric);
  if (magnitude <= deadZone) return 0;
  return Math.sign(numeric) * (magnitude - deadZone) / (1 - deadZone);
}

export function touchStickVector(deltaX, deltaY, radius = TOUCH_RADIUS, deadZone = TOUCH_DEAD_ZONE) {
  const x = Number(deltaX);
  const y = Number(deltaY);
  const safeRadius = Number(radius);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(safeRadius > 0)) return { x: 0, y: 0 };
  const distance = Math.hypot(x, y);
  if (!distance) return { x: 0, y: 0 };
  const raw = Math.min(1, distance / safeRadius);
  if (raw <= deadZone) return { x: 0, y: 0 };
  const magnitude = (raw - deadZone) / (1 - deadZone);
  return { x: x / distance * magnitude, y: y / distance * magnitude };
}

export function pollGamepad(getGamepads) {
  let pads = [];
  try {
    pads = typeof getGamepads === "function" ? getGamepads() : [];
  } catch {
    return disconnectedGamepad();
  }
  for (const pad of pads ?? []) {
    if (!pad) continue;
    const x = applyDeadZone(pad.axes?.[0] ?? 0);
    const y = applyDeadZone(pad.axes?.[1] ?? 0);
    const result = {
      x,
      y,
      action: pressed(pad, 0),
      style: pressed(pad, 2),
      power: pressed(pad, 3),
      freeze: pressed(pad, 1),
      toprock: pressed(pad, 4),
      footwork: pressed(pad, 5),
      pause: pressed(pad, 9),
    };
    result.active = Math.abs(x) > 0 || Math.abs(y) > 0
      || Object.entries(result).some(([key, value]) => !["x", "y", "active"].includes(key) && value);
    return result;
  }
  return disconnectedGamepad();
}

export function normalizeControlMode(value) {
  return value === "advanced" ? "advanced" : "simple";
}

function mergeBindings(overrides) {
  const result = {};
  for (const [action, defaults] of Object.entries(DEFAULT_BINDINGS)) {
    const custom = overrides[action];
    result[action] = Array.isArray(custom)
      ? [...new Set([
          ...custom,
          ...defaults.filter((code) => code.startsWith("Arrow") || ["Escape", "KeyP"].includes(code)),
        ])]
      : [...defaults];
  }
  return result;
}

function booleanRecord(keys) {
  return Object.fromEntries(keys.map((key) => [key, false]));
}

function bufferRecord(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function pressed(pad, index) {
  return Boolean(pad.buttons?.[index]?.pressed || (pad.buttons?.[index]?.value ?? 0) > 0.5);
}

function disconnectedGamepad() {
  return {
    active: false, x: 0, y: 0, action: false, style: false, power: false,
    freeze: false, toprock: false, footwork: false, pause: false,
  };
}

function isTextControl(target) {
  const name = String(target?.tagName ?? "").toUpperCase();
  return Boolean(target?.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(name));
}
