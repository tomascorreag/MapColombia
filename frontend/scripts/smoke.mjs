// Visual smoke test: load the dev server, capture console errors, screenshot
// both tabs. Not a unit test — a build-time sanity check for the MVP.
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

await page.getByRole('button', { name: /elecciones|elections/i }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'scripts/shot-elections.png' });

// flip language, sanity-check EN strings render
await page.getByRole('button', { name: /cambiar idioma/i }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'scripts/shot-en.png' });

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
