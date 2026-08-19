// Diagnostic: V8 CPU profile (CDP Profiler) of 4 s of deforestation playback —
// top self-time functions, callers of a few hot leaves, and totals per file.
// Answers "what is the main thread doing per frame" once probe-deforestation.mjs
// says it is busy. Headed; unthrottled (throttling only scales the same profile).
//   node scripts/with-dev.mjs node scripts/probe-def-cpuprofile.mjs [tier=low] [zoom=1]
// Note: the vite dev server serves deck/luma's `development` builds (extra debug
// bookkeeping such as Buffer._setDebugData); production is somewhat leaner.
import { chromium } from 'playwright';
const argv = process.argv.slice(2);
const arg = (k, d) => argv.find((a) => a.startsWith(k + '='))?.split('=')[1] ?? d;
const tier = arg('tier', 'low');
const zoomed = arg('zoom', '0') === '1';
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
const page = await ctx.newPage();
await page.goto(`http://localhost:5199/?section=deforestation&tier=${tier}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
const pause = async () => { const b = page.getByRole('button', { name: /pausa|pause/i }); if (await b.count()) await b.click(); };
await pause();
if (zoomed) {
  await page.mouse.move(770, 560);
  for (let i = 0; i < 7; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(150); }
  await page.waitForTimeout(2500);
  await page.mouse.move(1480, 20);
}
await page.$eval('.timebar input[type="range"]', (el) => { el.value = '2004'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(500);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await page.getByRole('button', { name: /reproducir|play/i }).click();
await page.waitForTimeout(300);
await cdp.send('Profiler.start');
await page.waitForTimeout(4000);
const { profile } = await cdp.send('Profiler.stop');
await pause();
// self time per node
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i]);
  const cf = n.callFrame;
  const key = `${cf.functionName || '(anon)'} @ ${(cf.url || '').split('/').slice(-2).join('/')}:${cf.lineNumber}`;
  self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000);
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
console.log(`total sampled ms: ${total.toFixed(0)} over 4000 ms wall; tier=${tier} zoomed=${zoomed}`);
for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  console.log(v.toFixed(0).padStart(6), 'ms ', k);
}
// callers of hot leaf functions
const parentOf = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parentOf.set(c, n.id);
const leafKeys = ['setProps', 'getData', '(anon)', '(program)'];
for (const leaf of leafKeys) {
  const chains = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    if ((n.callFrame.functionName || '(anon)') !== leaf) continue;
    let id = n.id; const chain = [];
    for (let d = 0; d < 6 && id != null; d++) { const nn = byId.get(id); chain.push(nn.callFrame.functionName || '(anon)'); id = parentOf.get(id); }
    const k = chain.join(' < ');
    chains.set(k, (chains.get(k) || 0) + (dt[i] || 0) / 1000);
  }
  console.log('--- callers of', leaf);
  for (const [k, v] of [...chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(v.toFixed(0).padStart(6), 'ms ', k);
}
// also: total by file
const byFile = new Map();
for (const [k, v] of self.entries()) {
  const f = k.split(' @ ')[1].split(':')[0];
  byFile.set(f, (byFile.get(f) || 0) + v);
}
console.log('--- by file');
for (const [k, v] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(v.toFixed(0).padStart(6), 'ms ', k);
await browser.close();
