export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function inverseLerp(a, b, value) {
  return a === b ? 0 : (value - a) / (b - a);
}

export function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeOutBack(value, amount = 1.4) {
  const t = clamp(value, 0, 1) - 1;
  return 1 + (amount + 1) * t ** 3 + amount * t ** 2;
}

export function positiveModulo(value, divisor) {
  if (!divisor) return 0;
  return ((value % divisor) + divisor) % divisor;
}

export function shortestAngleDelta(from, to) {
  return positiveModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
}

export function distance(a, b) {
  return Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));
}

export function quantize(value, step = 1) {
  const safeStep = Math.abs(Number(step)) || 1;
  return Math.round(value / safeStep) * safeStep;
}

export function snapPixel(value) {
  return Math.round(Number(value) || 0);
}

export function nearlyEqual(a, b, epsilon = 1e-6) {
  return Math.abs(a - b) <= epsilon;
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
