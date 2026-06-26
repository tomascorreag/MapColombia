// Device-performance tiers for the map renderer. The memoria scene is sized
// for a discrete GPU (~6M tendril line instances + large additive sprites at
// full devicePixelRatio); on integrated/software GPUs that is seconds per
// frame. A tier picked at startup (GPU renderer string + core/memory
// heuristics) caps the expensive knobs, and a runtime FPS governor demotes
// the tier once if playback still can't hold frame rate — demotions persist
// to localStorage so the next visit starts right. `?tier=low|mid|high`
// forces a tier and disables the governor (testing / user escape hatch).
//
// The deforestation view follows the same tier: dprCap (shared overlay), the
// loss-tile VRAM/decode budget (tileCache/tileRequests), and forest-backdrop
// noise detail all scale down on lower tiers, and the governor now also samples
// deforestation playback so a struggling device demotes there too.
//
// Display-only: tiers change visual density and resolution, never data.

export type Tier = 'low' | 'mid' | 'high';

export interface TierParams {
  /** curve-pool caps for the two shared tendril fields (dbg values are mins'd) */
  curves1: number;
  curves2: number;
  /** stroke-width multiplier compensating sparser fields on lower tiers */
  widthScale: number;
  /** rendering resolution cap (deck useDevicePixels / maplibre pixelRatio) */
  dprCap: number;
  /** wound glow halo layer (additive, the worst overdraw + 341k instances of
   * vertex work); off on 'low' — the wound core still marks every event */
  glow: boolean;
  /** additive glow sprite cap in px — overdraw grows with radius² */
  glowMaxPx: number;
  /** pickMultipleObjects depth for hover gather / click pin */
  hoverDepth: number;
  clickDepth: number;
  /** re-pick the tooltip under a stationary cursor every N colour buckets
   * during playback; 0 = skip (tooltip still refreshes on pointer move) */
  repickBuckets: number;
  /** panel backdrop blur (resamples the animating canvas every frame) */
  blur: boolean;
  /** deforestation loss-raster tile cache size (tiles). Each 256² RGBA tile is
   * ~256 KB of VRAM, so this bounds GPU memory: 400→~100 MB, 128→~32 MB. */
  tileCache: number;
  /** concurrent loss-tile fetch+decode budget (createImageBitmap is main-thread-ish;
   * fewer parallel decodes = less scrub jank on weak CPUs) */
  tileRequests: number;
}

export const PERF: Record<Tier, TierParams> = {
  high: {
    curves1: 80000,
    curves2: 62000,
    widthScale: 1,
    dprCap: 2,
    glow: true,
    glowMaxPx: 100,
    hoverDepth: 12,
    clickDepth: 48,
    repickBuckets: 1,
    blur: true,
    tileCache: 400,
    tileRequests: 10,
  },
  mid: {
    curves1: 30000,
    curves2: 22000,
    widthScale: 1.3,
    dprCap: 1.5,
    glow: true,
    glowMaxPx: 72,
    hoverDepth: 8,
    clickDepth: 32,
    repickBuckets: 2,
    blur: true,
    tileCache: 256,
    tileRequests: 8,
  },
  low: {
    curves1: 10000,
    curves2: 7000,
    widthScale: 1.8,
    dprCap: 1,
    glow: false,
    glowMaxPx: 48,
    hoverDepth: 4,
    clickDepth: 24,
    repickBuckets: 0,
    blur: false,
    tileCache: 128,
    tileRequests: 6,
  },
};

const RANK: Record<Tier, number> = { low: 0, mid: 1, high: 2 };
const TIER_KEY = 'mdv:tier:v1';

function demoted(t: Tier): Tier {
  return t === 'high' ? 'mid' : 'low';
}

function gpuRenderer(): string {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return 'none';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(r);
  } catch {
    return 'unknown';
  }
}

function heuristicTier(): Tier {
  const r = gpuRenderer().toLowerCase();
  if (r === 'none' || /swiftshader|llvmpipe|softpipe|software|microsoft basic/.test(r)) {
    return 'low';
  }
  let tier: Tier = 'mid';
  // discrete / strong integrated GPUs; "iris xe" and Apple silicon included
  if (/nvidia|geforce|rtx|gtx|quadro|radeon|apple (m\d|gpu)|iris xe|\barc\b/.test(r)) {
    tier = 'high';
  }
  // weak-CPU / low-memory machines: one step down regardless of GPU class
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  if (cores <= 4 || mem <= 4) tier = demoted(tier);
  return tier;
}

function initialTier(): { tier: Tier; forced: boolean } {
  try {
    const q = new URLSearchParams(location.search).get('tier');
    if (q === 'low' || q === 'mid' || q === 'high') return { tier: q, forced: true };
  } catch {
    /* no location (SSR/tests) — fall through */
  }
  let tier = heuristicTier();
  try {
    const saved = localStorage.getItem(TIER_KEY) as Tier | null;
    if (saved && saved in RANK && RANK[saved] < RANK[tier]) tier = saved;
  } catch {
    /* private mode — heuristic only */
  }
  return { tier, forced: false };
}

const init = initialTier();
export const perf = $state<{ tier: Tier; forced: boolean }>(init);
console.info(`[perf] tier: ${init.tier}${init.forced ? ' (forced)' : ''}`);

function demote() {
  const next = demoted(perf.tier);
  console.info(`[perf] sustained low fps — demoting tier ${perf.tier} -> ${next}`);
  perf.tier = next;
  try {
    localStorage.setItem(TIER_KEY, next);
  } catch {
    /* private mode — demotion lasts this session only */
  }
}

// ---------------------------------------------------------------- governor
// rAF-delta sampler active during memoria/deforestation playback. Demotes ONE
// tier when the median frame time over a verdict window stays above DEMOTE_MS,
// then re-arms (after a warm-up that absorbs the tendril-field rebuild hitch)
// in case a second demotion is needed. Never promotes: flapping between tiers
// would rebuild the tendril fields repeatedly.
//
// A verdict closes on whichever comes first: WINDOW frames, OR MAX_VERDICT_MS
// of wall-clock with at least MIN_FRAMES sampled. The time cap matters for the
// weakest hardware — at ~5 fps a frame-only window of 90 takes ~18 s to reach
// the FIRST demotion and ~40 s to bottom out at 'low', so the device that most
// needs help waits longest. With the cap a slow device demotes in ~2.5 s; fast
// devices still fill the 90-frame window (more samples = more robust against a
// transient GC/tab-switch spike tipping a capable machine into a demotion).
const DEMOTE_MS = 40; // median frame slower than this (<25 fps) = demote
const WINDOW = 90; // frames per verdict (~1.5 s at 60 fps)
const MAX_VERDICT_MS = 2500; // wall-clock cap so slow devices demote promptly
const MIN_FRAMES = 24; // floor for a stable median on the time-capped path
const WARMUP_MS = 3000;

export function startFpsGovernor(): () => void {
  if (perf.forced || perf.tier === 'low') return () => {};
  let raf = 0;
  let frames: number[] = [];
  let last = performance.now();
  let armedAt = last + WARMUP_MS;
  let windowStart = armedAt; // wall-clock start of the current verdict window

  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    if (now > armedAt) {
      if (frames.length === 0) windowStart = now;
      frames.push(dt);
      const ready =
        frames.length >= WINDOW ||
        (now - windowStart >= MAX_VERDICT_MS && frames.length >= MIN_FRAMES);
      if (ready) {
        const median = frames.sort((a, b) => a - b)[frames.length >> 1];
        frames = [];
        windowStart = now;
        if (median > DEMOTE_MS) {
          demote();
          if (perf.tier === 'low') return; // floor reached — stop sampling
          armedAt = now + WARMUP_MS; // absorb the rebuild hitch
        }
      }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
