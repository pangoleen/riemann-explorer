// Dev helper: screenshot a URL with the installed Chrome. Usage: tsx scripts/shot.ts <url> <out.png> [w h] [waitMs] [js]
import { chromium } from 'playwright';
const [url, out, w = '1600', h = '900', wait = '2500', js = ''] = process.argv.slice(2);
const headless = process.env.HEADED !== '1';
const browser = await chromium.launch({
  channel: 'chrome', headless,
  args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs: string[] = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 60000 }).catch(() => logs.push('not ready'));
await page.waitForTimeout(+wait);
if (js) console.log('js:', JSON.stringify(await page.evaluate(js)));
const info = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext;
  const ext = c.getExtension('WEBGL_debug_renderer_info');
  return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a';
});
await page.screenshot({ path: out });
console.log('renderer:', info);
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
