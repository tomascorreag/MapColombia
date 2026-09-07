// Responsive-layout probe: load the landing, violence and deforestation pages at
// a range of viewports (desktop -> phone, portrait and landscape, touch on the
// phone profiles) and measure the chrome instead of eyeballing it. Per page and
// viewport it reports: horizontal page overflow, panels that leave the
// viewport, pairwise overlaps between the floating panels (rail / timebar /
// detail panel / readout / footer / attribution), and any control row whose
// content overflows its box. Screenshots go to $SHOT_DIR (default scripts/).
//   node scripts/with-dev.mjs node scripts/probe-viewports.mjs [only=landing|violence|deforestation]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5199';
const SHOT_DIR = process.env.SHOT_DIR ?? 'scripts';
mkdirSync(SHOT_DIR, { recursive: true });
const only = process.argv.slice(2).find((a) => a.startsWith('only='))?.slice(5);

const VIEWPORTS = [
  { name: 'desktop', width: 1500, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'small-laptop', width: 1024, height: 640 },
  { name: 'tablet-portrait', width: 768, height: 1024, touch: true },
  { name: 'tablet-landscape', width: 1024, height: 768, touch: true },
  { name: 'phone', width: 390, height: 844, touch: true, mobile: true },
  { name: 'phone-landscape', width: 844, height: 390, touch: true, mobile: true },
  { name: 'phone-small', width: 360, height: 640, touch: true, mobile: true },
];

const PAGES = [
  { name: 'landing', url: '/' },
  { name: 'violence', url: '/?section=violence&tier=low' },
  { name: 'deforestation', url: '/?section=deforestation&tier=low' },
].filter((p) => !only || p.name === only);

// panels whose boxes must not overlap each other or leave the viewport
const PANELS = {
  landing: ['.masthead', '.violence .content', '.ashes .content', '.landing footer', '.landing .lang'],
  // the attribution is measured by its visible control, not the corner
  // container (that one carries a 10px margin box)
  map: ['.rail', '.timebar-wrap', '.detail', '.readout.ficha', 'main > footer', '.maplibregl-ctrl-bottom-right .maplibregl-ctrl'],
};
// rows whose content must fit their box (no clipped/overflowing controls)
const ROWS = ['.timebar .readout', '.head-row', '.lenswrap', '.rowshead', '.rail header', '.legend'];

const browser = await chromium.launch();
const problems = [];
const report = (vp, pg, msg) => {
  problems.push(`${pg}@${vp}: ${msg}`);
  console.log(`  !! ${msg}`);
};

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: !!vp.touch,
    isMobile: !!vp.mobile,
    deviceScaleFactor: vp.mobile ? 3 : 1,
  });
  for (const pg of PAGES) {
    const page = await ctx.newPage();
    page.setDefaultTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    console.log(`\n== ${pg.name} @ ${vp.name} ${vp.width}x${vp.height}`);
    await page.goto(`${BASE}${pg.url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(pg.name === 'landing' ? 2500 : 5000);
    const shot = async (suffix) => {
      try {
        await page.screenshot({ path: `${SHOT_DIR}/vp-${pg.name}-${vp.name}${suffix}.png`, timeout: 60000 });
      } catch {
        console.warn('  capture stalled');
      }
    };
    if (pg.name !== 'landing') {
      // first visit: welcome modal - check it fits, then enter
      const card = await page.locator('.backdrop .card').boundingBox().catch(() => null);
      if (card) {
        const fits = card.y >= 0 && card.y + card.height <= vp.height && card.x >= 0 && card.x + card.width <= vp.width;
        if (!fits) report(vp.name, pg.name, `welcome card leaves viewport ${JSON.stringify(card)}`);
        const scrolls = await page.evaluate(() => {
          const c = document.querySelector('.backdrop .card');
          return c && c.scrollHeight <= c.clientHeight + 1 ? 'no-scroll' : 'scrolls';
        });
        console.log(`  welcome: ${Math.round(card.width)}x${Math.round(card.height)} ${scrolls}`);
      }
      await shot('-welcome');
      // same context = same localStorage latch, so only the first map page shows it
      const enter = page.getByRole('button', { name: /entrar al archivo|enter the archive/i });
      if (await enter.count()) {
        await enter.click();
        await page.waitForTimeout(800);
      }
    }
    await shot('');

    // open the click panel: deforestation readout via a muni click near the
    // centre; violence detail via clicks around the centre in 2003
    if (pg.name !== 'landing') {
      const mapBox = await page.locator('.maplibregl-canvas').boundingBox();
      if (mapBox) {
        // aim at the middle of the map strip the chrome leaves free (stacked
        // layouts: between the rail and the timebar), with a real tap on touch
        const railB = (await page.locator('.rail').boundingBox())?.y + (await page.locator('.rail').boundingBox())?.height || 0;
        const tbT = (await page.locator('.timebar-wrap').boundingBox())?.y ?? mapBox.height;
        const cx = mapBox.x + mapBox.width / 2;
        const cy = vp.width <= 900 ? (railB + tbT) / 2 : mapBox.y + mapBox.height / 2;
        const press = (x, y) => (vp.touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
        // a stale hover card after a tap/click is itself a defect
        const hoverAfter = async () => (await page.locator('.tooltip').count()) > 0;
        if (pg.name === 'violence') {
          await page.$eval('.timebar input[type="range"]', (el) => {
            el.value = String((Date.UTC(2003, 0, 1) - Date.UTC(1958, 0, 1)) / 86400000);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.waitForTimeout(800);
          const offs = [[0, 0], [-20, -20], [20, 20], [-40, 0], [0, -40], [40, 0], [0, 40], [-60, -30], [30, -60]];
          for (const [dx, dy] of offs) {
            await press(cx + dx, cy + dy);
            await page.waitForTimeout(500);
            if (await page.locator('.detail').count()) break;
          }
        } else {
          await press(cx, cy);
          await page.waitForTimeout(600);
        }
        console.log(`  click panel open: ${(await page.locator('.detail, .readout.ficha').count()) > 0}`);
        if (await hoverAfter()) report(vp.name, pg.name, 'hover card still up after the click');
        await shot('-panel');
        // stacked layouts: open the collapsed legend and check it stays bounded
        // (the click panel covers the rail there, so close it first)
        const closeBtn = page.locator('.detail .close, .readout .x');
        if (await closeBtn.count()) {
          await closeBtn.first().click();
          await page.waitForTimeout(300);
        }
        const lt = page.locator('.legend-toggle');
        if (await lt.isVisible()) {
          await lt.click();
          await page.waitForTimeout(800);
          await shot('-legend');
          const rb = await page.locator('.rail').boundingBox();
          const tb = await page.locator('.timebar-wrap').boundingBox();
          if (rb && tb && rb.y + rb.height > tb.y - 2) report(vp.name, pg.name, `open legend: rail bottom ${Math.round(rb.y + rb.height)} reaches timebar top ${Math.round(tb.y)}`);
          console.log(`  legend open: rail ${Math.round(rb.height)}px, map strip ${Math.round(tb.y - rb.y - rb.height)}px`);
          await lt.click();
          await page.waitForTimeout(300);
        }
      }
    }

    // ---- measurements ----
    const sel = pg.name === 'landing' ? PANELS.landing : PANELS.map;
    const m = await page.evaluate(
      ({ sel, rows }) => {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const de = document.documentElement;
        const boxes = {};
        for (const s of sel) {
          const el = document.querySelector(s);
          if (!el) continue;
          let r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (el.classList.contains('content') || el.classList.contains('masthead')) {
            // padded block: its padding may cover the footer / the language button legitimately, so measure the type
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const c of el.children) {
              const cr = c.getBoundingClientRect();
              x0 = Math.min(x0, cr.left); y0 = Math.min(y0, cr.top); x1 = Math.max(x1, cr.right); y1 = Math.max(y1, cr.bottom);
            }
            r = { left: x0, top: y0, right: x1, bottom: y1, width: x1 - x0, height: y1 - y0 };
          }
          boxes[s] = { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom };
        }
        const overflowRows = [];
        for (const s of rows) {
          for (const el of document.querySelectorAll(s)) {
            if (el.scrollWidth > el.clientWidth + 1) overflowRows.push(`${s} scrollWidth ${el.scrollWidth} > ${el.clientWidth}`);
          }
        }
        const small = [];
        for (const el of document.querySelectorAll('button, input[type=range], a.cta, .drow, .row')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24)) small.push(`${el.className || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return {
          W,
          H,
          scrollW: de.scrollWidth,
          scrollH: de.scrollHeight,
          bodyScrollW: document.body.scrollWidth,
          boxes,
          overflowRows,
          smallTargets: small.length,
          smallSample: small.slice(0, 6),
        };
      },
      { sel, rows: ROWS }
    );
    if (m.scrollW > m.W + 1 || m.bodyScrollW > m.W + 1) report(vp.name, pg.name, `horizontal overflow scrollWidth ${m.scrollW}/${m.bodyScrollW} > ${m.W}`);
    if (m.scrollH > m.H + 1) report(vp.name, pg.name, `vertical overflow scrollHeight ${m.scrollH} > ${m.H}`);
    const names = Object.keys(m.boxes);
    for (const n of names) {
      const b = m.boxes[n];
      if (b.x < -1 || b.y < -1 || b.r > m.W + 1 || b.b > m.H + 1)
        report(vp.name, pg.name, `${n} leaves viewport x${Math.round(b.x)} y${Math.round(b.y)} r${Math.round(b.r)} b${Math.round(b.b)} (vp ${m.W}x${m.H})`);
    }
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const a = m.boxes[names[i]];
        const b = m.boxes[names[j]];
        const ox = Math.min(a.r, b.r) - Math.max(a.x, b.x);
        const oy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
        if (ox > 2 && oy > 2) report(vp.name, pg.name, `${names[i]} overlaps ${names[j]} by ${Math.round(ox)}x${Math.round(oy)}px`);
      }
    for (const o of m.overflowRows) report(vp.name, pg.name, `row overflow: ${o}`);
    console.log(`  small (<24px) hit targets: ${m.smallTargets} ${m.smallSample.join(' | ')}`);
    for (const n of names) {
      const b = m.boxes[n];
      console.log(`  ${n.padEnd(28)} x${Math.round(b.x)} y${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`);
    }
    if (errors.length) report(vp.name, pg.name, `${errors.length} console/page errors: ${errors[0].slice(0, 160)}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${problems.length} problems`);
for (const p of problems) console.log(' - ' + p);
