// Diagnostic: in-page FPS + long-task profile during memoria playback
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('console', (m) => {
  if (m.text().startsWith('[perf]')) console.log(m.text());
});
// pass e.g. `?tier=low` as argv[2] to force a perf tier
const url = (process.env.SMOKE_URL ?? 'http://localhost:5199') + (process.argv[2] ?? '');
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
// the welcome modal shows on every load — dismiss it, then pause the
// autoplay it triggers so the idle sample is actually idle
await page.keyboard.press('Escape');
const pauseBtn = page.getByRole('button', { name: /pausa|pause/i });
if (await pauseBtn.count()) await pauseBtn.click();
await page.waitForTimeout(500);

// idle FPS first
const fps = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const loop = () => {
          n++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(loop);
          else resolve(Math.round(n / 2));
        };
        requestAnimationFrame(loop);
      })
  );

console.log('idle fps:', await fps());

// long tasks during playback
await page.evaluate(() => {
  window.__long = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__long.push(Math.round(e.duration));
  }).observe({ entryTypes: ['longtask'] });
});
await page.getByRole('button', { name: /reproducir|play/i }).click();
console.log('playing fps:', await fps());
// with the cursor parked on the canvas: hover picking + playback re-pick
await page.mouse.move(750, 450);
console.log('playing fps (hovering):', await fps());
await page.screenshot({ path: `scripts/probe-fps${process.argv[2] ? '-' + process.argv[2].replace(/\W+/g, '') : ''}.png` });
const long = await page.evaluate(() => window.__long);
console.log('long tasks (ms):', long.slice(0, 30), 'count:', long.length);
await browser.close();
