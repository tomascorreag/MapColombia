/// <reference types="svelte" />
/// <reference types="vite/client" />

// Without this augmentation VITE_TILES_BASE resolves only through vite/client's
// `[key: string]: any` index signature — i.e. unchecked. Declare it explicitly.
interface ImportMetaEnv {
  /**
   * Absolute origin serving deforestation_lossyear.pmtiles (e.g. an R2 bucket),
   * for when Pages' intermittent range-request failures (protomaps/PMTiles#584)
   * become a problem. Must send CORS headers. Unset = serve from the app origin
   * alongside the other data artifacts.
   */
  readonly VITE_TILES_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
