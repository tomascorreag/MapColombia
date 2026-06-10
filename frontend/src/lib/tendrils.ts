// Blood-tendril base geometry for the Memoria tab: a deterministic field of
// flow-field curves covering the country, packed as per-segment LineLayer
// instances. Each curve is assigned to its nearest massacre; the static
// per-segment attributes (wound day, scar day, distance to wound, arc length
// from the wound's closest approach) let the GPU animate width / brightness /
// pulse from a single time uniform — zero per-frame CPU work
// (docs/stack-decision.md).
//
// Tendrils flare bright while the wound is fresh, then settle into a thin,
// dark PERMANENT scar state — mirroring the scar dots. Massacres with an
// unknown exact date never flare (no wound, same rule as the wound layers)
// but their scar tendrils appear once their known year closes, like the
// scar dots do.
//
// All of this is visual interpretation of where massacres occurred; no data
// values are fabricated.
import type { ViolenceData, ModalityMeta } from './data';

// Tunable look constants (visual iteration knobs). The debug panel
// (debug.svelte.ts, `?debug`) can override the geometry subset at runtime.
const STEPS = 22; // segments per curve
export const REACH_KM = 55; // base wound influence radius (victim-scaled in shader)

export interface TendrilGeoParams {
  seed: number; // distinct per field: decorrelates noise AND curve seeding
  nCurves: number;
  stepKm: number; // segment length in km
  reachKm: number;
  noiseLen1: number; // km wavelength, broad meander
  noiseLen2: number; // km wavelength, fine wiggle
  noiseAmp1: number; // turns contributed by the broad octave
  noiseAmp2: number; // turns contributed by the fine octave
}

export const TENDRIL_GEO_DEFAULTS: TendrilGeoParams = {
  seed: 0x1958,
  nCurves: 4000,
  stepKm: 3.4, // -> curves ~75 km long
  reachKm: REACH_KM,
  noiseLen1: 30,
  noiseLen2: 3,
  noiseAmp1: 3.0,
  noiseAmp2: 0.4,
};

const KM_PER_DEG_LAT = 111.32;
// equirectangular x-scale at Colombia's mid latitude (~4.5 N); <2.5% error at
// the latitude extremes, irrelevant for a purely visual effect
const KM_PER_DEG_LON = 110.9;

// sentinel for "no exact date": the fresh-wound envelope never fires
const NEVER = 1e9;

export interface TendrilData {
  length: number;
  attributes: {
    getSourcePosition: { value: Float32Array; size: 2 };
    getTargetPosition: { value: Float32Array; size: 2 };
    getWoundDay: { value: Float32Array; size: 1 };
    getScarDay: { value: Float32Array; size: 1 };
    getWoundDist: { value: Float32Array; size: 1 };
    getArcFromWound: { value: Float32Array; size: 1 };
    getVictimW: { value: Float32Array; size: 1 };
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** integer-lattice hash -> [0, 1); deterministic value-noise basis */
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x85ebca6b) ^ Math.imul(iy, 0xc2b2ae35) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** bilinear value noise over the integer lattice, smoothstep-eased */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const v00 = hash2(ix, iy, seed);
  const v10 = hash2(ix + 1, iy, seed);
  const v01 = hash2(ix, iy + 1, seed);
  const v11 = hash2(ix + 1, iy + 1, seed);
  return v00 + (v10 - v00) * fx + (v01 - v00) * fy + (v11 + v00 - v10 - v01) * fx * fy;
}

/** flow direction (radians) at a km-space point; two octaves for organic curl */
function flowAngle(xKm: number, yKm: number, p: TendrilGeoParams): number {
  const broad = valueNoise(xKm / p.noiseLen1, yKm / p.noiseLen1, p.seed);
  const fine = valueNoise(xKm / p.noiseLen2, yKm / p.noiseLen2, p.seed);
  return (broad * p.noiseAmp1 + fine * p.noiseAmp2) * 2 * Math.PI;
}

/** Build the static tendril segment instances. Runs at load (and on debug-panel
 * geometry changes). */
export function buildTendrils(
  violence: ViolenceData,
  maMeta: ModalityMeta,
  p: TendrilGeoParams = TENDRIL_GEO_DEFAULTS
): TendrilData {
  // --- all massacre sites in km space + spatial hash grid (cell = REACH_KM) ---
  const mx = new Float64Array(maMeta.n);
  const my = new Float64Array(maMeta.n);
  for (let i = 0; i < maMeta.n; i++) {
    const gi = maMeta.start + i;
    mx[i] = violence.pos[gi * 2] * KM_PER_DEG_LON;
    my[i] = violence.pos[gi * 2 + 1] * KM_PER_DEG_LAT;
  }
  const cell = p.reachKm;
  const grid = new Map<number, number[]>(); // cell key -> massacre indices
  const key = (cx: number, cy: number) => cx * 100_000 + cy;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let d = 0; d < maMeta.n; d++) {
    const cx = Math.floor(mx[d] / cell);
    const cy = Math.floor(my[d] / cell);
    const k = key(cx, cy);
    let bucket = grid.get(k);
    if (!bucket) grid.set(k, (bucket = []));
    bucket.push(d);
    if (mx[d] < minX) minX = mx[d];
    if (my[d] < minY) minY = my[d];
    if (mx[d] > maxX) maxX = mx[d];
    if (my[d] > maxY) maxY = my[d];
  }

  /** nearest massacre within ~2 cells; returns [maIdx, distKm] */
  function nearest(xKm: number, yKm: number): [number, number] {
    const cx = Math.floor(xKm / cell);
    const cy = Math.floor(yKm / cell);
    let best = -1;
    let bestD2 = Infinity;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const bucket = grid.get(key(cx + ox, cy + oy));
        if (!bucket) continue;
        for (const d of bucket) {
          const dx = mx[d] - xKm;
          const dy = my[d] - yKm;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = d;
          }
        }
      }
    }
    return [best, Math.sqrt(bestD2)];
  }

  // --- integrate curves through the flow field ---
  const rand = mulberry32(p.seed);
  const nSeg = p.nCurves * STEPS;
  const src = new Float32Array(nSeg * 2);
  const tgt = new Float32Array(nSeg * 2);
  const woundDay = new Float32Array(nSeg);
  const scarDay = new Float32Array(nSeg);
  const woundDist = new Float32Array(nSeg);
  const arcFrom = new Float32Array(nSeg);
  const victimW = new Float32Array(nSeg);

  const vx = new Float64Array(STEPS + 1); // km-space curve vertices
  const vy = new Float64Array(STEPS + 1);

  let seg = 0;
  let curves = 0;
  let guard = p.nCurves * 60; // rejection-sampling bound
  while (curves < p.nCurves && guard-- > 0) {
    const sx = minX + rand() * (maxX - minX);
    const sy = minY + rand() * (maxY - minY);
    // a curve farther than REACH from every massacre can never light up
    if (nearest(sx, sy)[0] < 0) continue;

    vx[0] = sx;
    vy[0] = sy;
    for (let s = 0; s < STEPS; s++) {
      const a = flowAngle(vx[s], vy[s], p);
      vx[s + 1] = vx[s] + Math.cos(a) * p.stepKm;
      vy[s + 1] = vy[s] + Math.sin(a) * p.stepKm;
    }

    // assign the wound: massacre nearest to any curve vertex
    let bestD = Infinity;
    let bestIdx = -1;
    let bestVert = 0;
    for (let v = 0; v <= STEPS; v++) {
      const [d, dist] = nearest(vx[v], vy[v]);
      if (d >= 0 && dist < bestD) {
        bestD = dist;
        bestIdx = d;
        bestVert = v;
      }
    }
    if (bestIdx < 0 || bestD > p.reachKm) continue; // wandered out of reach

    const gi = maMeta.start + bestIdx;
    const day = violence.maDayF32[bestIdx];
    const sDay = violence.maScarDayF32[bestIdx];
    const vw = violence.radius[gi]; // sqrt(victims), existing convention
    const wx = mx[bestIdx];
    const wy = my[bestIdx];

    for (let s = 0; s < STEPS; s++) {
      const o = seg * 2;
      src[o] = vx[s] / KM_PER_DEG_LON;
      src[o + 1] = vy[s] / KM_PER_DEG_LAT;
      tgt[o] = vx[s + 1] / KM_PER_DEG_LON;
      tgt[o + 1] = vy[s + 1] / KM_PER_DEG_LAT;
      const mxKm = (vx[s] + vx[s + 1]) / 2;
      const myKm = (vy[s] + vy[s + 1]) / 2;
      const dx = mxKm - wx;
      const dy = myKm - wy;
      woundDay[seg] = day >= 0 ? day : NEVER; // unknown date: never flares
      scarDay[seg] = sDay; // ...but scars in once its year closes
      woundDist[seg] = Math.sqrt(dx * dx + dy * dy);
      // pulse path: wound -> closest-approach vertex -> along the curve
      arcFrom[seg] = bestD + Math.abs(s + 0.5 - bestVert) * p.stepKm;
      victimW[seg] = vw;
      seg++;
    }
    curves++;
  }

  return {
    length: seg,
    attributes: {
      getSourcePosition: { value: src.subarray(0, seg * 2), size: 2 },
      getTargetPosition: { value: tgt.subarray(0, seg * 2), size: 2 },
      getWoundDay: { value: woundDay.subarray(0, seg), size: 1 },
      getScarDay: { value: scarDay.subarray(0, seg), size: 1 },
      getWoundDist: { value: woundDist.subarray(0, seg), size: 1 },
      getArcFromWound: { value: arcFrom.subarray(0, seg), size: 1 },
      getVictimW: { value: victimW.subarray(0, seg), size: 1 },
    },
  };
}
