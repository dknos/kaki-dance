const SOUND_RECIPES = Object.freeze({
  moveStart: { frequency: 160, end: 110, duration: 0.035, type: "triangle", gain: 0.04 },
  footContact: { frequency: 95, end: 65, duration: 0.045, type: "square", gain: 0.035 },
  handContact: { frequency: 145, end: 85, duration: 0.055, type: "triangle", gain: 0.045 },
  powerExtend: { frequency: 240, end: 380, duration: 0.09, type: "sawtooth", gain: 0.045 },
  freeze: { frequency: 520, end: 760, duration: 0.16, type: "sine", gain: 0.07 },
  perfect: { frequency: 680, end: 920, duration: 0.13, type: "square", gain: 0.052 },
  fail: { frequency: 150, end: 62, duration: 0.2, type: "sawtooth", gain: 0.055 },
  crowd: { frequency: 220, end: 165, duration: 0.11, type: "triangle", gain: 0.03 },
  ui: { frequency: 420, end: 510, duration: 0.045, type: "square", gain: 0.025 },
});

export class SoundEffects {
  constructor(transport) {
    this.transport = transport;
    this.active = new Set();
  }

  play(id, { strength = 1, crowd = false } = {}) {
    const recipe = SOUND_RECIPES[id];
    const context = this.transport?.context;
    const destination = crowd ? this.transport?.crowdGain : this.transport?.effectsGain;
    if (!recipe || !context?.createOscillator || !destination) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = recipe.type;
    oscillator.frequency.setValueAtTime(recipe.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, recipe.end), now + recipe.duration);
    gain.gain.setValueAtTime(recipe.gain * Math.max(0.2, strength), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + recipe.duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(now);
    oscillator.stop(now + recipe.duration + 0.01);
    this.active.add(oscillator);
    oscillator.addEventListener?.("ended", () => this.active.delete(oscillator), { once: true });
  }

  stopAll() {
    for (const oscillator of this.active) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped.
      }
    }
    this.active.clear();
  }
}
