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
const outputDir = resolve(projectRoot, "docs/images/measure-match/final");
const audioPath = resolve(projectRoot, "assets/audio/moon-block-party.wav");
mkdirSync(outputDir, { recursive: true });

const workspaceChromium = "/home/nemoclaw/bin/chromium";
const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync(workspaceChromium) ? workspaceChromium : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
const failedRequests = [];
page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  failedRequests.push(`${request.url()} — ${request.failure()?.errorText}`);
});

await page.goto(`${baseUrl}/hero-lab.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => globalThis.heroLab?.getState?.().snapshots?.soder);
await page.evaluate(() => globalThis.heroLab.setState({
  moveId: "basicRock",
  nextPhase: 0.33,
  chain: true,
  speed: 0.5,
}));
await page.screenshot({
  path: resolve(outputDir, "hero-lab.png"),
  fullPage: true,
});

await prepareCaptureRuntime();

const fps = 12;
const captureRecords = [];
for (const character of ["kitty", "soder"]) {
  captureRecords.push(await captureHero(character, {
    label: "full-speed",
    speed: 1,
    fps,
  }));
  captureRecords.push(await captureHero(character, {
    label: "quarter-speed",
    speed: 0.25,
    fps,
  }));
}
captureRecords.push(await captureMeasureSequence({
  label: "measure-match-gameplay",
  character: "kitty",
  bars: 16,
  fps,
}));
captureRecords.push(await captureMeasureSequence({
  label: "tutorial",
  character: "kitty",
  bars: 5,
  fps,
}));

await page.goto(`${baseUrl}/hero-rescue.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".approval-grid img");
await page.screenshot({
  path: resolve(outputDir, "review-board.png"),
  fullPage: true,
});

await browser.close();

const report = {
  capturedAt: new Date().toISOString(),
  sourceUrl: baseUrl,
  logicalSize: [384, 216],
  fps,
  records: captureRecords,
  errors,
  failedRequests,
};
writeFileSync(
  resolve(outputDir, "capture-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (errors.length || failedRequests.length) {
  throw new Error([
    ...errors,
    ...failedRequests,
  ].join("\n"));
}
console.log(JSON.stringify(report, null, 2));

async function prepareCaptureRuntime() {
  await page.evaluate(async () => {
    const [
      { DEFAULT_BEATMAP },
      { TIMING_WINDOWS },
      { MeasureMatchSimulation },
      { AtlasHeroRenderer },
      { KakiDanceRenderer },
      { drawPixelText },
      { pixelLine, pixelRect },
    ] = await Promise.all([
      import("./js/audio/beatmap.js"),
      import("./js/config.js"),
      import("./js/dance/measure-match-simulation.js"),
      import("./js/render/hero-atlas.js"),
      import("./js/render/renderer.js"),
      import("./js/render/pixel-font.js"),
      import("./js/render/primitives.js"),
    ]);

    const captureCanvas = document.createElement("canvas");
    captureCanvas.id = "measure-match-capture-canvas";
    captureCanvas.width = 384;
    captureCanvas.height = 216;
    captureCanvas.style.cssText = [
      "position:fixed",
      "inset:0",
      "width:768px",
      "height:432px",
      "image-rendering:pixelated",
      "z-index:99999",
      "background:#090e1b",
    ].join(";");
    document.body.append(captureCanvas);
    const captureContext = captureCanvas.getContext("2d", { alpha: false });
    captureContext.imageSmoothingEnabled = false;

    const heroRenderer = new AtlasHeroRenderer();
    await Promise.all([
      heroRenderer.preload("kitty"),
      heroRenderer.preload("soder"),
    ]);
    const clips = Object.freeze([
      ["basicRock", "BASIC ROCK"],
      ["basicGoDown", "GO DOWN"],
      ["sixStep", "6-STEP"],
      ["windmill", "WINDMILL"],
      ["babyFreeze", "BABY FREEZE"],
      ["cleanGetUp", "CLEAN GET-UP"],
    ]);
    const clipBeats = 4;
    const totalHeroBeats = clips.length * clipBeats;

    function drawHeroBackground(character, clipName, sourceBeat, speedLabel) {
      pixelRect(captureContext, 0, 0, 384, 216, "#090e1b");
      for (let x = 0; x <= 384; x += 12) {
        pixelRect(captureContext, x, 0, 1, 216, "rgba(45,67,93,0.25)");
      }
      for (let y = 0; y <= 216; y += 12) {
        pixelRect(captureContext, 0, y, 384, 1, "rgba(45,67,93,0.25)");
      }
      pixelRect(captureContext, 0, 177, 384, 1, "#63d6b3");
      pixelRect(captureContext, 0, 178, 384, 2, "#14293a");
      pixelLine(captureContext, { x: 158, y: 185 }, { x: 226, y: 185 }, 1, "#29435d");
      drawPixelText(
        captureContext,
        character === "kitty" ? "KITTYKAKI" : "SODER",
        12,
        12,
        { color: "#f5e9c9", shadow: "#050914", scale: 1 },
      );
      drawPixelText(captureContext, clipName, 372, 12, {
        align: "right",
        color: "#63d6b3",
        shadow: "#050914",
        scale: 1,
      });
      drawPixelText(captureContext, `AUTHORED ATLAS · ${speedLabel}`, 12, 200, {
        color: "#8f86d9",
        shadow: "#050914",
        scale: 1,
      });
      const segment = Math.min(clips.length - 1, Math.floor(sourceBeat / clipBeats));
      for (let index = 0; index < clips.length; index += 1) {
        pixelRect(
          captureContext,
          272 + index * 16,
          201,
          12,
          3,
          index === segment ? "#f4c95d" : "#29435d",
        );
      }
    }

    globalThis.measureMatchCapture = {
      heroTotalBeats: totalHeroBeats,
      bpm: DEFAULT_BEATMAP.bpm,
      offsetSeconds: DEFAULT_BEATMAP.offsetSeconds,

      renderHero({ character, sourceBeat, speedLabel }) {
        const safeBeat = Math.max(0, Math.min(totalHeroBeats - 1e-7, sourceBeat));
        const clipIndex = Math.min(clips.length - 1, Math.floor(safeBeat / clipBeats));
        const [clip, displayName] = clips[clipIndex];
        const phase = (safeBeat - clipIndex * clipBeats) / clipBeats;
        drawHeroBackground(character, displayName, safeBeat, speedLabel);
        const selection = heroRenderer.draw(
          captureContext,
          {
            presentationClip: clip,
            presentationPhase: phase,
            phase,
            direction: 1,
            mirror: false,
          },
          character,
          {
            x: 192,
            floorY: 177,
            scale: 1.45,
            phase,
          },
        );
        return {
          clip,
          phase,
          frameIndex: selection?.frameIndex ?? -1,
          png: captureCanvas.toDataURL("image/png"),
        };
      },
    };

    let sequence = null;
    function beatSnapshot(beat) {
      const beatIndex = Math.floor(beat);
      const barIndex = Math.floor(beat / DEFAULT_BEATMAP.beatsPerBar);
      return Object.freeze({
        audioTime: DEFAULT_BEATMAP.offsetSeconds + beat * 60 / DEFAULT_BEATMAP.bpm,
        playbackSeconds: DEFAULT_BEATMAP.offsetSeconds + beat * 60 / DEFAULT_BEATMAP.bpm,
        beat,
        beatIndex,
        beatPhase: ((beat % 1) + 1) % 1,
        beatInBar: ((beatIndex % DEFAULT_BEATMAP.beatsPerBar) + DEFAULT_BEATMAP.beatsPerBar)
          % DEFAULT_BEATMAP.beatsPerBar,
        barIndex,
        measure: barIndex + 1,
        phrase: Math.floor(barIndex / DEFAULT_BEATMAP.barsPerPhrase) + 1,
        section: "capture",
        intensity: 0.8,
        bpm: DEFAULT_BEATMAP.bpm,
        paused: false,
        running: true,
      });
    }

    function drainEvents(snapshot) {
      sequence.simulation.consumeEvents((event) => {
        sequence.renderer.onEvent(event, snapshot);
      });
    }

    globalThis.measureMatchCapture.resetSequence = async ({ character, mode }) => {
      const simulation = new MeasureMatchSimulation({
        mode,
        character,
        beatmap: DEFAULT_BEATMAP,
        timingWindows: TIMING_WINDOWS.standard,
        reducedMotion: false,
      });
      const renderer = new KakiDanceRenderer(captureCanvas, {
        settings: {
          beatPulse: true,
          timingLabels: true,
          reducedMotion: false,
          reduceFlashes: true,
          screenShake: 0,
          crowdDensity: 1,
        },
        seed: 0x4d454153,
      });
      await renderer.preloadCharacter(character);
      simulation.begin(beatSnapshot(0));
      sequence = {
        character,
        mode,
        simulation,
        renderer,
        lastBeat: -1e-7,
        claimed: new Set(),
        targets: DEFAULT_BEATMAP.patterns.flatMap((pattern) => (
          pattern.targetTicks.map((tick, index) => ({
            key: `${pattern.id}:${index}`,
            beat: (pattern.responseBar - 1) * DEFAULT_BEATMAP.beatsPerBar + tick / 4,
          }))
        )).sort((a, b) => a.beat - b.beat),
      };
      renderer.reset();
      return true;
    };

    globalThis.measureMatchCapture.renderSequence = ({ beat }) => {
      if (!sequence) throw new Error("Capture sequence was not initialized.");
      if (beat + 1e-7 < sequence.lastBeat) {
        throw new Error("Capture beats must be monotonic.");
      }
      const emptyInput = {
        x: 0,
        y: 0,
        actionPressed: false,
        stylePressed: false,
        powerPressed: false,
        freezePressed: false,
        device: "keyboard",
      };
      for (const target of sequence.targets) {
        if (
          sequence.claimed.has(target.key)
          || target.beat <= sequence.lastBeat + 1e-7
          || target.beat > beat + 1e-7
        ) continue;
        const targetSnapshot = beatSnapshot(target.beat);
        sequence.simulation.update(1 / 120, targetSnapshot, {
          ...emptyInput,
          actionPressed: true,
        });
        sequence.claimed.add(target.key);
        drainEvents(sequence.simulation.getSnapshot(targetSnapshot));
      }
      const snapshotAtFrame = beatSnapshot(beat);
      sequence.simulation.update(1 / 120, snapshotAtFrame, emptyInput);
      const snapshot = sequence.simulation.getSnapshot(snapshotAtFrame);
      drainEvents(snapshot);
      sequence.renderer.update(1 / 12, snapshot);
      sequence.renderer.render(snapshot);
      sequence.lastBeat = beat;
      return {
        bar: snapshot.measureMatch.bar,
        state: snapshot.measureMatch.state,
        label: snapshot.measureMatch.label,
        clip: snapshot.dancer.presentationClip,
        phase: snapshot.dancer.presentationPhase,
        completedMeasures: sequence.simulation.results.length,
        claimedTargets: sequence.claimed.size,
        png: captureCanvas.toDataURL("image/png"),
      };
    };
  });
}

async function captureHero(character, {
  label,
  speed,
  fps: framesPerSecond,
}) {
  const capture = await page.evaluate(() => ({
    totalBeats: globalThis.measureMatchCapture.heroTotalBeats,
    bpm: globalThis.measureMatchCapture.bpm,
  }));
  const beatsPerSecond = capture.bpm / 60;
  const durationSeconds = capture.totalBeats / beatsPerSecond / speed;
  const frameCount = Math.ceil(durationSeconds * framesPerSecond);
  const tempRoot = mkdtempSync(resolve(tmpdir(), `kaki-dance-${character}-${label}-`));
  const sampledFrames = new Set();
  try {
    for (let frame = 0; frame < frameCount; frame += 1) {
      const sourceBeat = Math.min(
        capture.totalBeats - 1e-7,
        frame / framesPerSecond * beatsPerSecond * speed,
      );
      const rendered = await page.evaluate(
        ({ performer, beat, rate }) => globalThis.measureMatchCapture.renderHero({
          character: performer,
          sourceBeat: beat,
          speedLabel: rate,
        }),
        {
          performer: character,
          beat: sourceBeat,
          rate: speed === 1 ? "FULL SPEED" : "QUARTER SPEED",
        },
      );
      if (rendered.frameIndex < 0) throw new Error(`${character} atlas did not render.`);
      sampledFrames.add(`${rendered.clip}:${rendered.frameIndex}`);
      saveDataUrl(
        rendered.png,
        resolve(tempRoot, `frame-${String(frame).padStart(4, "0")}.png`),
      );
    }
    const outputPath = resolve(outputDir, `${character}-${label}.mp4`);
    encodeVideo(tempRoot, outputPath, {
      framesPerSecond,
      durationSeconds,
    });
    return {
      type: "hero",
      character,
      label,
      path: relativeOutput(outputPath),
      dimensions: [384, 216],
      fps: framesPerSecond,
      frameCount,
      uniqueAtlasFrames: sampledFrames.size,
      durationSeconds: round(durationSeconds),
      bytes: statSync(outputPath).size,
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function captureMeasureSequence({
  label,
  character,
  bars,
  fps: framesPerSecond,
}) {
  const capture = await page.evaluate(() => ({
    bpm: globalThis.measureMatchCapture.bpm,
    offsetSeconds: globalThis.measureMatchCapture.offsetSeconds,
  }));
  const durationSeconds = bars * 4 * 60 / capture.bpm;
  const frameCount = Math.ceil(durationSeconds * framesPerSecond);
  const mode = bars <= 5 ? "practice" : "measure";
  await page.evaluate(
    ({ performer, captureMode }) => globalThis.measureMatchCapture.resetSequence({
      character: performer,
      mode: captureMode,
    }),
    { performer: character, captureMode: mode },
  );
  const tempRoot = mkdtempSync(resolve(tmpdir(), `kaki-dance-${label}-`));
  let last = null;
  try {
    for (let frame = 0; frame < frameCount; frame += 1) {
      const beat = Math.min(
        bars * 4 - 1e-7,
        frame / framesPerSecond * capture.bpm / 60,
      );
      last = await page.evaluate(
        ({ nextBeat }) => globalThis.measureMatchCapture.renderSequence({ beat: nextBeat }),
        { nextBeat: beat },
      );
      saveDataUrl(
        last.png,
        resolve(tempRoot, `frame-${String(frame).padStart(4, "0")}.png`),
      );
      if (label === "measure-match-gameplay" && frame === Math.round(5.2 * framesPerSecond)) {
        saveDataUrl(last.png, resolve(outputDir, "measure-match-gameplay.png"));
      }
    }
    const outputPath = resolve(outputDir, `${label}.mp4`);
    encodeVideo(tempRoot, outputPath, {
      framesPerSecond,
      durationSeconds,
      audioPath,
      audioOffsetSeconds: capture.offsetSeconds,
    });
    return {
      type: "gameplay",
      character,
      label,
      mode,
      path: relativeOutput(outputPath),
      dimensions: [384, 216],
      fps: framesPerSecond,
      frameCount,
      durationSeconds: round(durationSeconds),
      bytes: statSync(outputPath).size,
      finalBar: last?.bar,
      finalState: last?.state,
      completedMeasures: last?.completedMeasures,
      claimedTargets: last?.claimedTargets,
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function encodeVideo(frameDir, outputPath, {
  framesPerSecond,
  durationSeconds,
  audioPath: sourceAudio = null,
  audioOffsetSeconds = 0,
}) {
  const args = [
    "-framerate", String(framesPerSecond),
    "-i", resolve(frameDir, "frame-%04d.png"),
  ];
  if (sourceAudio) {
    args.push("-stream_loop", "1", "-ss", String(audioOffsetSeconds), "-i", sourceAudio);
  }
  args.push(
    "-map", "0:v:0",
    ...(sourceAudio ? ["-map", "1:a:0"] : []),
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
  );
  if (sourceAudio) {
    args.push(
      "-c:a", "aac",
      "-b:a", "128k",
      "-af", "apad",
      "-t", String(durationSeconds),
    );
  } else {
    args.push("-an");
  }
  args.push("-y", outputPath);
  runFfmpeg(args);
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed (${result.status}): ${result.stderr || result.stdout}`);
  }
}

function saveDataUrl(dataUrl, outputPath) {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  writeFileSync(outputPath, Buffer.from(payload, "base64"));
}

function relativeOutput(path) {
  return path.slice(projectRoot.length + 1);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
