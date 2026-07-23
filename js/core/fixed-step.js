import { FIXED_STEP, MAX_CATCH_UP_STEPS, MAX_FRAME_DELTA } from "../config.js";
import { clamp } from "./math.js";

export class FixedStepLoop {
  constructor({
    step = FIXED_STEP,
    maxSteps = MAX_CATCH_UP_STEPS,
    beforeFrame = null,
    update,
    render,
    now = () => performance.now(),
    requestFrame = (callback) => requestAnimationFrame(callback),
    cancelFrame = (handle) => cancelAnimationFrame(handle),
  } = {}) {
    if (typeof update !== "function" || typeof render !== "function") {
      throw new TypeError("FixedStepLoop requires update and render callbacks.");
    }
    this.step = step;
    this.maxSteps = maxSteps;
    this.beforeFrame = beforeFrame;
    this.update = update;
    this.render = render;
    this.now = now;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.accumulator = 0;
    this.lastTime = 0;
    this.handle = 0;
    this.running = false;
    this.boundFrame = (time) => this.frame(time);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.now();
    this.handle = this.requestFrame(this.boundFrame);
  }

  stop() {
    this.running = false;
    if (this.handle) this.cancelFrame(this.handle);
    this.handle = 0;
    this.accumulator = 0;
  }

  resetClock() {
    this.lastTime = this.now();
    this.accumulator = 0;
  }

  frame(frameTime = this.now()) {
    if (!this.running) return;
    const delta = clamp((frameTime - this.lastTime) / 1000, 0, MAX_FRAME_DELTA);
    this.lastTime = frameTime;
    this.beforeFrame?.(delta);
    this.accumulator = Math.min(this.accumulator + delta, this.step * this.maxSteps);
    let steps = 0;
    while (this.accumulator + 1e-10 >= this.step && steps < this.maxSteps) {
      this.update(this.step);
      this.accumulator = Math.max(0, this.accumulator - this.step);
      steps += 1;
    }
    this.render(this.accumulator / this.step, delta);
    this.handle = this.requestFrame(this.boundFrame);
  }
}
