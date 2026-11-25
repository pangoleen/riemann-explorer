// M3 acceptance: search "MainConclusion" flies there; clicking the star opens the
// panel with the right path and a working GitHub link at the pinned commit.
import { chromium } from 'playwright';

const BASE = process.env.URL ?? 'http://localhost:5196';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/?world=galaxy`);
await page.waitForFunction(() => !!(window as any).__galaxyUi, null, { timeout: 60000 });
await page.waitForTimeout(800);

await page.fill('#search-input', 'MainConclusion');
await page.waitForSelector('#search-results li');
const meta = await page.textContent('#search-meta');
await page.press('#search-input', 'Enter');
await page.waitForTimeout(2600);

const r = await page.evaluate(() => {
  const app = (window as any).__app;
  const g = app.galaxy;
  const i = g.index.highlights['Development.AutomorphicArithmetic.CharacterBoxes.MainConclusion'];
  const p = g.positionOf(i);
  const d = p.distanceTo(app.controls.target);
  const v = p.clone().project(app.camera);
  return { i, targetDist: d, screen: { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight } };
});
// click exactly on the star
await page.mouse.click(r.screen.x, r.screen.y);
await page.waitForTimeout(1200);
// second click: steady-state pick cost
await page.mouse.click(r.screen.x, r.screen.y);
await page.waitForTimeout(600);
const panel = await page.evaluate(() => ({
  hidden: (document.getElementById('panel') as HTMLElement).hidden,
  name: document.getElementById('panel-name')!.textContent,
  crumbs: document.getElementById('panel-crumbs')!.textContent,
  href: (document.getElementById('panel-link') as HTMLAnchorElement).href,
  lines: document.getElementById('panel-lines')!.textContent,
  imports: document.getElementById('panel-imports')!.textContent,
  importers: document.getElementById('panel-importers')!.textContent,
  pickMs: (window as any).__lastPickMs,
}));
await page.screenshot({ path: 'out/shots/e2e-galaxy.png' });
const fps = await page.evaluate(() => (window as any).__bench(120));
await browser.close();

const expectedHref = 'https://github.com/leanprover-community/riemann-hypothesis/blob/40e56bab026552e089d7afcfeff08d2defb9c005/src/Development/AutomorphicArithmetic/CharacterBoxes/MainConclusion.lean';
const head = await fetch(panel.href, { method: 'HEAD', redirect: 'follow' });
const checks = {
  searchMeta: meta,
  flewThere: r.targetDist < 0.5,
  panelOpen: !panel.hidden,
  name: panel.name === 'MainConclusion',
  path: panel.crumbs === 'Development/AutomorphicArithmetic/CharacterBoxes/MainConclusion.lean',
  href: panel.href === expectedHref,
  linkStatus: head.status,
  pickUnder16ms: panel.pickMs < 16,
  noErrors: errors.length === 0,
};
console.log(JSON.stringify({ ...checks, details: panel, frameMs1600x900: fps.toFixed(2), errors }, null, 2));
const ok = checks.flewThere && checks.panelOpen && checks.name && checks.path && checks.href && head.status === 200 && checks.pickUnder16ms && checks.noErrors;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
