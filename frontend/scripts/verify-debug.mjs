// One-off verification for the debug panel, year-progress readout, and
// multi-massacre tooltip. Run with the dev server on :5199.
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5199';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto(BASE + '/?debug', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.getByRole('button', { name: /memoria|memory/i }).click();
await page.waitForTimeout(2500);

const EPOCH = Date.UTC(1958, 0, 1);
const dayOf = (iso) => (Date.parse(iso + 'T00:00:00Z') - EPOCH) / 86400000;
await page.$eval(
  '.timebar input[type="range"]',
  (el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  dayOf('2003-06-01')
);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'scripts/shot-debug-panel.png' });

// drag a couple of debug sliders: live shader knob + a rebuild knob
const setSlider = async (label, value) => {
  await page.$$eval(
    '.dbg .row',
    (rows, { label, value }) => {
      const row = rows.find((r) => r.querySelector('.lbl')?.textContent === label);
      if (!row) throw new Error(`no slider: ${label}`);
      const input = row.querySelector('input');
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { label, value }
  );
};
await setSlider('width boost', 14);
await setSlider('glow max px', 120);
await setSlider('curves', 4000); // triggers a tendril field rebuild
await page.waitForTimeout(2000);
await page.screenshot({ path: 'scripts/shot-debug-tuned.png' });

// multi-massacre tooltip: sweep the dense Antioquia/Urabá cluster until a
// tooltip with a multi-count title appears
let multi = null;
outer: for (let x = 600; x <= 800; x += 12) {
  for (let y = 200; y <= 330; y += 12) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(60);
    const title = await page.evaluate(
      () => document.querySelector('.tooltip .title, [class*=tooltip] h3, [class*=tooltip] [class*=title]')?.textContent ?? null
    );
    if (title && /^\d+\s/.test(title.trim())) {
      multi = { x, y, title: title.trim() };
      await page.screenshot({ path: 'scripts/shot-multi-tooltip.png' });
      break outer;
    }
  }
}
console.log('multi-massacre tooltip:', multi ?? 'NOT FOUND');

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
