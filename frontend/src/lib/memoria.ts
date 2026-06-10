// Memoria view: time math, election blending, and the diverging colour ramp.
//
// The political field at time t is a weighted blend of past elections of the
// selected body. Per election with date d <= t (age in days):
//   w = ramp01(age / RAMP_DAYS) * 0.5^(age / HALF_LIFE_DAYS) * coverage
// The 1-year ramp is the visible "lerp" as a new election arrives; the
// half-life (~8.2 years, about two electoral cycles) is the memory of the
// field. Constants are display choices, documented in the legend method note.

import type { Body } from './data';

export const EPOCH_MS = Date.UTC(1958, 0, 1);
export const DAY_MS = 86_400_000;
export const MAX_DAY = (Date.UTC(2026, 11, 31) - EPOCH_MS) / DAY_MS;

export const RAMP_DAYS = 365;
export const HALF_LIFE_DAYS = 3000;
export const MIN_COVERAGE = 0.5; // below this a municipio renders as low-confidence
export const WOUND_FADE_DAYS = 1050; // a wound takes ~3 years to close into a scar
export const COLOR_BUCKET_DAYS = 15; // choropleth colour update granularity (sim time)

export interface MemoriaElection {
  year: number;
  round: number;
  date: string | null;
  m: number[]; // muni index
  s: number[]; // round(100 * weighted LR score), in [-100,100]; 127 = no scored votes
  cov: number[]; // round(100 * scored / party-attributed votes)
  unscored: { party: string; share: number }[];
  fn_consensus?: boolean;
}

export interface MemoriaData {
  meta: {
    method: string;
    scale: Record<string, string>;
    encoding: string;
    parties_scored: { party: string; score: number; basis: string; url: string }[];
    constituent_rules: { pattern: string; score: number }[];
    fn_note: string;
  };
  bodies: Record<Body, MemoriaElection[]>;
}

export function dayOfISO(iso: string): number {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7);
  const d = +iso.slice(8, 10);
  return (Date.UTC(y, m - 1, d) - EPOCH_MS) / DAY_MS;
}

export function formatMonthYear(day: number, lang: 'es' | 'en'): string {
  const d = new Date(EPOCH_MS + day * DAY_MS);
  const s = d.toLocaleDateString(lang === 'es' ? 'es-CO' : 'en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
  // "agosto de 1997" -> "Agosto de 1997" (CSS capitalize would also hit "de")
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** year + fraction of that year elapsed at `day` (timeline readout) */
export function yearProgress(day: number): { year: number; frac: number } {
  const d = new Date(EPOCH_MS + day * DAY_MS);
  const year = d.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return { year, frac: (d.getTime() - start) / (end - start) };
}

export interface BlendResult {
  score: Float32Array; // per muni, [-1, 1]; NaN = no data yet
  cov: Float32Array; // weighted mean coverage, [0, 1]
  // per-muni contributors are recomputed on demand for the tooltip
}

/** Blend all elections of `body` with date <= t into a per-muni score field. */
export function blendField(
  elections: MemoriaElection[],
  t: number,
  nMunis: number
): BlendResult {
  const num = new Float32Array(nMunis);
  const den = new Float32Array(nMunis);
  // coverage is reported on the plain time-weight basis (w0), NOT the
  // coverage-multiplied score weight — Σ(w0·cov²)/Σ(w0·cov) would bias the
  // confidence value upward (Cauchy–Schwarz) and under-dim low-coverage munis
  const covNum = new Float32Array(nMunis);
  const covDen = new Float32Array(nMunis);
  for (const e of elections) {
    if (!e.date) continue;
    const age = t - dayOfISO(e.date);
    if (age < 0) continue;
    const w0 = Math.min(1, age / RAMP_DAYS) * Math.pow(0.5, age / HALF_LIFE_DAYS);
    if (w0 < 1e-4) continue;
    for (let i = 0; i < e.m.length; i++) {
      if (e.s[i] === 127) continue; // no scored votes in this municipio
      const c = e.cov[i] / 100;
      const w = w0 * c;
      if (w <= 0) continue;
      const mi = e.m[i];
      num[mi] += w * (e.s[i] / 100);
      den[mi] += w;
      covNum[mi] += w0 * c;
      covDen[mi] += w0;
    }
  }
  const score = new Float32Array(nMunis);
  const cov = new Float32Array(nMunis);
  for (let i = 0; i < nMunis; i++) {
    if (den[i] > 0) {
      score[i] = num[i] / den[i];
      cov[i] = covNum[i] / covDen[i];
    } else {
      score[i] = NaN;
    }
  }
  return { score, cov };
}

/** Contributing elections for one muni at time t (tooltip detail). */
export function contributors(
  elections: MemoriaElection[],
  t: number,
  muni: number
): { year: number; round: number; weight: number }[] {
  const out: { year: number; round: number; w: number }[] = [];
  for (const e of elections) {
    if (!e.date) continue;
    const age = t - dayOfISO(e.date);
    if (age < 0) continue;
    const w0 = Math.min(1, age / RAMP_DAYS) * Math.pow(0.5, age / HALF_LIFE_DAYS);
    if (w0 < 1e-4) continue;
    const i = e.m.indexOf(muni);
    if (i < 0 || e.s[i] === 127) continue;
    const w = w0 * (e.cov[i] / 100);
    if (w > 0) out.push({ year: e.year, round: e.round, w });
  }
  const total = out.reduce((a, b) => a + b.w, 0);
  return out
    .sort((a, b) => b.w - a.w)
    .slice(0, 3)
    .map((c) => ({ year: c.year, round: c.round, weight: c.w / total }));
}

// ---------------------------------------------------------------- colour ramp
// Diverging yellow (izquierda) <-> blue (derecha); the centre is TRANSPARENT —
// a centre vote reads as absence of tilt, not a third colour. Alpha scales
// with |score| (see fieldMeshValues / the FieldMeshLayer fragment shader).
// Crimson stays reserved for wounds.

const STOPS: [number, [number, number, number]][] = [
  [-1.0, [233, 196, 69]], // yellow (left)
  [-0.12, [233, 196, 69]],
  [0.12, [64, 118, 214]],
  [1.0, [64, 118, 214]], // blue (right)
];

export function scoreColor(s: number): [number, number, number] {
  if (s <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    if (s <= STOPS[i][0]) {
      const [s0, c0] = STOPS[i - 1];
      const [s1, c1] = STOPS[i];
      const f = (s - s0) / (s1 - s0);
      return [
        Math.round(c0[0] + f * (c1[0] - c0[0])),
        Math.round(c0[1] + f * (c1[1] - c0[1])),
        Math.round(c0[2] + f * (c1[2] - c0[2])),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/**
 * Per-vertex [score, alphaFactor] pairs for the field mesh. The score is the
 * value the GPU interpolates; alphaFactor is 0 for no-data munis (the field
 * fades out around them) and dimmed below MIN_COVERAGE. The fragment shader
 * turns |score| into opacity, so a centre vote renders transparent.
 */
export function fieldMeshValues(blend: BlendResult, nMunis: number): Float32Array {
  const out = new Float32Array(nMunis * 2);
  for (let i = 0; i < nMunis; i++) {
    const s = blend.score[i];
    const o = i * 2;
    if (Number.isNaN(s)) {
      // score 0 + factor 0: neighbours interpolate towards transparency
      out[o] = 0;
      out[o + 1] = 0;
    } else {
      out[o] = s;
      out[o + 1] = blend.cov[i] < MIN_COVERAGE ? 0.45 : 1;
    }
  }
  return out;
}

/** css gradient string for the legend ramp (alpha mirrors the shader) */
export function rampCSS(): string {
  const steps: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const s = -1 + (i / 10) * 2;
    const [r, g, b] = scoreColor(s);
    const a = Math.pow(Math.abs(s), 0.65) * 0.82;
    steps.push(`rgba(${r},${g},${b},${a.toFixed(2)}) ${i * 10}%`);
  }
  return `linear-gradient(90deg, ${steps.join(', ')})`;
}

/** localized position label for a score */
export function scoreLabel(s: number, lang: 'es' | 'en'): string {
  const es = ['izquierda', 'centro-izquierda', 'centro', 'centro-derecha', 'derecha'];
  const en = ['left', 'centre-left', 'centre', 'centre-right', 'right'];
  const labels = lang === 'es' ? es : en;
  if (s < -0.6) return labels[0];
  if (s < -0.2) return labels[1];
  if (s <= 0.2) return labels[2];
  if (s <= 0.6) return labels[3];
  return labels[4];
}
