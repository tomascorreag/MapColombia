// One-shot harness: start the Vite dev server on :5199, run a command against
// it, then stop the server — nothing is left running. Use it to run the smoke
// / perf scripts without a hand-started server:
//   node scripts/with-dev.mjs node scripts/smoke.mjs
//   node scripts/with-dev.mjs node scripts/probe-fps.mjs tier=high
// Vite is spawned as a direct node child (no shell), so child.kill() ends it
// cleanly on Windows too. Exits with the command's exit code.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const viteBin = resolve(root, 'node_modules/vite/bin/vite.js');
const PORT = process.env.DEV_PORT ?? '5199';

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: node scripts/with-dev.mjs <command> [args...]');
  process.exit(2);
}

const vite = spawn(process.execPath, [viteBin, '--port', PORT, '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
let viteOut = '';
vite.stdout.on('data', (d) => {
  viteOut += d.toString();
});

const waitForServer = async () => {
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 120; i++) {
    if (vite.exitCode !== null) throw new Error(`vite exited early:\n${viteOut}`);
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite did not come up on :${PORT}\n${viteOut}`);
};

let code = 1;
try {
  await waitForServer();
  code = await new Promise((res) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && cmd !== 'node' && cmd !== process.execPath });
    child.on('exit', (c) => res(c ?? 1));
    child.on('error', (e) => {
      console.error(e);
      res(1);
    });
  });
} catch (e) {
  console.error(e);
} finally {
  vite.kill();
  await new Promise((r) => setTimeout(r, 300));
  if (vite.exitCode === null) vite.kill('SIGKILL');
}
process.exit(code);
