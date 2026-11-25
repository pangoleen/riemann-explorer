// Deterministic story capture: Playwright drives window.__renderFrame(t) with
// t = frame / fps (no wall clock, so no dropped frames), saves PNG frames, then
// ffmpeg encodes H.264.
//
//   pnpm capture                 1920×1080, 60 fps → out/riemann-explorer.mp4
//   pnpm capture --aspect=4x5    1080×1350          → out/riemann-explorer-4x5.mp4
//   pnpm capture --only=0,8,20   stills at those seconds → out/preview/
//   options: --fps=60 --from=0 --to=45 --keep-frames --headed
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const arg = (k: string, d?: string) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : process.argv.includes(`--${k}`) ? 'true' : d;
};
const aspect = arg('aspect', '16x9') === '4x5' ? '4x5' : '16x9';
const fps = Number(arg('fps', '60'));
const [W, H] = aspect === '4x5' ? [1080, 1350] : [1920, 1080];
const only = arg('only')?.split(',').map(Number);
const keep = arg('keep-frames') === 'true';
const OUT = 'out';
const FRAMES = join(OUT, aspect === '4x5' ? 'frames-4x5' : 'frames');
const MP4 = join(OUT, aspect === '4x5' ? 'riemann-explorer-4x5.mp4' : 'riemann-explorer.mp4');

const server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.config.server.port ?? 5197;
const url = `http://localhost:${port}/?story=1&hideui=1&capture=1${aspect === '4x5' ? '&aspect=4x5' : ''}&fps=${fps}`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: arg('headed') !== 'true',
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force-color-profile=srgb'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 120000 });
await page.evaluate(() => document.fonts.ready);
const duration: number = await page.evaluate(() => (window as any).__storyDuration);
// warm-up: compile every shader and upload every buffer before frame 0
for (const t of [0, 10, 26, 33, 42]) await page.evaluate((x) => (window as any).__renderFrame(x), t);

if (only) {
  mkdirSync(join(OUT, 'preview'), { recursive: true });
  for (const t of only) {
    await page.evaluate((x) => (window as any).__renderFrame(x), t);
    const p = join(OUT, 'preview', `${aspect}-t${String(t).padStart(5, '0')}.png`);
    await page.screenshot({ path: p });
    console.log(p);
  }
} else {
  const from = Number(arg('from', '0'));
  const to = Number(arg('to', String(duration)));
  const n0 = Math.round(from * fps);
  const n1 = Math.round(to * fps);
  if (existsSync(FRAMES)) rmSync(FRAMES, { recursive: true });
  mkdirSync(FRAMES, { recursive: true });
  const t0 = Date.now();
  for (let i = n0; i < n1; i++) {
    await page.evaluate((x) => (window as any).__renderFrame(x), i / fps);
    await page.screenshot({ path: join(FRAMES, `${String(i - n0).padStart(5, '0')}.png`) });
    if ((i - n0) % 120 === 0) {
      const done = i - n0 + 1;
      const rate = done / ((Date.now() - t0) / 1000);
      console.log(`frame ${done}/${n1 - n0}  ${rate.toFixed(1)} fps  eta ${((n1 - i) / rate / 60).toFixed(1)} min`);
    }
  }
  console.log(`captured ${n1 - n0} frames in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
await browser.close();
await server.close();

if (!only) {
  const count = readdirSync(FRAMES).filter((f) => f.endsWith('.png')).length;
  const ff = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(FRAMES, '%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', MP4,
  ], { stdio: 'inherit' });
  if (ff.status !== 0) process.exit(ff.status ?? 1);
  console.log(`wrote ${MP4} from ${count} frames`);
  if (!keep) {
    rmSync(FRAMES, { recursive: true });
    console.log(`removed ${FRAMES} (use --keep-frames to keep them)`);
  }
}
