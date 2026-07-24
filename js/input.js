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
  action: ["KeyZ", "Space"],
  style: ["KeyX", "KeyF"],
  power: ["KeyC", "ShiftLeft", "ShiftRight", "KeyY"],
  freeze: ["KeyV", "KeyT", "KeyB"],
  toprock: ["KeyQ"],
  footwork: ["KeyE"],
  jump: ["Space"],
  handAccent: ["KeyR"],
  pause: ["Escape", "KeyP"],
});

const ACTIONS = Object.freeze([
  "action", "style", "power", "freeze", "toprock", "footwork", "jump", "handAccent",
]);
const SIMULATOR_HELD_CONTROLS = Object.freeze([
  "leftArmModifier", "rightArmModifier", "bodyModifier", "commitModifier",
]);
const SIMULATOR_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "KeyQ", "KeyE", "ControlLeft", "ControlRight",
  "ShiftLeft", "ShiftRight", "Space", "KeyZ", "KeyX", "KeyC", "KeyR",
]);
const REQUIRED_ALIASES = Object.freeze({
  action: Object.freeze(["KeyZ", "Space"]),
  style: Object.freeze(["KeyX", "KeyF"]),
  power: Object.freeze(["KeyC", "ShiftLeft", "ShiftRight"]),
  freeze: Object.freeze(["KeyV", "KeyT"]),
});

export function createInputStep() {
  const step = {
    x: 0,
    y: 0,
    travelX: 0,
    travelY: 0,
    armX: 0,
    armY: 0,
    leftArmModifier: false,
    rightArmModifier: false,
    bodyModifier: false,
    groundModifier: false,
    commitModifier: false,
    turnDirection: 0,
    paletteDirection: 0,
    pausePressed: false,
    device: "keyboard",
    profile: "legacy",
  };
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
    profile = "legacy",
    onActionEdge = null,
  } = {}) {
    this.target = target;
    this.getGamepads = getGamepads;
    this.controlMode = normalizeControlMode(controlMode);
    this.profile = normalizeInputProfile(profile);
    this.bindings = mergeBindings(bindings);
    this.keys = new Set();
    this.previous = booleanRecord([...ACTIONS, "pause"]);
    this.buffers = bufferRecord(ACTIONS);
    this.releaseBuffers = bufferRecord(ACTIONS);
    this.edgeMetadata = Object.fromEntries(ACTIONS.map((action) => [action, null]));
    this.directHeld = new Set();
    this.onActionEdge = onActionEdge;
    this.pauseBuffer = 0;
    this.touchButtons = new Map();
    this.touchPointers = new Map();
    this.touchSticks = {
      travel: { pointerId: null, x: 0, y: 0, element: null, rect: null },
      arms: { pointerId: null, x: 0, y: 0, element: null, rect: null },
    };
    this.touchStick = this.touchSticks.travel;
    this.gamepad = disconnectedGamepad();
    this.step = createInputStep();
    this.step.profile = this.profile;
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
      if (!wasDown) {
        this.bufferCode(event.code, true, {
          rawTimeStamp: event.timeStamp,
          receivedTimeStamp: now(),
          device: "keyboard",
          code: event.code,
        });
      }
      this.lastDevice = "keyboard";
    }, options);
    this.target.addEventListener("keyup", (event) => {
      if (!this.isBound(event.code)) return;
      if (!isTextControl(event.target)) event.preventDefault();
      const wasDown = this.keys.has(event.code);
      this.keys.delete(event.code);
      if (wasDown) {
        this.bufferCode(event.code, false, {
          rawTimeStamp: event.timeStamp,
          receivedTimeStamp: now(),
          device: "keyboard",
          code: event.code,
        });
      }
    }, options);
    this.target.addEventListener("blur", () => this.clear(), options);
  }

  bindTouch(root) {
    const options = { signal: this.abort.signal };
    for (const button of root.querySelectorAll?.("[data-control]") ?? []) {
      const control = button.dataset.control;
      if (![...ACTIONS, ...SIMULATOR_HELD_CONTROLS, "pause"].includes(control)) continue;
      const release = (event) => {
        if (this.touchPointers.get(event.pointerId)?.button !== button) return;
        this.touchPointers.delete(event.pointerId);
        this.touchButtons.delete(control);
        button.classList.remove("is-active");
        this.bufferAction(control, false, {
          rawTimeStamp: event.timeStamp,
          receivedTimeStamp: now(),
          device: "touch",
          pointerType: event.pointerType || "touch",
        });
      };
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (!this.enabled) return;
        this.touchPointers.set(event.pointerId, { button, control });
        this.touchButtons.set(control, event.pointerId);
        button.classList.add("is-active");
        this.bufferAction(control, true, {
          rawTimeStamp: event.timeStamp,
          receivedTimeStamp: now(),
          device: "touch",
          pointerType: event.pointerType || "touch",
        });
        this.lastDevice = "touch";
        try {
          button.setPointerCapture?.(event.pointerId);
        } catch {
          // Synthetic QA events cannot own browser pointer capture.
        }
      }, options);
      button.addEventListener("pointerup", release, options);
      button.addEventListener("pointercancel", release, options);
      button.addEventListener("lostpointercapture", release, options);
    }
    const sticks = [...(root.querySelectorAll?.("[data-touch-stick]") ?? [])];
    sticks.forEach((stick, index) => {
      const role = stick.dataset.touchStick === "arms" || index === 1 ? "arms" : "travel";
      const state = this.touchSticks[role];
      state.element = stick;
      const move = (event) => {
        if (state.pointerId !== event.pointerId) return;
        event.preventDefault();
        const rect = state.rect ?? stick.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const vector = touchStickVector(
          event.clientX - centerX,
          event.clientY - centerY,
          Math.min(rect.width, rect.height) / 2,
        );
        state.x = vector.x;
        state.y = vector.y;
        stick.style.setProperty("--stick-x", `${vector.x * 23}px`);
        stick.style.setProperty("--stick-y", `${vector.y * 23}px`);
      };
      const releaseStick = (event) => {
        if (state.pointerId !== event.pointerId) return;
        state.pointerId = null;
        state.x = 0;
        state.y = 0;
        stick.classList.remove("is-active");
        stick.style.setProperty("--stick-x", "0px");
        stick.style.setProperty("--stick-y", "0px");
      };
      stick.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (!this.enabled || state.pointerId !== null) return;
        state.pointerId = event.pointerId;
        state.rect = stick.getBoundingClientRect();
        stick.classList.add("is-active");
        this.lastDevice = "touch";
        try {
          stick.setPointerCapture?.(event.pointerId);
        } catch {
          // Synthetic QA events cannot own browser pointer capture.
        }
        move(event);
      }, options);
      stick.addEventListener("pointermove", move, options);
      stick.addEventListener("pointerup", releaseStick, options);
      stick.addEventListener("pointercancel", releaseStick, options);
      stick.addEventListener("lostpointercapture", releaseStick, options);
    });
  }

  update(dt) {
    if (!this.enabled) return;
    this.gamepad = pollGamepad(this.getGamepads);
    const simulator = this.profile === "appalachian";
    const keyboardX = simulator
      ? Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"))
      : Number(this.keyHeld("right")) - Number(this.keyHeld("left"));
    const keyboardY = simulator
      ? Number(this.keys.has("KeyS")) - Number(this.keys.has("KeyW"))
      : Number(this.keyHeld("down")) - Number(this.keyHeld("up"));
    const keyboardArmX = Number(this.keys.has("ArrowRight")) - Number(this.keys.has("ArrowLeft"));
    const keyboardArmY = Number(this.keys.has("ArrowUp")) - Number(this.keys.has("ArrowDown"));
    const gamepadActive = this.gamepad.active;
    const touchActive = this.touchSticks.travel.pointerId !== null;
    const armTouchActive = this.touchSticks.arms.pointerId !== null;
    if (gamepadActive) this.lastDevice = "gamepad";
    const gamepadTravelActive = Math.hypot(this.gamepad.x, this.gamepad.y) > 0;
    const gamepadArmActive = Math.hypot(this.gamepad.armX, this.gamepad.armY) > 0;
    const x = touchActive ? this.touchSticks.travel.x : gamepadTravelActive ? this.gamepad.x : keyboardX;
    const y = touchActive ? this.touchSticks.travel.y : gamepadTravelActive ? this.gamepad.y : keyboardY;
    const armX = armTouchActive ? this.touchSticks.arms.x : gamepadArmActive ? this.gamepad.armX : keyboardArmX;
    const armY = armTouchActive ? -this.touchSticks.arms.y : gamepadArmActive ? this.gamepad.armY : keyboardArmY;

    const held = {};
    for (const action of ACTIONS) {
      held[action] = this.actionHeld(action) || this.gamepadActionHeld(action);
      if (held[action] && !this.previous[action]) {
        if (this.directHeld.has(action)) {
          this.directHeld.delete(action);
        } else {
          this.bufferAction(action, true, {
            rawTimeStamp: now(),
            receivedTimeStamp: now(),
            device: this.gamepadActionHeld(action) ? "gamepad" : this.lastDevice,
          });
        }
      }
      if (!held[action] && this.previous[action]) {
        this.bufferAction(action, false, {
          rawTimeStamp: now(),
          receivedTimeStamp: now(),
          device: this.lastDevice,
        });
      }
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
    this.step.travelX = this.step.x;
    this.step.travelY = this.step.y;
    this.step.armX = simulator ? clamp(armX, -1, 1) : 0;
    this.step.armY = simulator ? clamp(armY, -1, 1) : 0;
    this.step.leftArmModifier = simulator && (
      this.keys.has("KeyQ")
      || this.touchButtons.has("leftArmModifier")
      || this.gamepad.leftArmModifier
    );
    this.step.rightArmModifier = simulator && (
      this.keys.has("KeyE")
      || this.touchButtons.has("rightArmModifier")
      || this.gamepad.rightArmModifier
    );
    this.step.bodyModifier = simulator && (
      this.keys.has("ControlLeft")
      || this.keys.has("ControlRight")
      || this.touchButtons.has("bodyModifier")
      || this.gamepad.bodyModifier
    );
    this.step.groundModifier = this.step.bodyModifier;
    this.step.commitModifier = simulator && (
      this.keys.has("ShiftLeft")
      || this.keys.has("ShiftRight")
      || this.touchButtons.has("commitModifier")
      || this.gamepad.commitModifier
    );
    this.step.turnDirection = simulator
      ? Number(this.gamepad.dpadRight || this.keys.has("KeyD")) - Number(this.gamepad.dpadLeft || this.keys.has("KeyA"))
      : 0;
    this.step.paletteDirection = simulator
      ? Number(this.gamepad.dpadUp) - Number(this.gamepad.dpadDown)
      : 0;
    this.step.profile = this.profile;
    this.step.device = this.lastDevice;
  }

  consumeStep() {
    const result = createInputStep();
    copyContinuousFields(result, this.step);
    for (const action of ACTIONS) {
      result[action] = this.previous[action];
      result[`${action}Pressed`] = this.buffers[action] > 0;
      result[`${action}Released`] = this.releaseBuffers[action] > 0;
      if (result[`${action}Pressed`]) {
        result[`${action}Event`] = this.edgeMetadata[action];
        this.buffers[action] = 0;
        this.edgeMetadata[action] = null;
      }
      if (result[`${action}Released`]) this.releaseBuffers[action] = 0;
    }
    addSimulatorAliases(result);
    result.pausePressed = this.pauseBuffer > 0;
    if (result.pausePressed) this.pauseBuffer = 0;
    return result;
  }

  setControlMode(mode) {
    this.controlMode = normalizeControlMode(mode);
    this.clearEdges();
  }

  setProfile(profile) {
    this.profile = normalizeInputProfile(profile);
    this.clear();
  }

  setBindings(bindings = {}) {
    this.bindings = mergeBindings(bindings);
    this.clear();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.clear();
  }

  setEdgeHandler(handler) {
    this.onActionEdge = typeof handler === "function" ? handler : null;
  }

  inputStepForEdge(edge) {
    const result = createInputStep();
    const action = edge?.action;
    if (!ACTIONS.includes(action)) return result;
    copyContinuousFields(result, this.step);
    result.device = edge.device ?? this.lastDevice;
    result[action] = true;
    result[`${action}Pressed`] = true;
    result[`${action}Event`] = Object.freeze({ ...edge });
    addSimulatorAliases(result);
    return result;
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
    for (const state of Object.values(this.touchSticks)) {
      state.pointerId = null;
      state.x = 0;
      state.y = 0;
      state.element?.classList.remove("is-active");
      state.element?.style.setProperty("--stick-x", "0px");
      state.element?.style.setProperty("--stick-y", "0px");
    }
    this.gamepad = disconnectedGamepad();
    this.directHeld.clear();
    this.step = createInputStep();
    this.step.profile = this.profile;
    this.clearEdges();
  }

  destroy() {
    this.abort.abort();
    this.clear();
    this.enabled = false;
  }

  keyHeld(action) {
    if (this.profile === "appalachian") {
      const direct = {
        action: ["KeyZ"],
        style: ["KeyX"],
        power: ["KeyC"],
        freeze: [],
        toprock: [],
        footwork: [],
        jump: ["Space"],
        handAccent: ["KeyR"],
        pause: ["Escape", "KeyP"],
      }[action];
      if (direct) return direct.some((code) => this.keys.has(code));
    }
    if (this.controlMode === "advanced") {
      const direct = {
        action: ["KeyZ", "Space"],
        style: ["KeyX", "KeyF"],
        power: ["KeyC", "ShiftLeft", "ShiftRight"],
        freeze: ["KeyV", "KeyT"],
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

  gamepadActionHeld(action) {
    if (this.profile !== "appalachian") return Boolean(this.gamepad[action]);
    return Boolean({
      action: this.gamepad.step,
      style: this.gamepad.brush,
      power: this.gamepad.drive,
      freeze: false,
      toprock: false,
      footwork: false,
      jump: this.gamepad.jump,
      handAccent: this.gamepad.handAccent,
    }[action]);
  }

  isBound(code) {
    return Object.values(this.bindings).some((codes) => codes.includes(code))
      || (this.profile === "appalachian" && SIMULATOR_KEYS.has(code));
  }

  bufferCode(code, pressedEdge, metadata = {}) {
    for (const action of this.actionsForCode(code)) this.bufferAction(action, pressedEdge, metadata);
  }

  bufferAction(action, pressedEdge, metadata = {}) {
    if (action === "pause") {
      if (pressedEdge) this.pauseBuffer = INPUT_BUFFER_SECONDS;
      return;
    }
    if (!ACTIONS.includes(action)) return;
    if (pressedEdge) {
      const edge = Object.freeze({
        action,
        rawTimeStamp: finiteTimestamp(metadata.rawTimeStamp),
        receivedTimeStamp: finiteTimestamp(metadata.receivedTimeStamp),
        device: metadata.device ?? this.lastDevice,
        code: metadata.code ?? "",
        pointerType: metadata.pointerType ?? "",
      });
      this.edgeMetadata[action] = edge;
      const handled = this.onActionEdge?.(edge) === true;
      this.buffers[action] = handled ? 0 : INPUT_BUFFER_SECONDS;
      if (handled) this.directHeld.add(action);
    } else {
      this.releaseBuffers[action] = INPUT_BUFFER_SECONDS;
      this.directHeld.delete(action);
    }
  }

  actionsForCode(code) {
    if (this.profile === "appalachian") {
      const direct = {
        KeyZ: "action",
        KeyX: "style",
        KeyC: "power",
        Space: "jump",
        KeyR: "handAccent",
        Escape: "pause",
        KeyP: "pause",
      }[code];
      return direct ? [direct] : [];
    }
    if (this.controlMode === "advanced") {
      const direct = {
        KeyZ: "action",
        Space: "action",
        KeyX: "style",
        KeyF: "style",
        KeyC: "power",
        ShiftLeft: "power",
        ShiftRight: "power",
        KeyV: "freeze",
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

export function applyRadialDeadZone(x, y, deadZone = DEAD_ZONE) {
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return { x: 0, y: 0 };
  const magnitude = Math.hypot(px, py);
  if (magnitude <= deadZone) return { x: 0, y: 0 };
  const normalized = Math.min(1, magnitude);
  const scaled = (normalized - deadZone) / (1 - deadZone);
  return {
    x: px / magnitude * scaled,
    y: py / magnitude * scaled,
  };
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
    const travel = applyRadialDeadZone(pad.axes?.[0] ?? 0, pad.axes?.[1] ?? 0);
    const arms = applyRadialDeadZone(pad.axes?.[2] ?? 0, pad.axes?.[3] ?? 0);
    const result = {
      x: travel.x,
      y: travel.y,
      armX: arms.x,
      armY: -arms.y,
      action: pressed(pad, 0),
      style: pressed(pad, 2),
      power: pressed(pad, 3),
      freeze: pressed(pad, 1),
      toprock: pressed(pad, 4),
      footwork: pressed(pad, 5),
      jump: pressed(pad, 0),
      step: pressed(pad, 2),
      brush: pressed(pad, 3),
      drive: pressed(pad, 1),
      leftArmModifier: pressed(pad, 4),
      rightArmModifier: pressed(pad, 5),
      bodyModifier: pressed(pad, 6),
      commitModifier: pressed(pad, 7),
      handAccent: pressed(pad, 11),
      dpadUp: pressed(pad, 12),
      dpadDown: pressed(pad, 13),
      dpadLeft: pressed(pad, 14),
      dpadRight: pressed(pad, 15),
      pause: pressed(pad, 9),
    };
    result.active = Math.hypot(result.x, result.y) > 0
      || Math.hypot(result.armX, result.armY) > 0
      || Object.entries(result).some(([key, value]) => !["x", "y", "armX", "armY", "active"].includes(key) && value);
    return result;
  }
  return disconnectedGamepad();
}

export function normalizeControlMode(value) {
  return value === "advanced" ? "advanced" : "simple";
}

export function normalizeInputProfile(value) {
  return value === "appalachian" ? "appalachian" : "legacy";
}

function mergeBindings(overrides) {
  const result = {};
  for (const [action, defaults] of Object.entries(DEFAULT_BINDINGS)) {
    const custom = overrides[action];
    const selected = Array.isArray(custom)
      ? [...new Set([
          ...custom,
          ...defaults.filter((code) => code.startsWith("Arrow") || ["Escape", "KeyP"].includes(code)),
        ])]
      : [...defaults];
    result[action] = [...new Set([...selected, ...(REQUIRED_ALIASES[action] ?? [])])];
  }
  return result;
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function finiteTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : now();
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
    active: false, x: 0, y: 0, armX: 0, armY: 0,
    action: false, style: false, power: false, freeze: false,
    toprock: false, footwork: false, jump: false, step: false,
    brush: false, drive: false, leftArmModifier: false,
    rightArmModifier: false, bodyModifier: false, commitModifier: false,
    handAccent: false, dpadUp: false, dpadDown: false,
    dpadLeft: false, dpadRight: false, pause: false,
  };
}

function copyContinuousFields(target, source) {
  for (const key of [
    "x", "y", "travelX", "travelY", "armX", "armY",
    "leftArmModifier", "rightArmModifier", "bodyModifier",
    "groundModifier", "commitModifier", "turnDirection",
    "paletteDirection", "profile", "device",
  ]) {
    target[key] = source[key];
  }
  target.groundModifier = Boolean(source.bodyModifier || source.groundModifier);
}

function addSimulatorAliases(result) {
  for (const [alias, action] of [["step", "action"], ["brush", "style"], ["drive", "power"]]) {
    result[alias] = Boolean(result[action]);
    result[`${alias}Pressed`] = Boolean(result[`${action}Pressed`]);
    result[`${alias}Released`] = Boolean(result[`${action}Released`]);
    result[`${alias}Event`] = result[`${action}Event`] ?? null;
  }
}

function isTextControl(target) {
  const name = String(target?.tagName ?? "").toUpperCase();
  return Boolean(target?.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(name));
}
