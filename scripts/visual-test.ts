// Visual alignment test: zero markers vs surface minima in a top-down screenshot.
// Pass: every marker centre is within 2 px of a local minimum of the rendered
// log|ζ| along the critical-line column. Needs the dev server (pnpm dev).
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const URL_ = process.env.URL ?? 'http://localhost:5196/?test=minima&capture=1';
const W = 400;
const H = 2200;
const TOL = 2;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(URL_);
await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 60000 });
// the capture flag fixes the canvas at 1920×1080; resize it to the viewport for this test
await page.evaluate(([w, h]) => {
  const app = (window as any).__app;
  app.renderer.setPixelRatio(1);
  app.renderer.setSize(w, h, false);
  app.renderer.domElement.style.width = `${w}px`;
  app.renderer.domElement.style.height = `${h}px`;
  app.W = w; app.H = h;
}, [W, H]);

const shot = async (phase: string) => {
  await page.evaluate((p) => (window as any).__minimaTest.phase(p), phase);
  return PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } }));
};
const surface = await shot('surface');
const markers = await shot('markers');
const expected: { x: number; y: number }[] = await page.evaluate(() => (window as any).__minimaTest.project());
const lineX = Math.round(await page.evaluate(() => (window as any).__minimaTest.criticalLineX()));
await browser.close();

const px = (img: PNG, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

// 1. surface minima along the critical-line column (average 3 columns)
const prof: number[] = [];
for (let y = 0; y < H; y++) {
  let s = 0;
  for (let dx = -1; dx <= 1; dx++) s += px(surface, lineX + dx, y)[0];
  prof.push(s / 3);
}
const minima: number[] = [];
const R = 6;
for (let y = R; y < H - R; y++) {
  let isMin = true;
  for (let k = -R; k <= R; k++) if (prof[y + k] < prof[y] || (k > 0 && prof[y + k] === prof[y] && false)) isMin = false;
  if (isMin && prof[y] < prof[y - R] - 1 && prof[y] < prof[y + R] - 1) {
    // centre of a flat run
    let a = y; let b = y;
    while (a > 0 && prof[a - 1] === prof[y]) a--;
    while (b < H - 1 && prof[b + 1] === prof[y]) b++;
    const c = (a + b) / 2;
    if (!minima.length || Math.abs(minima[minima.length - 1] - c) > 3) minima.push(c);
  }
}

// 2. red marker blobs → centroids
const seen = new Uint8Array(W * H);
const blobs: { x: number; y: number; n: number }[] = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const [r, g, b] = px(markers, x, y);
    if (seen[y * W + x] || !(r > 150 && g < 80 && b < 80)) continue;
    let sx = 0; let sy = 0; let n = 0;
    const st = [[x, y]];
    seen[y * W + x] = 1;
    while (st.length) {
      const [cx, cy] = st.pop()!;
      sx += cx; sy += cy; n++;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx]) continue;
        const [rr, gg, bb] = px(markers, nx, ny);
        if (rr > 150 && gg < 80 && bb < 80) { seen[ny * W + nx] = 1; st.push([nx, ny]); }
      }
    }
    if (n >= 4) blobs.push({ x: sx / n, y: sy / n, n });
  }
}

let worst = 0;
let fails = 0;
const rows: string[] = [];
blobs.sort((a, b) => b.y - a.y).forEach((m, k) => {
  const near = minima.reduce((best, y) => (Math.abs(y - m.y) < Math.abs(best - m.y) ? y : best), Infinity);
  const d = Math.hypot(m.x - lineX, m.y - near);
  worst = Math.max(worst, d);
  if (d > TOL) fails++;
  rows.push(`zero ${String(k + 1).padStart(2)}: marker (${m.x.toFixed(1)}, ${m.y.toFixed(1)})  minimum y=${near.toFixed(1)}  Δ=${d.toFixed(2)} px`);
});
console.log(rows.join('\n'));
console.log(`markers found: ${blobs.length} (expected ${expected.length}); surface minima on the line: ${minima.length}`);
console.log(`worst distance: ${worst.toFixed(2)} px (tolerance ${TOL} px)`);
const ok = blobs.length === expected.length && expected.length === 29 && fails === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
