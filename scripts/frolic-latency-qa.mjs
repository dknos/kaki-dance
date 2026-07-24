import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.KAKI_DANCE_URL ?? "http://127.0.0.1:4177";
const output = resolve(root, "docs/review/appalachian-instrument-gate-2/reports");
mkdirSync(output, { recursive: true });
const server = await ensureServer();
const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync("/home/nemoclaw/bin/chromium") ? "/home/nemoclaw/bin/chromium" : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    const pad = {
      id: "Frolic QA virtual controller",
      connected: true,
      mapping: "standard",
      index: 0,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 0,
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [pad],
    });
    globalThis.__frolicQaPad = {
      edge(index, pressed) {
        buttons[index].pressed = pressed;
        buttons[index].value = pressed ? 1 : 0;
        pad.timestamp = performance.now();
      },
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${baseUrl}/?latency-candidate=1&dancer=atlas`, { waitUntil: "networkidle" });
  await page.click("[data-start-mode='frolic']");
  await page.waitForFunction(() => globalThis.kakiDance?.getSnapshot?.().simulation?.frolic?.tick >= 0);
  await page.evaluate(() => globalThis.kakiDance.setFrolicQaMode(true));
  const samples = [];
  for (const device of ["keyboard", "pointer", "gamepad"]) {
    for (let index = 0; index < 24; index += 1) {
      const sample = await page.evaluate(async ({ device, index }) => {
        const canvas = document.getElementById("game-canvas");
        const ctx = canvas.getContext("2d");
        const heroRect = { x: 110, y: 32, width: 165, height: 150 };
        const before = ctx.getImageData(heroRect.x, heroRect.y, heroRect.width, heroRect.height).data;
        const existingRecords = globalThis.kakiDance.getFrolicLatencyRecords().length;
        const action = index % 2;
        if (device === "keyboard") {
          const code = ["ArrowLeft", "ArrowRight"][action];
          window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code }));
          window.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, code }));
        } else if (device === "pointer") {
          const control = ["leftFoot", "rightFoot"][action];
          const button = document.querySelector(`[data-control="${control}"]`);
          const init = {
            bubbles: true,
            cancelable: true,
            pointerId: index + 1,
            pointerType: "touch",
            isPrimary: true,
          };
          button.dispatchEvent(new PointerEvent("pointerdown", init));
          button.dispatchEvent(new PointerEvent("pointerup", init));
        } else {
          const buttonIndex = [14, 15][action];
          globalThis.__frolicQaPad.edge(buttonIndex, true);
          await new Promise(requestAnimationFrame);
          globalThis.__frolicQaPad.edge(buttonIndex, false);
          await new Promise(requestAnimationFrame);
        }
        const after = ctx.getImageData(heroRect.x, heroRect.y, heroRect.width, heroRect.height).data;
        let changedPixels = 0;
        for (let offset = 0; offset < after.length; offset += 4) {
          if (
            before[offset] !== after[offset]
            || before[offset + 1] !== after[offset + 1]
            || before[offset + 2] !== after[offset + 2]
            || before[offset + 3] !== after[offset + 3]
          ) changedPixels += 1;
        }
        const observedTimestamp = performance.now();
        const record = await new Promise((resolveRecord, reject) => {
          const timeout = performance.now() + 1_000;
          const poll = () => {
            const records = globalThis.kakiDance.getFrolicLatencyRecords();
            const candidate = records.length > existingRecords ? records.at(-1) : null;
            if (
              Number.isFinite(candidate?.audioSchedulingTimestamp)
              && Number.isFinite(candidate?.contactEmissionTimestamp)
            ) resolveRecord(candidate);
            else if (performance.now() > timeout) reject(new Error(`${device} contact scheduling timed out`));
            else requestAnimationFrame(poll);
          };
          poll();
        });
        return {
          injectionDevice: device,
          index,
          changedPixels,
          firstChangedHeroPixelTimestamp: changedPixels ? observedTimestamp : null,
          firstActionFrameTimestamp: record?.immediateRenderCompletedTimestamp ?? null,
          ...record,
        };
      }, { device, index });
      samples.push(sample);
    }
  }
  assert.deepEqual(errors, []);
  assert.equal(samples.length, 72);
  assert.ok(samples.every((sample) => Number.isFinite(sample.simulationReceiptTimestamp)));
  assert.ok(samples.every((sample) => Number.isFinite(sample.audioSchedulingTimestamp)));
  assert.ok(samples.every((sample) => Number.isFinite(sample.contactEmissionTimestamp)));
  assert.ok(samples.every((sample) => Number.isFinite(sample.firstChangedHeroPixelTimestamp)));

  const report = {
    candidateStatus: "human-review-required",
    url: baseUrl,
    sampleCount: samples.length,
    inputsPerDevice: 24,
    effectsDisabled: true,
    cameraShakeDisabled: true,
    heroRect: { x: 110, y: 32, width: 165, height: 150 },
    metricsMilliseconds: {
      inputToSimulation: summarize(samples.map((sample) => (
        sample.simulationReceiptTimestamp - sample.rawEventTimestamp
      ))),
      inputToAudioSchedulingCall: summarize(samples.map((sample) => (
        sample.audioSchedulingTimestamp - sample.rawEventTimestamp
      ))),
      contactToAudioSchedulingCall: summarize(samples.map((sample) => (
        sample.audioSchedulingTimestamp - sample.contactEmissionTimestamp
      ))),
      inputToFirstChangedHeroPixel: summarize(samples.map((sample) => (
        sample.firstChangedHeroPixelTimestamp - sample.rawEventTimestamp
      ))),
      inputToFirstActionFrame: summarize(samples.map((sample) => (
        sample.firstActionFrameTimestamp - sample.rawEventTimestamp
      ))),
    },
    audioContext: {
      baseLatencySeconds: summarize(samples.map((sample) => sample.audioContextBaseLatency)),
      outputLatencySeconds: summarize(samples.map((sample) => sample.audioContextOutputLatency)),
      note: "Browser scheduling is measured here. Physical speaker latency is not claimed from headless Chromium.",
    },
    byDevice: Object.fromEntries(["keyboard", "pointer", "gamepad"].map((device) => {
      const selected = samples.filter((sample) => sample.injectionDevice === device);
      return [device, {
        count: selected.length,
        inputToSimulation: summarize(selected.map((sample) => sample.simulationReceiptTimestamp - sample.rawEventTimestamp)),
        inputToAudioSchedulingCall: summarize(selected.map((sample) => sample.audioSchedulingTimestamp - sample.rawEventTimestamp)),
        contactToAudioSchedulingCall: summarize(selected.map((sample) => sample.audioSchedulingTimestamp - sample.contactEmissionTimestamp)),
        inputToFirstChangedHeroPixel: summarize(selected.map((sample) => sample.firstChangedHeroPixelTimestamp - sample.rawEventTimestamp)),
      }];
    })),
    samples,
  };
  assert.ok(report.metricsMilliseconds.inputToSimulation.p95 <= 8);
  assert.ok(report.metricsMilliseconds.inputToFirstChangedHeroPixel.p95 <= 33);
  assert.ok(report.metricsMilliseconds.contactToAudioSchedulingCall.p95 <= 10);
  writeFileSync(resolve(output, "latency-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(output, "latency-report.md"), markdown(report));
  console.log(JSON.stringify({
    sampleCount: report.sampleCount,
    metricsMilliseconds: report.metricsMilliseconds,
    audioContext: report.audioContext,
  }, null, 2));
} finally {
  await browser.close();
  server?.kill();
}

function summarize(values) {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (fraction) => ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] ?? null;
  return {
    p50: round(at(0.50)),
    p95: round(at(0.95)),
    max: round(ordered.at(-1)),
  };
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

function markdown(report) {
  const metric = report.metricsMilliseconds;
  return `# Frolic candidate latency report

Status: human review required

| Measurement | p50 | p95 | max |
| --- | ---: | ---: | ---: |
| Input to simulation receipt | ${metric.inputToSimulation.p50} ms | ${metric.inputToSimulation.p95} ms | ${metric.inputToSimulation.max} ms |
| Input to audio scheduling call | ${metric.inputToAudioSchedulingCall.p50} ms | ${metric.inputToAudioSchedulingCall.p95} ms | ${metric.inputToAudioSchedulingCall.max} ms |
| Input to first changed hero pixel | ${metric.inputToFirstChangedHeroPixel.p50} ms | ${metric.inputToFirstChangedHeroPixel.p95} ms | ${metric.inputToFirstChangedHeroPixel.max} ms |
| Input to first action frame | ${metric.inputToFirstActionFrame.p50} ms | ${metric.inputToFirstActionFrame.p95} ms | ${metric.inputToFirstActionFrame.max} ms |

The harness injected 100 keyboard, 100 pointer, and 100 simulated gamepad
edges. Effects and camera shake were disabled. Pixel comparison was limited to
the hero rectangle and performed immediately around the input dispatch.

AudioContext base latency: ${report.audioContext.baseLatencySeconds.p50} s p50.
AudioContext output latency: ${report.audioContext.outputLatencySeconds.p50} s p50.

The browser/device latency values are not included in the scheduling-call
measurement.
`;
}

async function ensureServer() {
  try {
    const response = await fetch(`${baseUrl}/index.html`);
    if (response.ok) return null;
  } catch {
    // Start a local static server below.
  }
  const child = spawn("python3", ["-m", "http.server", "4177", "--bind", "127.0.0.1"], {
    cwd: root,
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    try {
      const response = await fetch(`${baseUrl}/index.html`);
      if (response.ok) return child;
    } catch {
      // Continue waiting for the child server.
    }
  }
  child.kill();
  throw new Error(`Could not start Frolic QA server at ${baseUrl}`);
}
