export function resolveMotionSettings(settings, matchMedia = globalThis.matchMedia?.bind(globalThis)) {
  let systemReduced = false;
  try {
    systemReduced = Boolean(matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    systemReduced = false;
  }
  return Object.freeze({
    reducedMotion: Boolean(settings?.reducedMotion || systemReduced),
    reduceFlashes: Boolean(settings?.reduceFlashes),
    screenShake: settings?.reducedMotion || systemReduced ? 0 : Number(settings?.screenShake ?? 0.7),
    beatPulse: settings?.beatPulse !== false,
    timingLabels: settings?.timingLabels !== false,
  });
}

export function announce(element, message) {
  if (!element) return;
  element.textContent = "";
  queueMicrotask(() => {
    element.textContent = String(message ?? "");
  });
}
