import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.KAKI_DANCE_URL ?? "http://127.0.0.1:4177";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(projectRoot, "docs/images/appalachian");
const finalDir = resolve(outputRoot, "final");
const loopDir = resolve(outputRoot, "loops");
mkdirSync(finalDir, { recursive: true });
mkdirSync(loopDir, { recursive: true });

const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync("/home/nemoclaw/bin/chromium") ? "/home/nemoclaw/bin/chromium" : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
const failedRequests = [];
page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  failedRequests.push(`${request.url()} — ${request.failure()?.errorText}`);
});

await page.goto(`${baseUrl}/frolic-lab.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => globalThis.frolicLab?.getState?.().activePacks?.length === 1);
await page.screenshot({
  path: resolve(finalDir, "frolic-footwork-lab.png"),
  fullPage: true,
});
// Leave the live lab loop before deterministic capture so its shared atlas
// selector cannot request a second pack while approval frames are rendered.
await page.goto(baseUrl, { waitUntil: "networkidle" });
await prepareCaptureRuntime();

const gameplay = await page.evaluate(() => globalThis.appalachianCapture.renderGameplay({
  hero: "kitty",
  style: "flatfoot",
  targetTick: 3_756,
}));
writeDataUrl(resolve(finalDir, "frolic-gameplay-native.png"), gameplay.png);

const approvalFiles = [];
for (const hero of ["kitty", "soder"]) {
  for (const style of ["flatfoot", "buck", "clog"]) {
    const prefix = `approval-${hero}-${style}-stage`;
    const nativePath = resolve(finalDir, `${prefix}-native.png`);
    const enlargedPath = resolve(finalDir, `${prefix}-4x.png`);
    const diagnosticPath = resolve(finalDir, `${prefix}-diagnostic.png`);
    const neutralPath = resolve(finalDir, `approval-${hero}-${style}-neutral-native.png`);
    const neutralEnlargedPath = resolve(finalDir, `approval-${hero}-${style}-neutral-4x.png`);
    const board = await page.evaluate(
      ({ performer, profile }) => globalThis.appalachianCapture.renderApprovalBoard({
        hero: performer,
        style: profile,
        debug: false,
      }),
      { performer: hero, profile: style },
    );
    writeDataUrl(nativePath, board.png);
    scaleNearest(nativePath, enlargedPath, 4);
    const diagnostic = await page.evaluate(
      ({ performer, profile }) => globalThis.appalachianCapture.renderApprovalBoard({
        hero: performer,
        style: profile,
        debug: true,
      }),
      { performer: hero, profile: style },
    );
    writeDataUrl(diagnosticPath, diagnostic.png);
    const neutral = await page.evaluate(
      ({ performer, profile }) => globalThis.appalachianCapture.renderApprovalBoard({
        hero: performer,
        style: profile,
        debug: false,
        background: "neutral",
      }),
      { performer: hero, profile: style },
    );
    writeDataUrl(neutralPath, neutral.png);
    scaleNearest(neutralPath, neutralEnlargedPath, 4);
    approvalFiles.push({
      hero,
      style,
      native: relativeArtifact(nativePath),
      enlarged: relativeArtifact(enlargedPath),
      diagnostic: relativeArtifact(diagnosticPath),
      neutral: relativeArtifact(neutralPath),
      neutralEnlarged: relativeArtifact(neutralEnlargedPath),
      nativeBytes: statSync(nativePath).size,
      enlargedBytes: statSync(enlargedPath).size,
      diagnosticBytes: statSync(diagnosticPath).size,
      neutralBytes: statSync(neutralPath).size,
      neutralEnlargedBytes: statSync(neutralEnlargedPath).size,
      activePacks: board.activePacks,
    });
  }
}

const loopFiles = [];
for (const hero of ["kitty", "soder"]) {
  for (const style of ["flatfoot", "buck", "clog"]) {
    loopFiles.push(await captureLoop(hero, style));
  }
}

await browser.close();
if (errors.length || failedRequests.length) {
  throw new Error([...errors, ...failedRequests].join("\n"));
}

const atlasReport = JSON.parse(
  await (await import("node:fs/promises")).readFile(
    resolve(outputRoot, "frolic-atlas-report.json"),
    "utf8",
  ),
);
const report = {
  capturedAt: new Date().toISOString(),
  sourceUrl: baseUrl,
  logicalSize: [384, 216],
  gameplay: {
    path: "docs/images/appalachian/final/frolic-gameplay-native.png",
    bar: gameplay.snapshot.frolic.bar,
    strain: gameplay.snapshot.frolic.strain.id,
    state: gameplay.snapshot.frolic.state,
    score: gameplay.snapshot.frolic.score,
    currentMove: gameplay.snapshot.frolic.currentMove,
    queuedMove: gameplay.snapshot.frolic.queuedMove,
    responseInputs: gameplay.responseInputs,
  },
  approvalPoseOrder: [
    "neutral", "foundation", "shuffle", "backstep", "chug",
    "heel-toe", "drag-slide", "crisscross", "turnaround", "ending",
  ],
  approvals: approvalFiles,
  loops: loopFiles,
  activePackMemoryBytes: Object.fromEntries(
    Object.entries(atlasReport.packs).map(([key, value]) => [
      key,
      value.estimatedDecodedTextureBytes,
    ]),
  ),
  errors,
  failedRequests,
};
writeFileSync(
  resolve(finalDir, "frolic-capture-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));

async function prepareCaptureRuntime() {
  await page.evaluate(async () => {
    const [
      { AppalachianJamSimulation },
      { FROLIC_STYLE_PROFILES, getFootwork },
      { KakiDanceRenderer },
      { FrolicAtlasRenderer },
      { drawPixelText },
      { pixelRect },
    ] = await Promise.all([
      import("./js/appalachian/simulation.js"),
      import("./js/appalachian/footwork-catalog.js"),
      import("./js/render/renderer.js"),
      import("./js/render/frolic-atlas.js"),
      import("./js/render/pixel-font.js"),
      import("./js/render/primitives.js"),
    ]);

    const canvas = document.createElement("canvas");
    canvas.id = "appalachian-capture-canvas";
    canvas.width = 384;
    canvas.height = 216;
    canvas.style.cssText = "position:fixed;inset:0;width:768px;height:432px;image-rendering:pixelated;z-index:99999";
    document.body.append(canvas);
    const context = canvas.getContext("2d", { alpha: false });
    context.imageSmoothingEnabled = false;
    const board = document.createElement("canvas");
    board.width = 384 * 5;
    board.height = 216 * 2;
    const boardContext = board.getContext("2d", { alpha: false });
    boardContext.imageSmoothingEnabled = false;
    const renderer = new KakiDanceRenderer(canvas, {
      settings: {
        reducedMotion: true,
        screenShake: 0,
        reduceFlashes: true,
        timingLabels: true,
        beatPulse: true,
        visualLatencyMs: 0,
      },
      seed: 0x46524f4c,
    });
    const neutralRenderer = new FrolicAtlasRenderer({
      library: renderer.frolicHeroes.library,
    });
    let activeKey = "";

    async function ensurePack(hero, style) {
      const key = `${hero}:${style}`;
      if (key === activeKey) return;
      await renderer.enterMode("frolic", hero, style);
      activeKey = key;
    }

    function dancerFor(moveId, phase, entryFoot = "left") {
      const move = getFootwork(moveId);
      return {
        moveId,
        moveName: move.displayName,
        family: move.family,
        presentationClip: moveId,
        presentationPhase: phase,
        phase,
        entryFoot,
        exitFoot: entryFoot === "left" ? "right" : "left",
        supportingFoot: entryFoot,
        queuedMove: "",
        transitionClip: "",
        direction: 1,
        travelDirection: "neutral",
        mirror: entryFoot === "right",
        rootX: 0,
        microResponse: 0,
        microFoot: entryFoot,
        contacts: { contacts: [], error: 0 },
        stamina: 100,
        balance: { offset: 0, wobble: 0, failed: false },
      };
    }

    function poseSnapshot(hero, style, moveId, phase, beat = 0) {
      const dancer = dancerFor(moveId, phase);
      return {
        mode: "frolic",
        started: false,
        complete: false,
        performer: "player",
        character: hero,
        dancer,
        player: dancer,
        opponent: null,
        beat: {
          beat,
          beatPhase: ((beat % 1) + 1) % 1,
          beatInBar: Math.floor(beat) % 4,
          bpm: 120,
        },
        crowdHeat: 64,
        callout: "",
        frolic: {
          state: "OPEN_JAM",
          stateLabel: "APPROVAL",
          style,
          profile: FROLIC_STYLE_PROFILES[style],
          bar: 1,
          countInBeat: 0,
          tick: beat * 96,
          localTick: (beat * 96) % 384,
          strain: { id: "A1" },
          currentMove: moveId,
          queuedMove: "",
          supportingFoot: dancer.supportingFoot,
          restraint: 1,
          score: { total: 0 },
          practice: null,
        },
      };
    }

    const approvalSamples = [
      ["neutral", "walkingStep", 0],
      ["foundation", "walkingStep", 0.28],
      ["shuffle", "shuffle", 0.46],
      ["backstep", "backstep", 0.48],
      ["chug", "chug", 0.48],
      ["heel-toe", "heelToeChange", 0.28],
      ["drag-slide", "dragSlide", 0.52],
      ["crisscross", "crisscross", 0.5],
      ["turnaround", "turnaround", 0.48],
      ["ending", "controlledEnding", 0.82],
    ];

    function beatSnapshot(tick) {
      const beat = tick / 96;
      const beatIndex = Math.floor(beat);
      return {
        audioTime: (beat + 8) * 0.5,
        playbackSeconds: (beat + 8) * 0.5,
        beat,
        beatIndex,
        beatPhase: ((beat % 1) + 1) % 1,
        beatInBar: ((beatIndex % 4) + 4) % 4,
        barIndex: Math.floor(beat / 4),
        measure: Math.floor(beat / 4) + 1,
        phrase: Math.floor(beat / 32) + 1,
        section: "capture",
        intensity: 0.8,
        bpm: 120,
        paused: false,
        running: true,
      };
    }

    function inputAt(tick) {
      const input = {
        x: 0,
        y: 0,
        action: false,
        actionPressed: false,
        style: false,
        stylePressed: false,
        power: false,
        powerPressed: false,
        freeze: false,
        freezePressed: false,
        pausePressed: false,
        device: "capture",
      };
      if (tick < 0) return input;
      const localBarTick = ((tick % 384) + 384) % 384;
      const bar = Math.floor(tick / 384) + 1;
      if ([8, 16, 24, 32].includes(bar) && localBarTick === 336) {
        input.freeze = true;
        input.freezePressed = true;
      } else if (tick % 768 === 240) {
        input.power = true;
        input.powerPressed = true;
      } else if (tick % 384 === 144) {
        input.style = true;
        input.stylePressed = true;
      } else if (localBarTick % 96 === 0 || localBarTick === 240) {
        input.action = true;
        input.actionPressed = true;
      }
      return input;
    }

    globalThis.appalachianCapture = {
      async renderApprovalBoard({ hero, style, debug, background = "stage" }) {
        await ensurePack(hero, style);
        renderer.reset();
        renderer.setDebug(debug
          ? { frolic: { skeleton: true, contacts: true, centerOfMass: true, bounds: false, pivot: false } }
          : null);
        boardContext.clearRect(0, 0, board.width, board.height);
        for (const [index, [label, moveId, phase]] of approvalSamples.entries()) {
          const tileX = (index % 5) * 384;
          const tileY = Math.floor(index / 5) * 216;
          if (background === "neutral") {
            context.fillStyle = "#20262b";
            context.fillRect(0, 0, 192, 216);
            context.fillStyle = "#ded6bf";
            context.fillRect(192, 0, 192, 216);
            context.fillStyle = "#101418";
            context.fillRect(0, 178, 384, 38);
            context.fillStyle = "#f2bd65";
            context.fillRect(0, 177, 384, 1);
            neutralRenderer.draw(context, dancerFor(moveId, phase), hero, style, {
              x: 192,
              floorY: 178,
              scale: 1.25,
              phase,
              debug: debug
                ? { skeleton: true, contacts: true, centerOfMass: true }
                : null,
            });
          } else {
            renderer.render(poseSnapshot(hero, style, moveId, phase, index * 0.5));
          }
          boardContext.drawImage(canvas, tileX, tileY);
          pixelRect(boardContext, tileX + 5, tileY + 5, 96, 12, "#07100f");
          drawPixelText(boardContext, label.toUpperCase(), tileX + 10, tileY + 9, {
            color: debug ? "#f2bd65" : "#e8d9b9",
            scale: 1,
          });
        }
        return {
          png: board.toDataURL("image/png"),
          activePacks: renderer.frolicHeroes.library.activeKeys(),
        };
      },

      async renderLoopFrame({ hero, style, frame, totalFrames }) {
        await ensurePack(hero, style);
        renderer.setDebug(null);
        const segments = [
          ["walkingStep", 12],
          ["shuffle", 12],
          ["backstep", 12],
          ["chug", 12],
          ["heelToeChange", 12],
          ["crisscross", 24],
          ["turnaround", 12],
        ];
        let cursor = 0;
        let selected = segments[0];
        let localFrame = frame;
        for (const segment of segments) {
          if (frame < cursor + segment[1]) {
            selected = segment;
            localFrame = frame - cursor;
            break;
          }
          cursor += segment[1];
        }
        const phase = localFrame / selected[1];
        renderer.render(poseSnapshot(hero, style, selected[0], phase, frame / 6));
        pixelRect(context, 6, 6, 112, 12, "#07100f");
        drawPixelText(context, `${hero} · ${style} · ${selected[0]}`.toUpperCase(), 10, 10, {
          color: "#f2bd65",
          scale: 1,
        });
        return {
          png: canvas.toDataURL("image/png"),
          moveId: selected[0],
          phase,
          totalFrames,
          activePacks: renderer.frolicHeroes.library.activeKeys(),
        };
      },

      async renderGameplay({ hero, style, targetTick }) {
        await ensurePack(hero, style);
        renderer.reset();
        renderer.setDebug(null);
        const simulation = new AppalachianJamSimulation({
          mode: "frolic",
          character: hero,
          style,
          difficulty: "advanced",
          seed: 0x46524f4c,
        });
        simulation.begin(beatSnapshot(-768));
        for (let tick = -768; tick <= targetTick; tick += 12) {
          const beat = beatSnapshot(tick);
          simulation.update(0.0625, beat, inputAt(tick));
          const snapshot = simulation.getSnapshot(beat);
          simulation.consumeEvents((event) => renderer.onEvent(event, snapshot));
        }
        const snapshot = simulation.getSnapshot(beatSnapshot(targetTick));
        renderer.render(snapshot);
        return {
          png: canvas.toDataURL("image/png"),
          snapshot,
          responseInputs: simulation.judge.events.filter((event) => (
            event.tick >= 9 * 384 && event.tick < 10 * 384
          )),
          activePacks: renderer.frolicHeroes.library.activeKeys(),
        };
      },
    };
  });
  await page.waitForSelector("#appalachian-capture-canvas");
}

async function captureLoop(hero, style) {
  const fps = 12;
  const frameCount = 96;
  const tempRoot = mkdtempSync(resolve(tmpdir(), `kaki-frolic-${hero}-${style}-`));
  const mp4Path = resolve(loopDir, `${hero}-${style}.mp4`);
  const gifPath = resolve(loopDir, `${hero}-${style}.gif`);
  let activePacks = [];
  try {
    for (let frame = 0; frame < frameCount; frame += 1) {
      const value = await page.evaluate(
        ({ performer, profile, index, total }) => globalThis.appalachianCapture.renderLoopFrame({
          hero: performer,
          style: profile,
          frame: index,
          totalFrames: total,
        }),
        { performer: hero, profile: style, index: frame, total: frameCount },
      );
      activePacks = value.activePacks;
      writeDataUrl(resolve(tempRoot, `frame-${String(frame).padStart(4, "0")}.png`), value.png);
    }
    encodeLoop(tempRoot, fps, mp4Path, gifPath);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
  return {
    hero,
    style,
    fps,
    frames: frameCount,
    durationSeconds: frameCount / fps,
    mp4: relativeArtifact(mp4Path),
    gif: relativeArtifact(gifPath),
    mp4Bytes: statSync(mp4Path).size,
    gifBytes: statSync(gifPath).size,
    activePacks,
  };
}

function encodeLoop(frameDir, fps, mp4Path, gifPath) {
  const input = resolve(frameDir, "frame-%04d.png");
  runFfmpeg([
    "-framerate", String(fps),
    "-i", input,
    "-vf", "scale=384:216:flags=neighbor,format=yuv420p",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "21",
    "-movflags", "+faststart",
    "-y", mp4Path,
  ]);
  runFfmpeg([
    "-framerate", String(fps),
    "-i", input,
    "-vf", "fps=12,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=none",
    "-loop", "0",
    "-y", gifPath,
  ]);
}

function scaleNearest(input, output, scale) {
  runFfmpeg([
    "-i", input,
    "-vf", `scale=iw*${scale}:ih*${scale}:flags=neighbor`,
    "-frames:v", "1",
    "-y", output,
  ]);
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || `ffmpeg failed: ${args.join(" ")}`);
}

function writeDataUrl(path, value) {
  const comma = value.indexOf(",");
  writeFileSync(path, Buffer.from(value.slice(comma + 1), "base64"));
}

function relativeArtifact(path) {
  return path.replace(`${projectRoot}/`, "");
}
