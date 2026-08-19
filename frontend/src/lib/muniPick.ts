// CPU point-in-municipio lookup for the deforestation view's hover/click.
//
// Why not deck picking: deck renders the pickable layers to an FBO and reads
// pixels back SYNCHRONOUSLY on every pointer move, which drains the GPU queue
// — the stall memoria already removed for its dot layers (see MapView's
// gatherEventsAt). The muni polygons are ~1.1k features, so the same query on
// the CPU is a bbox-grid prefilter plus an even-odd ray cast over a handful of
// rings: well under a millisecond, no GPU sync, and the invisible pick fill the
// GeoJsonLayer used to blend over the whole country every frame goes away.
//
// Built once per `MuniShapes` (a few ms). Coordinates are lng/lat degrees; the
// caller unprojects the cursor with the maplibre map.
import type { MuniShapes } from './data';

type Ring = number[][]; // [[lng, lat], ...]

export interface MuniPick {
  /** feature index → index into Munis (properties.i), or null when unmatched */
  muniOf: (number | null)[];
  rings: Ring[][]; // per feature: outer + hole rings of every polygon, flattened
  bbox: Float64Array; // per feature: [lonMin, latMin, lonMax, latMax]
  cell: number;
  lon0: number;
  lat0: number;
  nx: number;
  ny: number;
  start: Uint32Array; // CSR grid: cells → feature indices
  idx: Uint32Array;
}

export function buildMuniPick(shapes: MuniShapes, cell = 0.25): MuniPick {
  const feats = shapes.features;
  const n = feats.length;
  const muniOf: (number | null)[] = new Array(n);
  const rings: Ring[][] = new Array(n);
  const bbox = new Float64Array(n * 4);
  let lon0 = Infinity;
  let lat0 = Infinity;
  let lon1 = -Infinity;
  let lat1 = -Infinity;
  for (let f = 0; f < n; f++) {
    const ft = feats[f];
    muniOf[f] = ft.properties.i;
    const g = ft.geometry;
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Ring[][];
    const rs: Ring[] = [];
    let a = Infinity;
    let b = Infinity;
    let c = -Infinity;
    let d = -Infinity;
    for (const poly of polys) {
      for (const ring of poly) {
        rs.push(ring);
        for (const [x, y] of ring) {
          if (x < a) a = x;
          if (x > c) c = x;
          if (y < b) b = y;
          if (y > d) d = y;
        }
      }
    }
    rings[f] = rs;
    bbox[f * 4] = a;
    bbox[f * 4 + 1] = b;
    bbox[f * 4 + 2] = c;
    bbox[f * 4 + 3] = d;
    if (a < lon0) lon0 = a;
    if (b < lat0) lat0 = b;
    if (c > lon1) lon1 = c;
    if (d > lat1) lat1 = d;
  }
  const nx = Math.max(1, Math.ceil((lon1 - lon0) / cell) + 1);
  const ny = Math.max(1, Math.ceil((lat1 - lat0) / cell) + 1);
  // two-pass CSR: count features per cell (a feature lands in every cell its
  // bbox touches), prefix-sum, then fill
  const count = new Uint32Array(nx * ny);
  const cellRange = (f: number) => {
    const cx0 = Math.floor((bbox[f * 4] - lon0) / cell);
    const cy0 = Math.floor((bbox[f * 4 + 1] - lat0) / cell);
    const cx1 = Math.floor((bbox[f * 4 + 2] - lon0) / cell);
    const cy1 = Math.floor((bbox[f * 4 + 3] - lat0) / cell);
    return [cx0, cy0, cx1, cy1];
  };
  for (let f = 0; f < n; f++) {
    const [cx0, cy0, cx1, cy1] = cellRange(f);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) count[cy * nx + cx]++;
  }
  const start = new Uint32Array(nx * ny + 1);
  for (let i = 0; i < nx * ny; i++) start[i + 1] = start[i] + count[i];
  const idx = new Uint32Array(start[nx * ny]);
  const fill = new Uint32Array(nx * ny);
  for (let f = 0; f < n; f++) {
    const [cx0, cy0, cx1, cy1] = cellRange(f);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cy * nx + cx;
        idx[start[c] + fill[c]++] = f;
      }
    }
  }
  return { muniOf, rings, bbox, cell, lon0, lat0, nx, ny, start, idx };
}

// even-odd rule across all rings of the feature: holes flip the parity back
function inFeature(rings: Ring[], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Munis index of the municipio containing (lng, lat), or null. */
export function pickMuni(p: MuniPick, lng: number, lat: number): number | null {
  const cx = Math.floor((lng - p.lon0) / p.cell);
  const cy = Math.floor((lat - p.lat0) / p.cell);
  if (cx < 0 || cy < 0 || cx >= p.nx || cy >= p.ny) return null;
  const c = cy * p.nx + cx;
  for (let k = p.start[c]; k < p.start[c + 1]; k++) {
    const f = p.idx[k];
    const b = f * 4;
    if (lng < p.bbox[b] || lng > p.bbox[b + 2] || lat < p.bbox[b + 1] || lat > p.bbox[b + 3]) continue;
    if (inFeature(p.rings[f], lng, lat)) return p.muniOf[f];
  }
  return null;
}
