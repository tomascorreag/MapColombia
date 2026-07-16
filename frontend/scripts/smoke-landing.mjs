// Visual smoke test for the landing page (bare `/`).
//
// The gate is NOT console errors alone. Both ambient fields (landingEffects.ts)
// are canvas-2D: if geometry построение, masking or the rAF wiring breaks, they
// paint nothing and throw nothing — the page still looks "fine", just empty.
// smoke-deforestation.mjs samples canvas pixels for exactly this reason; the
// same trap applies here, twice. So we assert:
//   1. each flank actually paints, in its own colour family
//   2. the landing fetches NO archive data (App.svelte must keep short-circuiting)
//   3. the two ?section= doors still open
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

// INTEGRITY GATE: the landing must never pull the archives' data. It has no map
// and its effects are synthetic; a fetch here means App.svelte's section===null
// short-circuit regressed and every visitor pays multi-MB to see a front door.
const dataHits = [];
page.on('request', (r) => {
  if (/violence\.bin|violence_details\.bin|elections\.json|munis(_shapes)?\.json|memoria\.json|deforestation.*\.(json|png|pmtiles)/.test(r.url())) {
    dataHits.push(r.url());
  }
});

const shot = async (name) => {
  try {
    await page.screenshot({ path: `scripts/shot-${name}.png`, timeout: 60000 });
  } catch {
    console.warn(`shot-${name}.png: capture stalled, skipped`);
  }
};

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
// let the entrance finish and the ambient loop reach a populated frame
await page.waitForTimeout(3500);

const h1 = (await page.locator('.masthead h1').first().textContent())?.trim();
console.log('masthead h1:', h1);
console.log('halves present:', await page.locator('.split .half').count());
console.log('effect canvases present:', await page.locator('.half canvas.fx').count());
await shot('landing-rest');

// RENDER GATE. Read each canvas directly (not a composite): the scar field is
// crimson (red-dominant, dark) and the ember field runs the fire ramp (warm,
// red > blue). Both are red>blue, so a swapped/duplicated field would still
// pass a naive "is it warm" check — instead assert each canvas paints at all,
// and compare their hue signatures to each other.
const stats = await page.evaluate(() => {
  const out = [];
  for (const cv of document.querySelectorAll('canvas.fx')) {
    const tmp = document.createElement('canvas');
    tmp.width = 300;
    tmp.height = 300;
    const ctx = tmp.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, 0, 0, tmp.width, tmp.height);
    const img = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    let lit = 0;
    let rSum = 0;
    let gSum = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] > 8) {
        lit++;
        rSum += img[i];
        gSum += img[i + 1];
      }
    }
    out.push({
      lit,
      meanR: lit ? Math.round(rSum / lit) : 0,
      meanG: lit ? Math.round(gSum / lit) : 0,
    });
  }
  return out;
});
console.log('field pixel stats:', JSON.stringify(stats));
if (stats.length !== 2) bad.push(`expected 2 effect canvases, found ${stats.length}`);
stats.forEach((s, i) => {
  if (s.lit < 200) bad.push(`field ${i} appears EMPTY (only ${s.lit} lit px of 90000)`);
});
// the ember ramp carries far more green than the crimson scar field — if these
// two collapse toward each other, the fields have been crossed or one is stale
if (stats.length === 2 && stats[1].meanG <= stats[0].meanG) {
  bad.push(`fields not distinguishable: scar meanG=${stats[0].meanG} ember meanG=${stats[1].meanG}`);
}

// hover ignites: the pointed half's field must get materially brighter
const litOf = (sel) =>
  page.evaluate((s) => {
    const cv = document.querySelector(s);
    if (!cv) return -1;
    const tmp = document.createElement('canvas');
    tmp.width = 300;
    tmp.height = 300;
    const ctx = tmp.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, 0, 0, tmp.width, tmp.height);
    const img = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    let sum = 0;
    for (let i = 0; i < img.length; i += 4) sum += img[i] * (img[i + 3] / 255);
    return Math.round(sum / 1000);
  }, sel);

const restScar = await litOf('.violence canvas.fx');
await page.locator('.violence').hover();
await page.waitForTimeout(1800);
const hotScar = await litOf('.violence canvas.fx');
console.log(`scar field energy: rest=${restScar} hover=${hotScar}`);
if (!(hotScar > restScar)) bad.push(`hover did not ignite the scar field (rest=${restScar} hover=${hotScar})`);
await shot('landing-violence-hover');

await page.locator('.ashes').hover();
await page.waitForTimeout(1800);
await shot('landing-ashes-hover');

console.log('archive data requests from landing:', dataHits.length ? dataHits : 'none (correct)');
if (dataHits.length) bad.push(`landing fetched archive data: ${dataHits.join(', ')}`);

// ---- both doors still open ----
for (const [section, sel] of [
  ['violence', 'header h1'],
  ['deforestation', 'header h1'],
]) {
  await page.goto(`${BASE}/?section=${section}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const t = await page.locator(sel).first().textContent().catch(() => null);
  console.log(`?section=${section} header:`, t?.trim() ?? '(none)');
  if (!t) bad.push(`?section=${section} did not render a header`);
}

// ---- reduced motion is IGNORED (owner decision): the pref changes nothing ----
// The clamp in app.css is commented out and the JS guards are pinned false, so a
// reduce-motion client must get the SAME full-motion landing as everyone else.
// This block is the gate on that: it asserts the pref does NOT clamp the
// entrance and that the animated field still paints. If the pref is ever
// honored again, flip these assertions back (delay must clamp to 0s) alongside
// the three source sites.
const rmPage = await browser.newPage({
  viewport: { width: 1500, height: 900 },
  reducedMotion: 'reduce',
});
await rmPage.goto(`${BASE}/`);
await rmPage.waitForFunction(() => {
  const m = document.querySelector('.masthead');
  return m && getComputedStyle(m).animationName === 'rise';
});
// Wait on the entrance actually finishing, not a stopwatch: the delay+duration
// now run in full here, and a fixed timeout raced them (sampled mid-rise at
// opacity ~0.96 and read as a failure).
await rmPage.waitForFunction(() => {
  const m = document.querySelector('.masthead');
  return m && m.getAnimations().every((a) => a.playState === 'finished');
});
const rm = await rmPage.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.masthead'));
  return { delay: cs.animationDelay, opacity: Number(cs.opacity) };
});
console.log('reduced-motion masthead:', JSON.stringify(rm));
// Delay surviving is the invariant now, and it is timing-independent: a 0s delay
// here would mean the clamp came back. The entrance still has to END visible.
if (rm.delay === '0s') bad.push('reduce-motion still clamps animation-delay — the pref is meant to be ignored');
if (rm.opacity < 1) bad.push(`masthead not fully visible after the entrance (opacity ${rm.opacity})`);
const rmLit = await rmPage.evaluate(() => {
  const cv = document.querySelector('canvas.fx');
  const tmp = document.createElement('canvas');
  tmp.width = 300;
  tmp.height = 300;
  const ctx = tmp.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cv, 0, 0, tmp.width, tmp.height);
  const img = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
  let lit = 0;
  for (let i = 0; i < img.length; i += 4) if (img[i + 3] > 8) lit++;
  return lit;
});
console.log('reduced-motion frame lit px:', rmLit);
// the field must be a texture, not a blank page — the rAF loop runs here too
if (rmLit < 200) bad.push(`reduced-motion frame is EMPTY (${rmLit} lit px)`);
await rmPage.screenshot({ path: 'scripts/shot-landing-reducedmotion.png' });

console.log('failures:', bad.length ? bad : 'none');
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length || bad.length ? 1 : 0);
