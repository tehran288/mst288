// خروجی گرفتن موشن گرافیک به صورت MP4 (1920x1080، 30fps)
// اجرا:  node export.mjs [out.mp4] [fps]
// نیازمندی‌ها: Node 18+، پکیج playwright (npm i playwright)، و ffmpeg در PATH
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, "rasa-studio-promo.mp4");
const fps = Number(process.argv[3] || 30);

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, "index.html")).href + "?export=1");
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const duration = await page.evaluate(() => window.DURATION);
const frames = Math.round(duration * fps);

const ff = spawn("ffmpeg", [
  "-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", out
], { stdio: ["pipe", "inherit", "inherit"] });

const stage = page.locator("#stage");
for (let f = 0; f < frames; f++) {
  await page.evaluate(t => window.__render(t), f / fps);
  const buf = await stage.screenshot({ type: "jpeg", quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
  if (f % fps === 0) process.stdout.write(`\r${Math.round((f / frames) * 100)}%`);
}
ff.stdin.end();
await new Promise(r => ff.on("close", r));
await browser.close();
console.log(`\nDone → ${out}`);
