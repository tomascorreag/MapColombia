// Copy pipeline outputs into the static dir served by Vite.
// Canonical artifacts live in data/processed/frontend (built by
// pipeline/build_frontend_data.py); public/data is a disposable copy.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../data/processed/frontend');
const dest = resolve(here, '../public/data');

if (!existsSync(src)) {
  console.error(`missing ${src} — run: python pipeline/build_frontend_data.py`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`synced ${src} -> ${dest}`);
