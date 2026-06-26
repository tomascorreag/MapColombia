// Visual smoke test for the deforestation view (?section=deforestation).
// Gate = console/page error count (catches a failed custom-shader compile in
// LossRasterLayer). Also checks the artifacts load 200 and the violence view
// still opens at the bare URL. Screenshots are for human inspection.
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';
const errors = [];
const bad = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.setDefaultTimeout(90000);
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));
page.on('response', (r) => {
  const u = r.url();
  // .pmtiles is range-requested (206) — only flag hard failures (4xx/5xx)
  if (/deforestation\.json|deforestation_lossyear\.pmtiles/.test(u) && r.status() >= 400) {
    bad.push(`${r.status()} ${u}`);
  }
});

const shot = async (name) => {
  try {
    await page.screenshot({ path: `scripts/shot-${name}.png`, animations: 'disabled', timeout: 60000 });
  } catch {
    console.warn(`shot-${name}.png: capture stalled, skipped`);
  }
};

// ---- deforestation view ----
await page.goto(`${BASE}/?section=deforestation`, { waitUntil: 'networkidle' });
await page.waitForTimeout(7000); // style + PMTiles range fetches + deck first frame + tile decode

// header should read the deforestation title, not the violence one
const h1 = (await page.locator('header h1').first().textContent())?.trim();
const yearReadout = (await page.locator('.timebar .year').first().textContent())?.trim();
console.log('header h1:', h1);
console.log('year readout:', yearReadout);
await shot('defor-2024');

// RENDER GATE: the loss raster must actually paint pixels. A failed tile draw (or the
// old 2nd-texture binding bug) leaves the map empty with NO console error — console-error
// gating misses it. Count LOSS-SPECIFIC pixels: warm tones (red noticeably > green) come
// only from the loss layer — the jungle-green canopy backdrop is always green-dominant
// (g > r), so this is immune to the recency/grey colouring AND to a forest-only false pass.
// Sample the MAP area only (exclude the dark left panel) at a fine grid.
const litCount = await page.evaluate(() => {
  const tmp = document.createElement('canvas');
  tmp.width = 1400;
  tmp.height = 880;
  const ctx = tmp.getContext('2d', { willReadFrequently: true });
  for (const cv of document.querySelectorAll('canvas')) {
    try {
      ctx.drawImage(cv, 0, 0, tmp.width, tmp.height);
    } catch {
      /* cross-canvas draw may throw; skip */
    }
  }
  const img = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
  let lit = 0;
  for (let y = 0; y < tmp.height; y += 8) {
    for (let x = 380; x < tmp.width; x += 8) {
      const i = (y * tmp.width + x) * 4;
      if (img[i] > 45 && img[i] - img[i + 1] > 10) lit++; // warm loss: red > green
    }
  }
  return lit;
});
console.log('loss raster warm pixels (map area, sampled):', litCount);
if (litCount < 40) bad.push(`loss raster appears EMPTY (only ${litCount} warm pixels)`);

// scrub the year slider to an early year — cumulative loss should shrink
const setYear = async (y) => {
  await page.$eval(
    '.timebar input[type="range"]',
    (el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    y
  );
  await page.waitForTimeout(900);
};
await setYear(2005);
await shot('defor-2005');
await setYear(2024);

// click over the Amazon arc (San Jose del Guaviare area) to open the readout
await page.mouse.click(770, 560);
await page.waitForTimeout(700);
const readoutTitle = await page.locator('.readout h3').first().textContent().catch(() => null);
console.log('muni readout title:', readoutTitle ?? '(none — click missed a muni)');
await shot('defor-readout');

// Agriculture lens is the default — hover its top row (pasto/cattle) to exercise
// the codes-texture spotlight path (spotDim=2/4), then switch to the WRI drivers lens.
const agriRow = page.locator('.rows .drow').first();
if (await agriRow.count()) {
  await agriRow.hover();
  await page.waitForTimeout(700);
  await shot('defor-agri-hover');
  console.log('agri rows present:', await page.locator('.rows .drow').count());
} else {
  console.log('agri rows present: 0 (panel missing!)');
}
// flip to the legality lens and hover (spotDim=3, codes green channel)
const legalityTab = page.getByRole('tab', { name: /legalidad|legality/i });
if (await legalityTab.count()) {
  await legalityTab.click();
  await page.waitForTimeout(400);
  await page.locator('.rows .drow').first().hover();
  await page.waitForTimeout(500);
  await shot('defor-legality-hover');
  console.log('legality rows present:', await page.locator('.rows .drow').count());
}
// flip to the drivers lens and hover there too (spotDim=1)
const driversTab = page.getByRole('tab', { name: /motores|drivers/i });
if (await driversTab.count()) {
  await driversTab.click();
  await page.waitForTimeout(400);
  await page.locator('.rows .drow').first().hover();
  await page.waitForTimeout(500);
  await shot('defor-driver-hover');
  console.log('driver rows present:', await page.locator('.rows .drow').count());
}

// play a couple of year ticks
await page.getByRole('button', { name: /reproducir|play/i }).click();
await page.waitForTimeout(2200);
await shot('defor-playing');

// ---- violence view still works at the bare URL ----
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const welcome = await page
  .getByRole('button', { name: /entrar al archivo|enter the archive/i })
  .count();
console.log('violence welcome modal present:', welcome > 0);
await shot('violence-still-ok');

console.log('bad artifact responses:', bad.length ? bad : 'none');
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length || bad.length ? 1 : 0);
