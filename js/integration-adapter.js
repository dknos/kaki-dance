import { preloadVisualAssets } from "./asset-loader.js";
import { createGameDependencies, KakiDanceGame } from "./game.js";
import { resolveStorage } from "./storage.js";

export async function createKakiDance({
  host,
  input = null,
  audio = null,
  storage = undefined,
  settings = null,
  profile = null,
  onExit = null,
  onRoundComplete = null,
  onBattleComplete = null,
  qaScene = null,
} = {}) {
  const HTMLElementConstructor = globalThis.HTMLElement;
  if (typeof HTMLElementConstructor !== "function" || !(host instanceof HTMLElementConstructor)) {
    throw new TypeError("Kaki-Dance requires a host HTMLElement.");
  }
  const resolvedStorage = resolveStorage(storage);
  const [{ beatmap }] = await Promise.all([
    createGameDependencies(),
    preloadVisualAssets(),
  ]);
  const game = new KakiDanceGame({
    host,
    beatmap,
    externalInput: input,
    externalAudio: audio,
    storage: resolvedStorage,
    settings,
    profile,
    onExit,
    onRoundComplete,
    onBattleComplete,
    qaScene,
  });
  return Object.freeze({
    start: (options) => game.start(options),
    pause: (reason) => game.pause(reason),
    resume: () => game.resume(),
    restart: () => game.restart(),
    destroy: () => game.destroy(),
    getSnapshot: () => game.getSnapshot(),
  });
}
