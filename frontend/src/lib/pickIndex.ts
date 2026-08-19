// Spatial index for CPU picking of the memoria wound/scar sprites (MapView's
// gatherEventsAt). A uniform lon/lat grid in CSR form: `start[c]..start[c+1]`
// slices `idx` for cell c. Built once at load (~341k events, a few ms).
//
// Why two structures: a pick must consider every sprite whose screen circle
// overlaps the cursor. Sprite radius grows with sqrt(victims), so the search
// box would have to be padded for the LARGEST sprite — at national zoom that is
// a ~350 km square holding ~60k events. Splitting by victim weight keeps it
// cheap: ordinary events (radius weight < BIG_RV) are queried from the grid
// with a box padded for THEIR largest possible sprite (a few px), and the
// short list of heavy events (`big`) is scanned in full with the large pad.
// Both paths apply the exact per-event test; the split only bounds the scan.

/** sqrt(victims) threshold separating the grid path from the full-scan list;
 * events at/above it are few (hundreds) and scanned every pick */
export const BIG_RV = 4; // victims >= 16

export interface PickIndex {
  cell: number; // cell size in degrees
  lon0: number;
  lat0: number;
  nx: number;
  ny: number;
  start: Uint32Array; // length nx*ny + 1
  idx: Uint32Array; // event indices, grouped by cell (only rv < BIG_RV)
  big: Uint32Array; // event indices with rv >= BIG_RV
}

export function buildPickIndex(pos: Float32Array, radius: Float32Array, n: number, cell = 0.2): PickIndex {
  let lonMin = Infinity;
  let lonMax = -Infinity;
  let latMin = Infinity;
  let latMax = -Infinity;
  let nBig = 0;
  for (let i = 0; i < n; i++) {
    const lon = pos[i * 2];
    const lat = pos[i * 2 + 1];
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
    if (radius[i] >= BIG_RV) nBig++;
  }
  if (!(lonMin <= lonMax)) {
    return { cell, lon0: 0, lat0: 0, nx: 1, ny: 1, start: new Uint32Array(2), idx: new Uint32Array(0), big: new Uint32Array(0) };
  }
  const nx = Math.floor((lonMax - lonMin) / cell) + 1;
  const ny = Math.floor((latMax - latMin) / cell) + 1;
  const ncell = nx * ny;
  const counts = new Uint32Array(ncell + 1);
  const cellOf = (i: number) =>
    Math.floor((pos[i * 2 + 1] - latMin) / cell) * nx + Math.floor((pos[i * 2] - lonMin) / cell);
  for (let i = 0; i < n; i++) if (radius[i] < BIG_RV) counts[cellOf(i) + 1]++;
  for (let c = 0; c < ncell; c++) counts[c + 1] += counts[c];
  const start = counts; // prefix sums = cell starts
  const fill = start.slice();
  const idx = new Uint32Array(start[ncell]);
  const big = new Uint32Array(nBig);
  let b = 0;
  for (let i = 0; i < n; i++) {
    if (radius[i] >= BIG_RV) big[b++] = i;
    else idx[fill[cellOf(i)]++] = i;
  }
  return { cell, lon0: lonMin, lat0: latMin, nx, ny, start, idx, big };
}

/** Call `fn(eventIndex)` for every grid-path event in cells overlapping the
 * lon/lat box. The caller applies the exact test. */
export function forEachInBox(
  ix: PickIndex,
  lonMin: number,
  lonMax: number,
  latMin: number,
  latMax: number,
  fn: (i: number) => void
): void {
  const cx0 = Math.max(0, Math.floor((lonMin - ix.lon0) / ix.cell));
  const cx1 = Math.min(ix.nx - 1, Math.floor((lonMax - ix.lon0) / ix.cell));
  const cy0 = Math.max(0, Math.floor((latMin - ix.lat0) / ix.cell));
  const cy1 = Math.min(ix.ny - 1, Math.floor((latMax - ix.lat0) / ix.cell));
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const c = cy * ix.nx + cx;
      const e = ix.start[c + 1];
      for (let k = ix.start[c]; k < e; k++) fn(ix.idx[k]);
    }
  }
}
