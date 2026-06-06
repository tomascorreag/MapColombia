// Visual smoke test: load the dev server, capture console errors, screenshot
// all three tabs (plus memoria scrubbed to key eras and mid-playback).
// Not a unit test — a build-time sanity check.
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5199';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(4500); // map style + tiles + deck first frame
await page.screenshot({ path: 'scripts/shot-violence.png' });

await page.getByRole('button', { name: /^(elecciones|elections)$/i }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'scripts/shot-elections.png' });

// memoria: scrub to three eras via the day slider, then play briefly
await page.getByRole('button', { name: /memoria|memory/i }).click();
await page.waitForTimeout(2500);

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
await page.screenshot({ path: 'scripts/shot-memoria-1997.png' });
await scrub('2003-01-01'); // post-escalation scar field
await page.screenshot({ path: 'scripts/shot-memoria-2003.png' });
await scrub('2023-06-01'); // post-2022 elections field
await page.screenshot({ path: 'scripts/shot-memoria-2023.png' });

// play for 3 s — wounds should animate without console errors
await scrub('1996-01-01');
await page.getByRole('button', { name: /reproducir|play/i }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: 'scripts/shot-memoria-playing.png' });
// dispatchEvent: skip the actionability wait — the readout repaints every
// frame during playback and Playwright's stability check never settles
await page.getByRole('button', { name: /pausa|pause/i }).dispatchEvent('click');
await page.waitForTimeout(400);

// flip language, sanity-check EN strings render
await page.getByRole('button', { name: /cambiar idioma/i }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'scripts/shot-en.png' });

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
