// Data loading: binary columnar violence buffers + election/municipality JSON.
// Artifacts are produced by pipeline/build_frontend_data.py; the buffer layout
// is read from violence_meta.json (offset/dtype per column), never assumed.

export interface Munis {
  codes: number[];
  names: string[];
  depts: string[];
  lat: number[];
  lon: number[];
  meta: { source: string; attribution: string; license: string; n: number };
}

export interface ModalityMeta {
  code: string;
  name_es: string;
  rows_raw: number;
  n: number;
  start: number;
  end: number;
  yearCounts: number[];
  excluded: {
    undated: number;
    pre1958: number;
    postWindow: number;
    badCoord: number;
    noMunicipio: number;
  };
  dataset_id: string;
  dataset_name: string;
  source_url: string;
}

interface BufferLayout {
  offset: number;
  length: number;
  dtype: string;
  bytes: number;
}

export interface ViolenceMeta {
  n: number;
  epoch: string;
  yearMin: number;
  yearMax: number;
  buffers: Record<string, BufferLayout>;
  modalities: ModalityMeta[];
  respCategories: string[];
  respGroups: string[];
  unmatchedMuni: number;
  source: { name: string; corte: string; publisher: string; license_note: string };
  integrity: string;
}

export interface ViolenceData {
  meta: ViolenceMeta;
  pos: Float32Array; // [lon, lat] interleaved
  day: Int32Array; // days since 1958-01-01; -1 = exact date unknown
  id: Uint32Array; // CNMH IdCaso (source citation per point)
  year: Uint16Array;
  yearF32: Float32Array; // year as f32 for the GPU filter
  victims: Uint16Array;
  muni: Uint16Array; // index into Munis; 0xFFFF = unmatched
  cat: Uint8Array; // index into respCategories
  grp: Uint8Array; // index into respGroups
  radius: Float32Array; // sqrt(victims), precomputed for getRadius
}

export interface Election {
  year: number;
  round: number; // 0 = single round, 1/2 = vuelta
  label: string; // Spanish pipeline label — display uses electionLabel() (i18n)
  circunscripcion: string; // principal constituency used for the winner calc
  m: number[]; // muni index
  p: number[]; // winner party index
  w: number[]; // winner party votes in muni
  t: number[]; // total party-attributed votes in muni
  c?: number[]; // winner candidate index (presidencia)
  candidates?: string[];
  dropped: {
    nullMuni: number;
    unmatchedMuni: number;
    consulados: number;
    zeroVote: number;
    partylessRows: number;
    partylessVotes: number;
    specialCircVotes: number;
  };
}

export type Body = 'presidencia' | 'senado' | 'camara';

export interface ElectionsData {
  meta: { source: { name: string; doi: string; license: string }; method: string };
  parties: { name: string; color: string }[];
  bodies: Record<Body, Election[]>;
}

const DTYPES = {
  float32: Float32Array,
  int32: Int32Array,
  uint32: Uint32Array,
  uint16: Uint16Array,
  uint8: Uint8Array,
} as const;

function view(buf: ArrayBuffer, layout: BufferLayout) {
  const Ctor = DTYPES[layout.dtype as keyof typeof DTYPES];
  if (!Ctor) throw new Error(`unknown dtype ${layout.dtype}`);
  return new Ctor(buf, layout.offset, layout.length);
}

export async function loadViolence(base = 'data'): Promise<ViolenceData> {
  const [meta, bin] = await Promise.all([
    fetch(`${base}/violence_meta.json`).then((r) => {
      if (!r.ok) throw new Error(`violence_meta.json ${r.status}`);
      return r.json() as Promise<ViolenceMeta>;
    }),
    fetch(`${base}/violence.bin`).then((r) => {
      if (!r.ok) throw new Error(`violence.bin ${r.status}`);
      return r.arrayBuffer();
    }),
  ]);

  const year = view(bin, meta.buffers.year) as Uint16Array;
  const victims = view(bin, meta.buffers.victims) as Uint16Array;
  const radius = new Float32Array(meta.n);
  const yearF32 = new Float32Array(meta.n);
  for (let i = 0; i < meta.n; i++) {
    radius[i] = Math.sqrt(Math.max(victims[i], 1));
    yearF32[i] = year[i];
  }

  return {
    meta,
    pos: view(bin, meta.buffers.pos) as Float32Array,
    day: view(bin, meta.buffers.day) as Int32Array,
    id: view(bin, meta.buffers.id) as Uint32Array,
    year,
    yearF32,
    victims,
    muni: view(bin, meta.buffers.muni) as Uint16Array,
    cat: view(bin, meta.buffers.cat) as Uint8Array,
    grp: view(bin, meta.buffers.grp) as Uint8Array,
    radius,
  };
}

export async function loadJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json() as Promise<T>;
}

const EPOCH_MS = Date.UTC(1958, 0, 1);

/** day-since-1958 -> formatted date; null when exact date unknown */
export function formatDay(day: number, lang: 'es' | 'en'): string | null {
  if (day < 0) return null;
  const d = new Date(EPOCH_MS + day * 86_400_000);
  return d.toLocaleDateString(lang === 'es' ? 'es-CO' : 'en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatInt(n: number, lang: 'es' | 'en'): string {
  return n.toLocaleString(lang === 'es' ? 'es-CO' : 'en-US');
}
