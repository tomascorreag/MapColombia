// Which page this load shows, and the data it will need.
//
// Kept free of map/deck imports: App.svelte (the shell every page loads) reads
// this before deciding whether to fetch the archive chunk at all.

export type Section = 'violence' | 'deforestation';

// URL flag drives which view renders (mirrors the ?tier/?lang/?debug query-param
// pattern; no path routing, which works on GH Pages project sites where a path
// would 404). `null` (plain `/` or an unknown value) => the landing page.
export function readSection(): Section | null {
  const s = new URLSearchParams(location.search).get('section');
  return s === 'deforestation' || s === 'violence' ? s : null;
}

// Start the archive's data downloads from the shell, in parallel with the
// archive JS chunk (~550 KB gz), instead of after it has downloaded and parsed.
// The loaders in data.ts later fetch() the same URLs and pick up the preloaded
// responses. Must list exactly what Archive.svelte's load effect fetches:
// a preload nobody consumes is a wasted download plus a console warning.
// The PMTiles pyramid is left out: it is read by range requests, which a
// whole-file preload would not match (and it is 89 MB).
const ARCHIVE_DATA: Record<Section, string[]> = {
  violence: ['munis.json', 'munis_shapes.json', 'violence_meta.json', 'violence.bin'],
  deforestation: ['munis.json', 'munis_shapes.json', 'deforestation.json', 'deforestation_forest.png'],
};

export function preloadArchiveData(section: Section, base = 'data'): void {
  for (const f of ARCHIVE_DATA[section]) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'fetch';
    // fetch() defaults to mode 'cors' + credentials 'same-origin'; a preload only
    // matches it with crossorigin=anonymous (without it the request is fetched twice)
    link.crossOrigin = 'anonymous';
    link.href = `${base}/${f}`;
    document.head.appendChild(link);
  }
}
