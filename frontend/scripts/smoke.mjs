// Visual smoke test: load the dev server, capture console errors, screenshot
// the welcome modal and the memoria view scrubbed to key eras and mid-playback.
// Not a unit test — the console-error count is the gate; screenshots are for
// human inspection and tolerate capture stalls (headless WebGL is software-
// rendered, and a saturated raster thread can stall Chromium's capture for
// tens of seconds).
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5199';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
// software-rendered WebGL can saturate the renderer for long stretches —
// locator actions then stall well past the 30 s default
page.setDefaultTimeout(90000);
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

const shot = async (name) => {
  try {
    await page.screenshot({
      path: `scripts/shot-${name}.png`,
      animations: 'disabled',
      timeout: 60000,
    });
  } catch {
    console.warn(`shot-${name}.png: capture stalled, skipped`);
  }
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(4500); // map style + tiles + deck first frame

// fresh context = first visit: the welcome modal is up — capture, then enter
await shot('welcome');
await page.getByRole('button', { name: /entrar al archivo|enter the archive/i }).click();
await page.waitForTimeout(600);
await shot('violence');

// memoria: scrub to three eras via the day slider, then play briefly
const EPOCH = Date.UTC(1958, 0, 1);
const dayOf = (iso) => (Date.parse(iso + 'T00:00:00Z') - EPOCH) / 86400000;
const scrub = async (iso) => {
  await page.$eval(
    '.timebar input[type="range"]',
    (el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    dayOf(iso)
  );
  await page.waitForTimeout(1200);
};

await scrub('1997-08-01'); // Mapiripán weeks earlier — wound should be visible
await shot('memoria-1997');
await scrub('2003-01-01'); // post-escalation scar field
await shot('memoria-2003');
await scrub('2023-06-01'); // post-2022 elections field
await shot('memoria-2023');

// play for 3 s — wounds should animate without console errors
await scrub('1996-01-01');
await page.getByRole('button', { name: /reproducir|play/i }).click();
await page.waitForTimeout(3000);
await shot('memoria-playing');
// dispatchEvent: skip the actionability wait — the readout repaints every
// frame during playback and Playwright's stability check never settles.
// Conditional: under software WebGL a single frame can advance sim-time by
// YEARS (mday += realDt × speed), so playback may have already hit the
// window end and stopped itself, leaving the button as "Reproducir".
const pauseBtn = page.getByRole('button', { name: /pausa|pause/i });
if (await pauseBtn.count()) await pauseBtn.dispatchEvent('click');
await page.waitForTimeout(400);

// flip language, sanity-check EN strings render
await page.getByRole('button', { name: /cambiar idioma/i }).click();
await page.waitForTimeout(400);
await shot('en');

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
