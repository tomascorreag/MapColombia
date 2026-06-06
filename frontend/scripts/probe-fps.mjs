// Diagnostic: in-page FPS + long-task profile during memoria playback
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto(process.env.SMOKE_URL ?? 'http://localhost:5199', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.getByRole('button', { name: /memoria|memory/i }).click();
await page.waitForTimeout(1500);

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
const long = await page.evaluate(() => window.__long);
console.log('long tasks (ms):', long.slice(0, 30), 'count:', long.length);
await browser.close();
