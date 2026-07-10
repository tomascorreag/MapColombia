// Low-end proxy probe: headless Chromium renders WebGL on SwiftShader
// (software rasterizer), a stand-in for the weakest hardware we target.
// Headed numbers (probe-fps.mjs) remain the real-GPU reference; treat these
// as RELATIVE before/after signals, not absolute fps promises.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.addInitScript(() => localStorage.setItem('mdv:welcome:v1', '1'));

// long tasks from the very start (captures the tendril build at load)
await page.addInitScript(() => {
  window.__long = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__long.push(Math.round(e.duration));
  }).observe({ entryTypes: ['longtask'], buffered: true });
});

page.on('crash', () => console.error('PAGE CRASHED'));
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning' || t.startsWith('[perf]'))
    console.log(`[${m.type()}]`, t);
});

const t0 = Date.now();
// pass e.g. `&tier=high` as argv[2] to force a tier (A/B on the same build)
const url =
  (process.env.SMOKE_URL ?? 'http://localhost:5199') +
  '/?section=violence' +
  (process.argv[2] ? '&' + process.argv[2].replace(/^[?&]/, '') : '');
await page.goto(url, { waitUntil: 'networkidle' });
// wait for the map UI (play button) to exist = data loaded + first layer build
await page.getByRole('button', { name: /reproducir|play/i }).waitFor({ timeout: 120000 });
console.log('ready in ms:', Date.now() - t0);
// the welcome modal shows on every load — dismiss it (Escape closes it)
await page.keyboard.press('Escape');
// closing the welcome auto-starts playback; pause for a clean idle sample
const playBtn = page.getByRole('button', { name: /reproducir|pausa|play/i });
if ((await playBtn.getAttribute('aria-label'))?.match(/pausa|pause/i)) {
  await playBtn.click({ force: true }); // frames are seconds long on SwiftShader; skip the stability wait
}

console.log(
  'gpu:',
  await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a';
  })
);

// frames are SECONDS long on SwiftShader — report ms/frame, not fps
const fps = (secs = 3) =>
  page.evaluate(
    (s) =>
      new Promise((resolve) => {
        let n = 0;
        const t = performance.now();
        const loop = () => {
          n++;
          const el = performance.now() - t;
          if (el < s * 1000) requestAnimationFrame(loop);
          else resolve(`${Math.round(n / (el / 1000))} fps (${Math.round(el / n)} ms/frame)`);
        };
        requestAnimationFrame(loop);
      }),
    secs
  );

await page.waitForTimeout(2500);
console.log('idle fps:', await fps());

// playback fps with the cursor OFF the canvas (no hover-picking in the mix)
await page.getByRole('button', { name: /reproducir|play/i }).click({ force: true });
await page.waitForTimeout(500);
console.log('playing fps (no hover):', await fps(10));

// then with the cursor parked on the canvas centre: exercises deck hover
// picking + the playback re-pick path
await page.mouse.move(683, 384);
console.log('playing fps (hovering):', await fps(10));

await page
  .screenshot({ path: 'scripts/probe-lowend.png', timeout: 90000 })
  .catch((e) => console.log('screenshot failed:', e.message));
const long = await page.evaluate(() => window.__long);
console.log(
  'long tasks ms (top 12):',
  [...long].sort((a, b) => b - a).slice(0, 12),
  'count:',
  long.length,
  'total:',
  long.reduce((a, b) => a + b, 0)
);
await browser.close();
