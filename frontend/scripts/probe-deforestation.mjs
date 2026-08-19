// Diagnostic: per-frame cost of the deforestation view (?section=deforestation)
// during playback, with a CPU-throttle proxy for laptop CPUs. Per 3 s window:
//   raf      — rAF interval median/p90 (what the user sees)
//   busy     — main-thread ms from the frame's first rAF callback to the first timer
//              after that frame's style/layout/paint (scripting + rendering cost)
//   long     — PerformanceObserver long tasks (count / total ms)
//   gpu      — GPU ms per drawn deck frame (EXT_disjoint_timer_query_webgl2),
//              median/p90, plus a per-SHADER_NAME breakdown (ms per frame)
// Scenarios: national playing; national playing + cursor sweeping the map (pick
// path); zoomed on the Guaviare arc playing; zoomed + legend-row hover (spotlight
// path); pan+zoom while paused (tile decode). Headed Chrome (headless = SwiftShader).
//   node scripts/with-dev.mjs node scripts/probe-deforestation.mjs [tier=low] [dsf=1] [cpu=4]
// cpu=N applies CDP Emulation.setCPUThrottlingRate (N× slower main thread). The
// GPU cannot be throttled — read the gpu numbers as relative, desktop-class.
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => argv.find((a) => a.startsWith(k + '='))?.split('=')[1] ?? d;
const tier = arg('tier', null);
const dsf = Number(arg('dsf', 1));
const cpu = Number(arg('cpu', 1));
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: dsf });
const page = await ctx.newPage();
// Wrap rAF before any page script runs: `busy` is measured from the FIRST rAF
// callback of a frame (deck's animation loop, the TimeBar scrub step, ...) to a
// 0 ms timer queued from it — which fires only after the frame's remaining
// callbacks, microtasks (Svelte effect flush → buildLayers → deck layer matching
// happens inside deck's own rAF callback), style, layout and paint.
await page.addInitScript(() => {
  const st = (window.__frame = { busy: [], open: false });
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    orig((now) => {
      if (!st.open) {
        st.open = true;
        const t0 = performance.now();
        setTimeout(() => {
          st.busy.push(performance.now() - t0);
          st.open = false;
        }, 0);
      }
      return cb(now);
    });
});
page.on('console', (m) => {
  if (m.text().startsWith('[perf]')) console.log(m.text());
});
const url =
  (process.env.SMOKE_URL ?? 'http://localhost:5199') +
  '/?section=deforestation' +
  (tier ? '&tier=' + tier : '');
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000); // tiles + forest decode + first frames
// pause the arrival autoplay so every window starts from a known state
const pause = async () => {
  const b = page.getByRole('button', { name: /pausa|pause/i });
  if (await b.count()) await b.click();
};
const play = () => page.getByRole('button', { name: /reproducir|play/i }).click();
await pause();
await page.waitForTimeout(300);

const installed = await page.evaluate(() => {
  const st = (window.__probe = {
    gl: null, ext: null, pending: [], acc: {}, frameAcc: [], curFrame: 0, prog: null, names: new Map(),
    rafT: [], lastRaf: 0, longN: 0, longMs: 0,
  });
  // --- rAF interval + main-thread busy time
  const tick = (now) => {
    if (st.lastRaf) st.rafT.push(now - st.lastRaf);
    st.lastRaf = now;
    st.curFrame++;
    flushQueries();
    requestAnimationFrame(tick);
  };
  // --- long tasks
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) { st.longN++; st.longMs += e.duration; }
    }).observe({ type: 'longtask', buffered: false });
  } catch { /* unsupported */ }
  // --- GPU timer queries per draw call, tagged by SHADER_NAME
  const canvases = [...document.querySelectorAll('canvas')].reverse();
  let gl = null;
  for (const c of canvases) { const g = c.getContext('webgl2'); if (g) { gl = g; break; } }
  let flushQueries = () => {};
  if (gl) {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (ext) {
      st.gl = gl; st.ext = ext;
      const nameOf = (p) => {
        if (!p) return '?';
        if (st.names.has(p)) return st.names.get(p);
        let n = '?';
        try {
          for (const s of gl.getAttachedShaders(p)) {
            const m = /SHADER_NAME\s+(\S+)/.exec(gl.getShaderSource(s) || '');
            if (m) { n = m[1].replace(/-(vertex|fragment)-shader$/, ''); break; }
          }
        } catch { /* ignore */ }
        st.names.set(p, n);
        return n;
      };
      const origUse = gl.useProgram.bind(gl);
      gl.useProgram = (p) => { st.prog = p; return origUse(p); };
      for (const name of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced']) {
        const orig = gl[name].bind(gl);
        gl[name] = (...a) => {
          const q = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          const r = orig(...a);
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          const fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) ? ':fbo' : '';
          st.pending.push({ q, key: nameOf(st.prog) + fbo, frame: st.curFrame });
          return r;
        };
      }
      flushQueries = () => {
        st.pending = st.pending.filter((e) => {
          if (!gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) return true;
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
            const ms = gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6;
            (st.acc[e.key] ||= { ms: 0, n: 0 });
            st.acc[e.key].ms += ms;
            st.acc[e.key].n++;
            st.frameAcc[e.frame] = (st.frameAcc[e.frame] || 0) + ms;
          }
          gl.deleteQuery(e.q);
          return false;
        });
      };
    }
  }
  requestAnimationFrame(tick);
  return st.ext ? 'ok' : gl ? 'no timer query (gpu numbers absent)' : 'no webgl2 canvas';
});
console.log(`timer query: ${installed}; tier=${tier ?? 'auto'} dsf=${dsf} cpu=${cpu}x`);

if (cpu > 1) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
}


const measure = (ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const st = window.__probe;
        st.rafT = []; window.__frame.busy = []; st.acc = {}; st.frameAcc = []; st.longN = 0; st.longMs = 0;
        setTimeout(() => {
          const sort = (a) => a.slice().sort((x, y) => x - y);
          const raf = sort(st.rafT), busy = sort(window.__frame.busy);
          const frames = sort(st.frameAcc.filter((v) => v > 0));
          const q = (arr, p) => (arr.length ? +arr[Math.min(arr.length - 1, Math.floor(arr.length * p))].toFixed(2) : 0);
          const per = Object.fromEntries(
            Object.entries(st.acc)
              .map(([k, v]) => [k, +(v.ms / Math.max(1, frames.length)).toFixed(2)])
              .sort((a, b) => b[1] - a[1])
          );
          resolve({
            raf: { n: raf.length, median: q(raf, 0.5), p90: q(raf, 0.9) },
            busy: { median: q(busy, 0.5), p90: q(busy, 0.9), max: q(busy, 1) },
            long: { n: st.longN, ms: +st.longMs.toFixed(0) },
            gpu: { drawn: frames.length, median: q(frames, 0.5), p90: q(frames, 0.9), perShader: per },
          });
        }, ms);
      }),
    ms
  );
const report = (label, r) => console.log(`\n## ${label}\n` + JSON.stringify(r, null, 1));

const scrub = (y) =>
  page.$eval('.timebar input[type="range"]', (el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, y);

// (a) national view, playing from 2004 (the loss front is busy through the 2000s)
await scrub(2004);
await page.waitForTimeout(500);
await play();
await page.waitForTimeout(400);
report('national / playing', await measure(3000));

// (b) same, with the cursor sweeping the map (hover/pick path)

const m1 = measure(3000);
for (let i = 0; i < 60; i++) {
  await page.mouse.move(600 + (i % 20) * 30, 300 + Math.floor(i / 20) * 120);
  await page.waitForTimeout(45);
}
report('national / playing + cursor sweep', await m1);

await pause();
await page.mouse.move(1480, 20);
await page.waitForTimeout(300);

// (c) zoom on the Guaviare arc, playing
await page.mouse.move(770, 560);
for (let i = 0; i < 7; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(150); }
await page.waitForTimeout(2500); // tiles
await page.mouse.move(1480, 20);
await scrub(2004);
await play();
await page.waitForTimeout(400);
report('zoomed / playing', await measure(3000));

// (d) zoomed, playing, legend row hovered (spotlight uniforms)
const row = page.locator('.rows .drow').first();
if (await row.count()) {
  await row.hover();
  await page.waitForTimeout(300);
  report('zoomed / playing + legend hover', await measure(3000));
  await page.mouse.move(1480, 20);
}
await pause();
await page.waitForTimeout(300);

// (e) pan + zoom while paused (tile decode / refinement)
const m5 = measure(4000);
await page.mouse.move(900, 450);
await page.mouse.down();
for (let i = 0; i < 20; i++) { await page.mouse.move(900 - i * 10, 450 + i * 5); await page.waitForTimeout(40); }
await page.mouse.up();
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(150); }
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(150); }
report('paused / pan + zoom', await m5);

await browser.close();
