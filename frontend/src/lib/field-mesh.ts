// Delaunay triangulation of municipio centroids for the continuous political
// field. Vertex i is muni i, so the per-muni fieldValues array doubles as the
// per-vertex attribute with no re-indexing. Built once at load.
//
// San Andrés & Providencia (and anything west of the mainland) are EXCLUDED
// from the triangulation: a continuous field interpolated across 700 km of
// open Caribbean is meaningless, and the resulting sliver triangles paint a
// stripe over the ocean. The islands render as small self-coloured dots
// instead (see MapView's island layer).
import { Delaunay } from 'd3-delaunay';
import type { Munis } from './data';
import type { FieldMesh } from './FieldMeshLayer';

// west of this longitude = the island munis, excluded from the mesh
export const MAINLAND_MIN_LON = -80;

export function buildFieldMesh(munis: Munis): FieldMesh {
  const n = munis.codes.length;
  // positions cover ALL munis (vertex i == muni i); the triangulation only
  // references mainland vertices, so island slots are simply never indexed
  const positions = new Float32Array(n * 2);
  const mainland: number[] = [];
  for (let i = 0; i < n; i++) {
    positions[i * 2] = munis.lon[i];
    positions[i * 2 + 1] = munis.lat[i];
    if (munis.lon[i] >= MAINLAND_MIN_LON) mainland.push(i);
  }
  const delaunay = Delaunay.from(
    mainland,
    (i) => munis.lon[i],
    (i) => munis.lat[i]
  );
  // remap triangle indices from mainland-subset space to muni-index space
  const tri = delaunay.triangles;
  const indices = new Uint32Array(tri.length);
  for (let k = 0; k < tri.length; k++) indices[k] = mainland[tri[k]];
  return { length: n, positions, indices };
}

/** muni indices excluded from the mesh (rendered as island dots) */
export function islandMunis(munis: Munis): number[] {
  const out: number[] = [];
  for (let i = 0; i < munis.codes.length; i++) {
    if (munis.lon[i] < MAINLAND_MIN_LON) out.push(i);
  }
  return out;
}
