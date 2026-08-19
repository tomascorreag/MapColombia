// Diagnostic: per-shader GPU time breakdown of the memoria scene (timer query
// around EVERY deck draw call, tagged by SHADER_NAME + whether it drew to the
// screen or an FBO (mask / picking pass)). Also samples camera navigation
// (drag pan + wheel zoom) so per-frame cost while moving is visible.
//   node scripts/with-dev.mjs node scripts/probe-gpubreakdown.mjs [tier=high] [dsf=2] [date=2000-06-01]
import { chromium } from 'playwright';
const argv = process.argv.slice(2);
const tierArg = argv.find((a) => a.startsWith('tier='));
const dsf = Number(argv.find((a) => a.startsWith('dsf='))?.split('=')[1] ?? 1);
const date = argv.find((a) => a.startsWith('date='))?.split('=')[1] ?? '2000-06-01';
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: dsf });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.text().startsWith('[perf]')) console.log(m.text()); });
await page.goto((process.env.SMOKE_URL ?? 'http://localhost:5199') + '/?section=violence' + (tierArg ? '&' + tierArg : ''), { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const EPOCH = Date.UTC(1958, 0, 1);
const dayOf = (iso) => (Date.parse(iso + 'T00:00:00Z') - EPOCH) / 86400000;
const scrub = (iso) => page.$eval('.timebar input[type="range"]', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, dayOf(iso));
const ok = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('canvas')].reverse();
  let gl = null; for (const c of canvases) { const g = c.getContext('webgl2'); if (g) { gl = g; break; } }
  if (!gl) return 'no webgl2';
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!ext) return 'no timer';
  const st = (window.__gpu = { gl, ext, pending: [], acc: {}, frames: 0, frameAcc: [], curFrame: 0, prog: null, names: new Map() });
  const nameOf = (p) => { if (!p) return '?'; if (st.names.has(p)) return st.names.get(p); let n = '?'; try { const sh = gl.getAttachedShaders(p); for (const s of sh) { const m = /SHADER_NAME\s+(\S+)/.exec(gl.getShaderSource(s) || ''); if (m) { n = m[1].replace(/-(vertex|fragment)-shader$/, ''); break; } } } catch {} st.names.set(p, n); return n; };
  const origUse = gl.useProgram.bind(gl); gl.useProgram = (p) => { st.prog = p; return origUse(p); };
  for (const name of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced']) {
    const orig = gl[name].bind(gl);
    gl[name] = (...a) => { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); const r = orig(...a); gl.endQuery(ext.TIME_ELAPSED_EXT); const fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) ? 'fbo' : 'screen'; st.pending.push({ q, key: nameOf(st.prog) + ':' + fbo, frame: st.curFrame }); return r; };
  }
  const tick = () => {
    st.curFrame++;
    st.pending = st.pending.filter((e) => { if (!gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) return true; if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { const ms = gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6; (st.acc[e.key] ||= { ms: 0, n: 0 }); st.acc[e.key].ms += ms; st.acc[e.key].n++; (st.frameAcc[e.frame] ||= 0); st.frameAcc[e.frame] += ms; } gl.deleteQuery(e.q); return false; });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return 'ok';
});
console.log('timer query:', ok);
const measure = (ms) => page.evaluate((ms) => new Promise((resolve) => { const st = window.__gpu; st.acc = {}; st.frameAcc = []; const f0 = st.curFrame; setTimeout(() => { const frames = st.frameAcc.filter((v) => v > 0).sort((a, b) => a - b); const per = Object.fromEntries(Object.entries(st.acc).map(([k, v]) => [k, +(v.ms / Math.max(1, frames.length)).toFixed(2)])); resolve({ drawnFrames: frames.length, medianFrame: frames.length ? +frames[frames.length >> 1].toFixed(2) : 0, p90Frame: frames.length ? +frames[Math.floor(frames.length * 0.9)].toFixed(2) : 0, perFrameByShader: per }); }, ms); }), ms);
await scrub(date);
await page.waitForTimeout(600);
await page.getByRole('button', { name: /reproducir|play/i }).click();
await page.waitForTimeout(400);
console.log(`playing from ${date}:`, JSON.stringify(await measure(3000), null, 1));
// same, with the cursor parked over the densest part of the map (hover
// re-pick runs every colour bucket during playback)
await page.mouse.move(680, 380);
await page.waitForTimeout(300);
console.log(`playing + hover:`, JSON.stringify(await measure(3000), null, 1));
await page.getByRole('button', { name: /pausa|pause/i }).click();
await page.mouse.move(1480, 20);
await page.waitForTimeout(300);
// navigation: drag-pan then wheel-zoom while paused
const nav = page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
const navMeasure = measure(3500);
await page.mouse.move(900, 450); await page.mouse.down();
for (let i = 0; i < 20; i++) { await page.mouse.move(900 - i * 10, 450 + i * 5); await page.waitForTimeout(40); }
await page.mouse.up();
for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120); }
console.log('navigating (pan+zoom, paused):', JSON.stringify(await navMeasure, null, 1));
await nav;
await browser.close();
