import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.KAKI_DANCE_URL ?? "http://127.0.0.1:4177";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rescueRoot = resolve(projectRoot, "docs/images/hero-rescue");
const afterDir = resolve(rescueRoot, "after");
mkdirSync(afterDir, { recursive: true });

const workspaceChromium = "/home/nemoclaw/bin/chromium";
const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync(workspaceChromium) ? workspaceChromium : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

await captureQaStills();
await captureHeroLab();
await prepareMotionCapture();
for (const character of ["kitty", "soder"]) await captureMotion(character);

await browser.close();
if (errors.length) {
  throw new Error(`Hero capture emitted browser errors:\n${errors.join("\n")}`);
}
console.log(`Hero rescue captures written to ${afterDir}`);

async function captureQaStills() {
  await page.goto(`${baseUrl}/qa.html`, { waitUntil: "networkidle" });
  await page.waitForSelector("#golden-gallery .qa-card canvas");
  for (const character of ["kitty", "soder"]) {
    await page.selectOption("#qa-character", character);
    await page.waitForTimeout(100);
    const canvases = page.locator("#golden-gallery .qa-card canvas");
    for (let index = 0; index < 6; index += 1) {
      await saveCanvasPng(
        canvases.nth(index),
        resolve(afterDir, `${character}-${index + 1}.png`),
      );
    }
    await page.locator("#golden-gallery").screenshot({
      path: resolve(afterDir, `${character}-golden-chain.png`),
    });
  }
}

async function captureHeroLab() {
  await page.goto(`${baseUrl}/hero-lab.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.heroLab?.getState?.().snapshots?.soder);
  await page.evaluate(() => globalThis.heroLab.setState({
    moveId: "windmill",
    nextPhase: 0.5,
    chain: false,
    speed: 0,
  }));
  await page.screenshot({
    path: resolve(afterDir, "hero-lab.png"),
    fullPage: true,
  });

  const silhouettes = [
    ["basicRock", 0.24],
    ["basicGoDown", 0.62],
    ["sixStep", 2 / 6],
    ["windmill", 0.5],
    ["babyFreeze", 0.55],
    ["cleanGetUp", 0.55],
  ];
  for (const id of [
    "#hero-skeleton",
    "#hero-joint-names",
    "#hero-contacts",
    "#hero-com",
    "#hero-support",
    "#hero-z-order",
    "#hero-bone-warnings",
  ]) {
    await page.uncheck(id);
  }
  await page.check("#hero-silhouette");
  for (const [moveId, nextPhase] of silhouettes) {
    await page.evaluate(({ moveId: id, nextPhase: value }) => {
      globalThis.heroLab.setState({
        moveId: id,
        nextPhase: value,
        chain: false,
        speed: 0,
      });
    }, { moveId, nextPhase });
    await saveCanvasPng(
      page.locator("#hero-lab-canvas"),
      resolve(afterDir, `silhouette-${moveId}.png`),
    );
  }
  await page.uncheck("#hero-silhouette");
}

async function prepareMotionCapture() {
  await page.goto(`${baseUrl}/hero-lab.html`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const [
      { DEFAULT_BEATMAP },
      { characterDefinition },
      { getMoveDefinition },
      { goldenChainIds },
      { drawDancer },
      { buildMoveQaSnapshot },
      { drawPixelText },
      { pixelLine, pixelRect },
    ] = await Promise.all([
      import("./js/audio/beatmap.js"),
      import("./js/dance/character-catalog.js"),
      import("./js/dance/move-catalog.js"),
      import("./js/dance/move-session.js"),
      import("./js/render/dancer.js"),
      import("./js/render/qa-frame.js"),
      import("./js/render/pixel-font.js"),
      import("./js/render/primitives.js"),
    ]);
    const chain = goldenChainIds().map((id) => getMoveDefinition(id));
    const transitionBeats = 0.22;
    const captureCanvas = document.createElement("canvas");
    captureCanvas.id = "hero-motion-canvas";
    captureCanvas.width = 384;
    captureCanvas.height = 216;
    captureCanvas.style.cssText = "position:fixed;inset:0;width:384px;height:216px;image-rendering:pixelated;z-index:99999";
    document.body.append(captureCanvas);
    const captureContext = captureCanvas.getContext("2d", { alpha: false });
    captureContext.imageSmoothingEnabled = false;
    let previousRig = null;
    let previousBeat = -1;

    function stateAt(beat) {
      let cursor = 0;
      for (let index = 0; index < chain.length; index += 1) {
        const move = chain[index];
        const end = cursor + move.durationBeats;
        if (beat < end || index === chain.length - 1) {
          const localBeat = Math.max(0, beat - cursor);
          return {
            move,
            previous: index > 0 ? chain[index - 1] : null,
            phase: Math.min(1, localBeat / move.durationBeats),
            transitionProgress: index > 0 && localBeat < transitionBeats
              ? localBeat / transitionBeats
              : 1,
          };
        }
        cursor = end;
      }
      return { move: chain.at(-1), previous: chain.at(-2), phase: 1, transitionProgress: 1 };
    }

    function background(target, character, state, beat) {
      pixelRect(target, 0, 0, 384, 216, "#090e1b");
      for (let x = 0; x <= 384; x += 12) {
        pixelRect(target, x, 0, 1, 216, "rgba(45,77,101,0.22)");
      }
      for (let y = 0; y <= 216; y += 12) {
        pixelRect(target, 0, y, 384, 1, "rgba(45,77,101,0.22)");
      }
      pixelRect(target, 0, 177, 384, 1, "#63d6b3");
      pixelRect(target, 0, 178, 384, 2, "#14293a");
      pixelLine(target, { x: 170, y: 184 }, { x: 214, y: 184 }, 1, "#29435d");
      drawPixelText(target, character === "kitty" ? "KITTYKAKI" : "SODER", 12, 12, {
        color: "#f5e9c9",
        shadow: "#050914",
        scale: 1,
      });
      drawPixelText(target, state.move.displayName, 372, 12, {
        align: "right",
        color: "#63d6b3",
        shadow: "#050914",
        scale: 1,
      });
      const segment = Math.min(5, Math.floor(beat / 2));
      for (let index = 0; index < 6; index += 1) {
        pixelRect(target, 148 + index * 15, 200, 11, 3, index === segment ? "#f4c95d" : "#29435d");
      }
    }

    globalThis.renderHeroMotionFrame = ({ character, beat }) => {
      if (beat <= previousBeat) previousRig = null;
      const state = stateAt(beat);
      background(captureContext, character, state, beat);
      const snapshot = buildMoveQaSnapshot({
        character,
        moveId: state.move.id,
        phase: state.phase,
        beat: 16 + beat,
        transitionFrom: state.previous?.id ?? "",
        transitionProgress: state.transitionProgress,
        previousRig,
      });
      previousRig = snapshot.dancer.rig;
      previousBeat = beat;
      drawDancer(captureContext, snapshot.dancer, characterDefinition(character), {
        x: 192,
        floorY: 177,
        scale: 2.35,
      });
      return {
        bpm: DEFAULT_BEATMAP.bpm,
        moveId: state.move.id,
        phase: state.phase,
        topology: snapshot.dancer.rig.topology,
        finite: snapshot.dancer.rig.finite,
        boneError: snapshot.dancer.rig.maxBoneLengthError,
        contactError: snapshot.dancer.contacts.measured.largest,
        png: captureCanvas.toDataURL("image/png"),
      };
    };
  });
  await page.waitForSelector("#hero-motion-canvas");
}

async function captureMotion(character) {
  const framesPerSecond = 20;
  const beatsPerSecond = 100 / 60;
  const chainBeats = 12;
  const frameCount = Math.round(chainBeats / beatsPerSecond * framesPerSecond);
  const tempRoot = mkdtempSync(resolve(tmpdir(), `kaki-dance-${character}-`));
  try {
    let worstBoneError = 0;
    let worstContactError = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const beat = frame / framesPerSecond * beatsPerSecond;
      const metrics = await page.evaluate(
        ({ performer, nextBeat }) => globalThis.renderHeroMotionFrame({
          character: performer,
          beat: nextBeat,
        }),
        { performer: character, nextBeat: beat },
      );
      if (metrics.topology !== "biped" || !metrics.finite) {
        throw new Error(`${character} emitted invalid motion geometry at frame ${frame}`);
      }
      worstBoneError = Math.max(worstBoneError, metrics.boneError);
      worstContactError = Math.max(worstContactError, metrics.contactError);
      const payload = metrics.png.slice(metrics.png.indexOf(",") + 1);
      writeFileSync(
        resolve(tempRoot, `frame-${String(frame).padStart(4, "0")}.png`),
        Buffer.from(payload, "base64"),
      );
    }
    encodeMotion(tempRoot, character, framesPerSecond);
    console.log(
      `${character}: ${frameCount} frames, bone Δ ${worstBoneError.toExponential(2)}, contact ${worstContactError.toExponential(2)}`,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function encodeMotion(frameDir, character, framesPerSecond) {
  const input = resolve(frameDir, "frame-%04d.png");
  runFfmpeg([
    "-framerate", String(framesPerSecond),
    "-i", input,
    "-an",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-y", resolve(afterDir, `${character}-golden-chain.mp4`),
  ]);
  runFfmpeg([
    "-framerate", String(framesPerSecond),
    "-i", input,
    "-filter_complex",
    "[0:v]split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
    "-loop", "0",
    "-y", resolve(afterDir, `${character}-golden-chain.gif`),
  ]);
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed (${result.status}): ${result.stderr || result.stdout}`);
  }
}

async function saveCanvasPng(locator, outputPath) {
  const dataUrl = await locator.evaluate((canvasValue) => canvasValue.toDataURL("image/png"));
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  writeFileSync(outputPath, Buffer.from(payload, "base64"));
}
