// Blood-tendril base geometry for the Memoria tab: ONE deterministic field of
// flow-field curves shared by every event type, packed as a single GPU
// triangle-strip vertex buffer consumed by TendrilLayer. Curves are seeded
// directly from events, each chosen with probability proportional to its
// victim count, so the AMOUNT of blood at a place tracks the number of victims
// there. Every curve belongs to the event it grew from and carries that
// event's modality index, so the legend checkboxes can show/hide it on the GPU
// — all categories filter into the same field. The static per-vertex
// attributes (wound day, scar day, distance to wound, arc length from the
// wound, modality) let the GPU animate width / brightness / pulse from a
// single time uniform — zero per-frame CPU work (docs/stack-decision.md).
//
// Tendrils flare bright while the wound is fresh, then settle into a thin,
// dark PERMANENT scar state — mirroring the scar dots. Events with an unknown
// exact date never flare (no wound, same rule as the wound layers) but their
// scar tendrils appear once their known year closes, like the scar dots do.
//
// Layout (perf, see TendrilLayer.ts): each curve is a strip of 2*(STEPS+1)
// vertices (left/right side of every curve point) plus two degenerate join
// vertices, so a field is ONE non-instanced draw instead of STEPS instanced
// quads per curve (half the vertex invocations, a quarter of the projections).
// Curves are emitted SORTED by the first day they can be visible (appearDay),
// so each pass draws only a contiguous vertex range — scar pass a prefix,
// fresh pass a window — instead of the whole field.
//
// All of this is visual interpretation of where violence occurred; no data
// values are fabricated.
// noise primitives live in noise.ts — shared verbatim with the landing page's
// ambient scar field so both integrate through the same flow field
import { mulberry32, flowAngle, type FlowParams } from './noise';

// Tunable look constants (visual iteration knobs). The debug panel
// (debug.svelte.ts, `?debug`) can override the geometry subset at runtime.
const STEPS = 22; // segments per curve
export const REACH_KM = 55; // base wound influence radius (victim-scaled in shader)

/** vertices per curve in the packed strip: 2 per point + 2 degenerate joins */
export const VERTS_PER_CURVE = 2 * (STEPS + 1) + 2;
/** bytes per packed vertex (layout below) */
export const VERTEX_BYTES = 24;
/** unorm16 scale for woundDist / arcFromWound (km) — 512 km / 65535 ≈ 7.8 m */
export const DIST_MAX_KM = 512;
/** uint16 day sentinel for "no exact date": the fresh-wound envelope never fires */
export const NEVER_U16 = 65535;
/** miter length factor range packed into one unorm8: factor = 1 + MITER_RANGE * v */
export const MITER_RANGE = 1;

// Packed vertex (24 B, interleaved; one luma Buffer per field):
//   0  float32x2  lon, lat
//   8  unorm16x2  woundDist, arcFromWound  (km / DIST_MAX_KM)
//  12  uint16x2   woundDay, scarDay        (days since 1958; NEVER_U16 = never)
//  16  uint16     victims                  (shader: sqrt → victim weight)
//  18  snorm8x2   miter normal (unit, Mercator-space bisector perpendicular)
//  20  unorm8     miter length factor - 1  (clamped to [0, MITER_RANGE])
//  21  uint8      modality index
//  22  uint8      side (0 → -1, 1 → +1)
//  23  pad

export interface TendrilGeoParams extends FlowParams {
  nCurves: number;
  stepKm: number; // segment length in km
  reachKm: number;
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

/** The event columns the builder reads — a structural subset of ViolenceData,
 * kept minimal so the Worker (tendrils.worker.ts) can receive just these. */
export interface TendrilSource {
  n: number;
  pos: Float32Array; // [lon, lat] interleaved
  victims: Uint16Array;
  dayF32: Float32Array; // exact day, -1 = unknown
  scarDayF32: Float32Array; // exact day, else year-close
  modOf: Uint8Array; // global event index -> modality index
}

export interface TendrilField {
  /** curves emitted (≤ p.nCurves) */
  nCurves: number;
  /** total strip vertices = nCurves * VERTS_PER_CURVE */
  vertexCount: number;
  /** packed vertices, VERTEX_BYTES each — upload as-is */
  bytes: ArrayBuffer;
  /** per curve, ascending: first day the curve can be visible in either pass
   * (= its event's scar day; equals the wound day for dated events). Binary
   * searched per frame by TendrilLayer to bound the drawn vertex range. */
  appearDay: Float32Array;
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

/** First index in [lo, hi) with `a[i] >= v` over an ascending array. */
export function lowerBound(a: ArrayLike<number>, v: number, lo = 0, hi = a.length): number {
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index in [lo, hi) with `a[i] > v` over an ascending array. */
export function upperBound(a: ArrayLike<number>, v: number, lo = 0, hi = a.length): number {
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Build ONE shared tendril field across every event. Runs at load (and on
 * debug-panel geometry changes). `p.nCurves` is the field's total curve budget;
 * each curve is seeded from an event chosen ∝ its victims, so denser/deadlier
 * sites grow more blood. Every vertex carries the source event's modality
 * index so the GPU can show/hide it per the legend checkboxes — all event
 * types share the same field rather than each owning its own.
 *
 * Deterministic: the PRNG is consumed in the same per-curve order as the
 * original instanced builder (pick, angle, radius), so the field is the same
 * set of curves; only the emission order (sorted by appearDay) differs, and
 * both passes composite order-independently (uniform colour per pass). */
export function buildTendrils(
  violence: TendrilSource,
  p: TendrilGeoParams = TENDRIL_GEO_DEFAULTS
): TendrilField {
  const { modOf } = violence;
  // --- cumulative victim weights over ALL events (seeding ∝ victims) ---
  const n = violence.n;
  const cum = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += violence.victims[i]; // events with 0 victims grow no blood
    cum[i] = acc;
  }

  // --- pass 1: seed every curve (event ∝ victims, start within reach) ---
  const rand = mulberry32(p.seed);
  const nCurves = acc > 0 ? p.nCurves : 0;
  const seedGi = new Uint32Array(nCurves);
  const seedAng = new Float64Array(nCurves);
  const seedR = new Float64Array(nCurves);
  const key = new Float32Array(nCurves);
  for (let c = 0; c < nCurves; c++) {
    const gi = pickWeighted(cum, rand() * acc);
    seedGi[c] = gi;
    seedAng[c] = rand() * 2 * Math.PI;
    seedR[c] = Math.sqrt(rand()) * p.reachKm * 0.85;
    // scarDayF32 = exact day when dated, else year-close: the first day the
    // curve shows in either pass
    key[c] = violence.scarDayF32[gi];
  }

  // --- pass 2: emission order = ascending appearDay (stable) ---
  const order = new Uint32Array(nCurves);
  for (let c = 0; c < nCurves; c++) order[c] = c;
  order.sort((a, b) => key[a] - key[b] || a - b);

  // --- pass 3: integrate in sorted order, emit packed strip vertices ---
  const vertexCount = nCurves * VERTS_PER_CURVE;
  const bytes = new ArrayBuffer(vertexCount * VERTEX_BYTES);
  const f32 = new Float32Array(bytes);
  const u16 = new Uint16Array(bytes);
  const u8 = new Uint8Array(bytes);
  const i8 = new Int8Array(bytes);
  const F = VERTEX_BYTES / 4; // f32 stride
  const H = VERTEX_BYTES / 2; // u16 stride
  const appearDay = new Float32Array(nCurves);

  const vx = new Float64Array(STEPS + 1); // km-space curve vertices
  const vy = new Float64Array(STEPS + 1);
  const ang = new Float64Array(STEPS); // segment headings (flow angle at v[s])
  const tmx = new Float64Array(STEPS); // Mercator-space unit tangents
  const tmy = new Float64Array(STEPS);
  const distScale = 65535 / DIST_MAX_KM;

  let vi = 0; // vertex write index
  // per-curve constants, set before the curve's vertices are written
  let wDay = 0;
  let sDay = 0;
  let victims = 0;
  let mi = 0;
  const writeVertex = (
    lon: number,
    lat: number,
    dist: number,
    arc: number,
    nx: number,
    ny: number,
    miter: number,
    side: number
  ) => {
    const fo = vi * F;
    f32[fo] = lon;
    f32[fo + 1] = lat;
    const ho = vi * H;
    u16[ho + 4] = Math.min(65535, Math.round(dist * distScale));
    u16[ho + 5] = Math.min(65535, Math.round(arc * distScale));
    u16[ho + 6] = wDay;
    u16[ho + 7] = sDay;
    u16[ho + 8] = victims;
    const bo = vi * VERTEX_BYTES;
    i8[bo + 18] = Math.round(nx * 127);
    i8[bo + 19] = Math.round(ny * 127);
    u8[bo + 20] = Math.round(Math.min(1, Math.max(0, (miter - 1) / MITER_RANGE)) * 255);
    u8[bo + 21] = mi;
    u8[bo + 22] = side;
    u8[bo + 23] = 0;
    vi++;
  };

  for (let k = 0; k < nCurves; k++) {
    const c = order[k];
    const gi = seedGi[c];
    const wx = violence.pos[gi * 2] * KM_PER_DEG_LON;
    const wy = violence.pos[gi * 2 + 1] * KM_PER_DEG_LAT;
    vx[0] = wx + Math.cos(seedAng[c]) * seedR[c];
    vy[0] = wy + Math.sin(seedAng[c]) * seedR[c];
    for (let s = 0; s < STEPS; s++) {
      const a = flowAngle(vx[s], vy[s], p);
      ang[s] = a;
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

    // segment tangents in Mercator space: km → degrees → (dlon, dlat/cos lat),
    // so the perpendicular is screen-perpendicular on an unrotated map
    for (let s = 0; s < STEPS; s++) {
      const latRad = ((vy[s] + vy[s + 1]) / 2 / KM_PER_DEG_LAT) * (Math.PI / 180);
      let tx = Math.cos(ang[s]) / KM_PER_DEG_LON;
      let ty = Math.sin(ang[s]) / KM_PER_DEG_LAT / Math.cos(latRad);
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      tmx[s] = tx;
      tmy[s] = ty;
    }

    const day = violence.dayF32[gi];
    wDay = day >= 0 ? Math.min(NEVER_U16 - 1, Math.round(day)) : NEVER_U16; // unknown date: never flares
    sDay = Math.min(NEVER_U16 - 1, Math.round(violence.scarDayF32[gi])); // ...but scars in once its year closes
    victims = Math.min(65535, violence.victims[gi]);
    mi = modOf[gi];
    appearDay[k] = key[c];

    for (let v = 0; v <= STEPS; v++) {
      const lon = vx[v] / KM_PER_DEG_LON;
      const lat = vy[v] / KM_PER_DEG_LAT;
      const dx = vx[v] - wx;
      const dy = vy[v] - wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // pulse path: wound -> closest-approach vertex -> along the curve
      const arc = bestD + Math.abs(v - bestVert) * p.stepKm;
      // bisector of incoming/outgoing tangents; the miter factor keeps the
      // ribbon at full width through turns (clamped at 2 for hairpins)
      const sIn = v === 0 ? 0 : v - 1;
      const sOut = v === STEPS ? STEPS - 1 : v;
      let bx = tmx[sIn] + tmx[sOut];
      let by = tmy[sIn] + tmy[sOut];
      let blen = Math.hypot(bx, by);
      if (blen < 1e-6) {
        bx = tmx[sOut];
        by = tmy[sOut];
        blen = 1;
      }
      bx /= blen;
      by /= blen;
      const cosHalf = Math.max(0.5, bx * tmx[sOut] + by * tmy[sOut]);
      const miter = 1 / cosHalf;
      const nx = -by;
      const ny = bx;
      // degenerate join: an exact copy of the curve's first vertex leads the
      // strip and an exact copy of its last vertex trails it, so every
      // triangle spanning two curves has two identical vertices (zero area).
      // Copies are bit-identical incl. side — parity-derived sides would flip
      // them and draw a sliver from one curve's end to the next one's start.
      if (v === 0) writeVertex(lon, lat, dist, arc, nx, ny, miter, 0);
      writeVertex(lon, lat, dist, arc, nx, ny, miter, 0);
      writeVertex(lon, lat, dist, arc, nx, ny, miter, 1);
      if (v === STEPS) writeVertex(lon, lat, dist, arc, nx, ny, miter, 1);
    }
  }

  return { nCurves, vertexCount: vi, bytes, appearDay };
}
