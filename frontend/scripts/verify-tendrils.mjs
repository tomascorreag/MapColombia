// Capture the memoria tab with the baked-in defaults + second tendril field:
// national view fresh-wound moment, and a regional zoom into Urabá/Antioquia.
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5199';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto(`${BASE}/?section=violence`, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
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

await scrub('1997-08-01');
await page.screenshot({ path: 'scripts/shot-t2-national.png' });

// zoom into Urabá/Antioquia to see both tendril fields up close
await page.mouse.move(680, 270);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(350);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: 'scripts/shot-t2-zoom.png' });

await scrub('2004-06-01');
await page.screenshot({ path: 'scripts/shot-t2-zoom-2004.png' });

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
