import { createKakiDance } from "./integration-adapter.js";

const host = document.getElementById("app");

try {
  const game = await createKakiDance({ host });
  game.start();
  globalThis.kakiDance = game;
} catch (error) {
  const status = document.getElementById("live-status");
  if (status) status.textContent = `Kaki-Dance could not start: ${error.message}`;
  console.error(error);
}
