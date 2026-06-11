// Blood-tendril base geometry for the Memoria tab: ONE deterministic field of
// flow-field curves shared by every event type, packed as per-segment LineLayer
// instances. Curves are seeded directly from events, each chosen with
// probability proportional to its victim count, so the AMOUNT of blood at a
// place tracks the number of victims there. Every curve belongs to the event it
// grew from and carries that event's modality index, so the legend checkboxes
// can show/hide it on the GPU — all categories filter into the same field. The
// static per-segment attributes (wound day, scar day, distance to wound, arc
// length from the wound, modality) let the GPU animate width / brightness /
// pulse from a single time uniform — zero per-frame CPU work
// (docs/stack-decision.md).
//
// Tendrils flare bright while the wound is fresh, then settle into a thin,
// dark PERMANENT scar state — mirroring the scar dots. Events with an unknown
// exact date never flare (no wound, same rule as the wound layers) but their
// scar tendrils appear once their known year closes, like the scar dots do.
//
// All of this is visual interpretation of where violence occurred; no data
// values are fabricated.
import type { ViolenceData } from './data';

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
  nCurves: 4400,
  stepKm: 4.2, // -> curves ~92 km long
  reachKm: REACH_KM,
  noiseLen1: 40,
  noiseLen2: 6,
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
    getModality: { value: Float32Array; size: 1 }; // modality index of the source event
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

/** First index `i` with `cum[i] > r` (cum is strictly increasing). */
function pickWeighted(cum: Float64Array, r: number): number {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] > r) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Build ONE shared tendril field across every event. Runs at load (and on
 * debug-panel geometry changes). `p.nCurves` is the field's total curve budget;
 * each curve is seeded from an event chosen ∝ its victims, so denser/deadlier
 * sites grow more blood. Every segment carries the source event's modality
 * index (`getModality`) so the GPU can show/hide it per the legend checkboxes —
 * all event types share the same field rather than each owning its own. */
export function buildTendrils(
  violence: ViolenceData,
  modOf: Uint8Array, // global event index -> modality index
  p: TendrilGeoParams = TENDRIL_GEO_DEFAULTS
): TendrilData {
  // --- cumulative victim weights over ALL events (seeding ∝ victims) ---
  const n = violence.meta.n;
  const cum = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += violence.victims[i]; // events with 0 victims grow no blood
    cum[i] = acc;
  }

  // --- integrate curves through the flow field, anchored at their event ---
  const rand = mulberry32(p.seed);
  const nSeg = p.nCurves * STEPS;
  const src = new Float32Array(nSeg * 2);
  const tgt = new Float32Array(nSeg * 2);
  const woundDay = new Float32Array(nSeg);
  const scarDay = new Float32Array(nSeg);
  const woundDist = new Float32Array(nSeg);
  const arcFrom = new Float32Array(nSeg);
  const victimW = new Float32Array(nSeg);
  const modality = new Float32Array(nSeg);

  const vx = new Float64Array(STEPS + 1); // km-space curve vertices
  const vy = new Float64Array(STEPS + 1);

  let seg = 0;
  for (let curves = 0; curves < p.nCurves && acc > 0; curves++) {
    // choose the source event ∝ victims, then start within reach of it (a disk
    // of radius ~reach, uniform in area) so the blood radiates from the wound
    const gi = pickWeighted(cum, rand() * acc);
    const wx = violence.pos[gi * 2] * KM_PER_DEG_LON;
    const wy = violence.pos[gi * 2 + 1] * KM_PER_DEG_LAT;
    const ang0 = rand() * 2 * Math.PI;
    const r0 = Math.sqrt(rand()) * p.reachKm * 0.85;
    vx[0] = wx + Math.cos(ang0) * r0;
    vy[0] = wy + Math.sin(ang0) * r0;
    for (let s = 0; s < STEPS; s++) {
      const a = flowAngle(vx[s], vy[s], p);
      vx[s + 1] = vx[s] + Math.cos(a) * p.stepKm;
      vy[s + 1] = vy[s] + Math.sin(a) * p.stepKm;
    }

    // the curve belongs to event gi; find its closest approach for the pulse arc
    let bestD = Infinity;
    let bestVert = 0;
    for (let v = 0; v <= STEPS; v++) {
      const dx = vx[v] - wx;
      const dy = vy[v] - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        bestVert = v;
      }
    }
    bestD = Math.sqrt(bestD);

    const day = violence.dayF32[gi];
    const sDay = violence.scarDayF32[gi];
    const vw = violence.radius[gi]; // sqrt(victims), existing convention
    const mi = modOf[gi];

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
      modality[seg] = mi;
      seg++;
    }
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
      getModality: { value: modality.subarray(0, seg), size: 1 },
    },
  };
}
