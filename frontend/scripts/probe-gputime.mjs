// Diagnostic: GPU time per deck frame during memoria playback, measured with
// EXT_disjoint_timer_query_webgl2 around the deck context's draw calls. rAF
// FPS saturates at the display refresh on a strong GPU and says nothing about
// headroom; GPU ms/frame does. Compare builds on the same machine — absolute
// numbers are not a target. Headed Chrome (headless WebGL is software-rendered;
// the extension may be absent on some platforms — the script says so).
//   node scripts/with-dev.mjs node scripts/probe-gputime.mjs [tier=high] [dsf=2]
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const tierArg = argv.find((a) => a.startsWith('tier='));
const dsf = Number(argv.find((a) => a.startsWith('dsf='))?.split('=')[1] ?? 1);
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: dsf });
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.text().startsWith('[perf]')) console.log(m.text());
});
const url =
  (process.env.SMOKE_URL ?? 'http://localhost:5199') +
  '/?section=violence' +
  (tierArg ? '&' + tierArg : '');
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// scrub to a date and measure GPU-inclusive frame time over N frames at rest
// (paused) and while playing
const EPOCH = Date.UTC(1958, 0, 1);
const dayOf = (iso) => (Date.parse(iso + 'T00:00:00Z') - EPOCH) / 86400000;
const scrub = (iso) =>
  page.$eval(
    '.timebar input[type="range"]',
    (el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    dayOf(iso)
  );
// Install once: wrap the deck context's draw calls in an EXT_disjoint_timer_query
// per frame (begin at the first draw, end in a rAF registered after deck's) so
// the GPU time of the whole deck frame is measured, independent of vsync.
const installed = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('canvas')].reverse();
  let gl = null;
  for (const c of canvases) {
    const g = c.getContext('webgl2');
    if (g) {
      gl = g;
      break;
    }
  }
  if (!gl) return 'no webgl2 canvas';
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return 'no timer query';
  const st = (window.__gpu = { gl, ext, q: null, pending: [], times: [], raf: 0 });
  for (const name of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced']) {
    const orig = gl[name].bind(gl);
    gl[name] = (...a) => {
      if (!st.q) {
        st.q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, st.q);
      }
      return orig(...a);
    };
  }
  const tick = () => {
    if (st.q) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      st.pending.push(st.q);
      st.q = null;
    }
    st.pending = st.pending.filter((q) => {
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) st.times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
      return false;
    });
    st.raf = requestAnimationFrame(tick);
  };
  st.raf = requestAnimationFrame(tick);
  return 'ok';
});
console.log('timer query:', installed);

// collect GPU ms per deck frame over a wall-clock window (only frames deck
// actually drew are counted — a paused scene draws nothing)
const measure = (ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const st = window.__gpu;
        st.times = [];
        setTimeout(() => {
          const t = st.times.slice().sort((a, b) => a - b);
          if (!t.length) return resolve({ frames: 0 });
          resolve({
            frames: t.length,
            median: +t[t.length >> 1].toFixed(2),
            p90: +t[Math.floor(t.length * 0.9)].toFixed(2),
            max: +t[t.length - 1].toFixed(2),
          });
        }, ms);
      }),
    ms
  );

// playback windows starting at three eras: early (sparse), the 2000s peak
// (largest fresh window), late (full scar prefix, tiny fresh window)
for (const iso of ['1965-01-01', '2001-06-01', '2020-01-01']) {
  await scrub(iso);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /reproducir|play/i }).click();
  await page.waitForTimeout(400);
  console.log(`playing from ${iso}: GPU ms/frame`, JSON.stringify(await measure(3000)));
  await page.getByRole('button', { name: /pausa|pause/i }).click();
  await page.waitForTimeout(300);
}
await scrub('2001-06-01');
await page.getByRole('button', { name: /reproducir|play/i }).click();
await page.mouse.move(750, 450);
await page.waitForTimeout(400);
console.log('playing from 2001 + hover: GPU ms/frame', JSON.stringify(await measure(3000)));
await browser.close();
