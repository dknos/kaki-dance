import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const review = resolve(root, "docs/review/frolic-rescue-candidate-1");
const baseUrl = process.env.KAKI_DANCE_URL ?? "http://127.0.0.1:4177";
for (const directory of ["stills", "video", "diagnostics", "strips", "comparisons", "audio"]) {
  mkdirSync(resolve(review, directory), { recursive: true });
}

const server = await ensureServer();
const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync("/home/nemoclaw/bin/chromium") ? "/home/nemoclaw/bin/chromium" : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const report = { candidateStatus: "human-review-required", heroes: {}, errors: [] };

try {
  for (const hero of ["kitty", "soder"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("pageerror", (error) => report.errors.push(`${hero}: ${error.stack ?? error.message}`));
    await page.goto(`${baseUrl}/?candidate-capture=1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(globalThis.kakiDance));
    await page.evaluate(async (selectedHero) => {
      await globalThis.kakiDance.start({
        mode: "frolic",
        character: selectedHero,
        style: "flatfoot",
        offsetSeconds: 4,
        immediate: true,
      });
      globalThis.kakiDance.setFrolicQaMode(true);
    }, hero);
    await page.waitForTimeout(300);

    await press(page, "KeyX");
    await page.waitForTimeout(150);
    const native = resolve(review, `stills/${hero}-native-384x216.png`);
    await saveCanvas(page, native);
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", native,
      "-vf", "scale=1536:864:flags=neighbor",
      resolve(review, `stills/${hero}-4x-1536x864.png`),
    ]);

    await page.evaluate(() => globalThis.kakiDance.setFrolicDebugOverlay(true));
    await press(page, "KeyV");
    await page.waitForTimeout(280);
    await saveCanvas(page, resolve(review, `diagnostics/${hero}-contact-diagnostic.png`));
    await page.evaluate(() => globalThis.kakiDance.setFrolicDebugOverlay(false));

    const videoDataUrl = await page.evaluate(async () => {
      const canvas = document.getElementById("game-canvas");
      const stream = canvas.captureStream(30);
      const mimeType = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((value) => MediaRecorder.isTypeSupported(value));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2_400_000 } : undefined);
      const chunks = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      const codes = ["KeyZ", "KeyX", "KeyZ", "KeyC", "KeyX", "KeyZ", "KeyV", "KeyZ"];
      let cursor = 0;
      const dispatch = (code, type) => window.dispatchEvent(new KeyboardEvent(type, {
        code,
        bubbles: true,
        cancelable: true,
      }));
      recorder.start(250);
      const interval = setInterval(() => {
        const code = codes[cursor % codes.length];
        const direction = ["ArrowLeft", "", "ArrowRight", "ArrowDown"][cursor % 4];
        if (direction) dispatch(direction, "keydown");
        dispatch(code, "keydown");
        dispatch(code, "keyup");
        if (direction) setTimeout(() => dispatch(direction, "keyup"), 120);
        cursor += 1;
      }, 360);
      await new Promise((resolveWait) => setTimeout(resolveWait, 10_000));
      clearInterval(interval);
      recorder.stop();
      await new Promise((resolveStop) => recorder.addEventListener("stop", resolveStop, { once: true }));
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType });
      return new Promise((resolveRead) => {
        const reader = new FileReader();
        reader.onloadend = () => resolveRead(reader.result);
        reader.readAsDataURL(blob);
      });
    });
    const webm = resolve(review, `video/${hero}-flatfoot-runtime.webm`);
    writeFileSync(webm, Buffer.from(String(videoDataUrl).split(",")[1], "base64"));
    const normal = resolve(review, `video/${hero}-flatfoot-normal.mp4`);
    const half = resolve(review, `video/${hero}-flatfoot-half-speed.mp4`);
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", webm,
      "-an", "-vf", "fps=30,scale=384:216:flags=neighbor",
      "-t", "10", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", normal,
    ]);
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", webm,
      "-an", "-vf", "trim=duration=5,setpts=2*(PTS-STARTPTS),fps=30,scale=384:216:flags=neighbor",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", half,
    ]);
    await page.close();

    const rejectedName = hero === "soder" ? "soter" : hero;
    const comparison = resolve(review, `comparisons/${hero}-rejected-vs-candidate.png`);
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", resolve(root, `docs/review/rejected-0c82fe7/media/native/${rejectedName}-flatfoot.png`),
      "-i", native,
      "-filter_complex", "[0:v]scale=384:216:flags=neighbor[left];[1:v]scale=384:216:flags=neighbor[right];[left][right]hstack=inputs=2",
      "-frames:v", "1", comparison,
    ]);
    createStrip(hero);
    report.heroes[hero] = {
      nativeStill: relative(`stills/${hero}-native-384x216.png`),
      enlargedStill: relative(`stills/${hero}-4x-1536x864.png`),
      diagnostic: relative(`diagnostics/${hero}-contact-diagnostic.png`),
      movementStrip: relative(`strips/${hero}-flatfoot-movement-strip.png`),
      normalVideo: relative(`video/${hero}-flatfoot-normal.mp4`),
      halfSpeedVideo: relative(`video/${hero}-flatfoot-half-speed.mp4`),
      runtimeWebm: relative(`video/${hero}-flatfoot-runtime.webm`),
      comparison: relative(`comparisons/${hero}-rejected-vs-candidate.png`),
    };
  }
  createAudioComparison();
  writeFileSync(resolve(review, "capture-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (report.errors.length) throw new Error(report.errors.join("\n"));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  server?.kill();
}

async function press(page, code) {
  await page.evaluate((value) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: value, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: value, bubbles: true, cancelable: true }));
  }, code);
}

async function saveCanvas(page, path) {
  const data = await page.evaluate(() => document.getElementById("game-canvas").toDataURL("image/png"));
  writeFileSync(path, Buffer.from(data.split(",")[1], "base64"));
}

function createStrip(hero) {
  const frames = ["0001", "0004", "0008", "0012", "0016", "0020", "0024", "0028"];
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const frame of frames) {
    args.push("-i", resolve(root, `build/frolic-rescue-candidate-1/source-renders/${hero}/walkingStep/${frame}.png`));
  }
  const filters = frames.map((_, index) => (
    `[${index}:v]scale=128:128:flags=lanczos,format=rgba,pad=128:128:(ow-iw)/2:(oh-ih)/2:color=0x14191b[frame${index}]`
  ));
  filters.push(`${frames.map((_, index) => `[frame${index}]`).join("")}hstack=inputs=${frames.length}`);
  args.push(
    "-filter_complex", filters.join(";"),
    "-frames:v", "1",
    resolve(review, `strips/${hero}-flatfoot-movement-strip.png`),
  );
  execFileSync("ffmpeg", args);
}

function createAudioComparison() {
  const oldSample = resolve(root, "docs/review/rejected-0c82fe7/assets/audio/frolic/feet/heel-1.wav");
  const newSample = resolve(root, "assets/audio/frolic/feet/heel-medium-1.wav");
  const output = resolve(review, "audio/rejected-then-candidate-heel.wav");
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", oldSample,
    "-f", "lavfi", "-t", "0.5", "-i", "anullsrc=r=48000:cl=mono",
    "-i", newSample,
    "-filter_complex",
    "[0:a]aresample=48000,aformat=sample_fmts=s32:channel_layouts=mono[old];"
      + "[1:a]aformat=sample_fmts=s32:channel_layouts=mono[silence];"
      + "[2:a]aresample=48000,aformat=sample_fmts=s32:channel_layouts=mono[new];"
      + "[old][silence][new]concat=n=3:v=0:a=1[out]",
    "-map", "[out]", "-c:a", "pcm_s24le", output,
  ]);
  writeFileSync(resolve(review, "audio/README.md"), `# Rejected / candidate Foley comparison

\`rejected-then-candidate-heel.wav\` plays the rejected synthesized heel first,
then 500 ms of silence, then the candidate real shoe-on-parquet heel.

No approval is inferred from this file or the automated signal report.
`);
}

function relative(path) {
  return `docs/review/frolic-rescue-candidate-1/${path}`;
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
      // Keep waiting.
    }
  }
  child.kill();
  throw new Error(`Could not start candidate capture server at ${baseUrl}`);
}
