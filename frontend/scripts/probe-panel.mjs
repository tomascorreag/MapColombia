// One-off verification probe for the narrative detail panel: enter the
// archive, scrub late so scars cover the country, click a grid of points
// until the panel opens, and dump its text in ES and EN. Not part of CI.
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5199';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.setDefaultTimeout(90000);
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(4500);
await page.getByRole('button', { name: /entrar al archivo|enter the archive/i }).click();
await page.waitForTimeout(800);

const EPOCH = Date.UTC(1958, 0, 1);
const dayOf = (iso) => (Date.parse(iso + 'T00:00:00Z') - EPOCH) / 86400000;
await page.$eval(
  '.timebar input[type="range"]',
  (el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  dayOf('2010-06-01')
);
await page.waitForTimeout(2500);

// click a grid over the Andean region until the detail panel appears
const points = [];
for (let x = 550; x <= 950; x += 80) for (let y = 250; y <= 650; y += 80) points.push([x, y]);
let opened = false;
for (const [x, y] of points) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(700);
  if (await page.locator('.detail').count()) {
    opened = true;
    console.log(`panel opened at click (${x}, ${y})`);
    break;
  }
}
if (!opened) {
  console.log('NO PANEL OPENED');
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(2000); // let violence_details.bin land and re-gender

const dump = async (tag) => {
  const txt = await page.locator('.detail').innerText();
  console.log(`\n===== ${tag} =====\n${txt}`);
};
await dump('ES');
await page.getByRole('button', { name: /cambiar idioma/i }).click();
await page.waitForTimeout(600);
await dump('EN');

await page.screenshot({ path: 'scripts/shot-panel.png', timeout: 60000 }).catch(() => {});
console.log('\nconsole errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(0);
