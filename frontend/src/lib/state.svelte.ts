// Central reactive state. Svelte 5 runes give fine-grained updates: the deck
// layer effect, timeline, and legends each track only what they read.

import type { Body } from './data';

export interface TooltipRow {
  label: string;
  value: string;
}

export interface Hover {
  x: number;
  y: number;
  accent: string;
  title: string;
  rows: TooltipRow[];
}

export const MODALITY_CODES = ['MA', 'AS', 'DF', 'SE', 'RU', 'MI', 'VS', 'AT', 'AP', 'AB', 'DB'];

function allOn(): Record<string, boolean> {
  return Object.fromEntries(MODALITY_CODES.map((c) => [c, true]));
}

class AppState {
  // 'memoria' is the unified violence view (all event types, rendered as red
  // wounds over continuous time); 'elections' is the political map;
  // 'deforestation' is the Hansen tree-cover-loss raster (gated behind
  // ?section=deforestation).
  tab = $state<'memoria' | 'elections' | 'deforestation'>('memoria');
  year = $state(2000);
  allYears = $state(false);
  playing = $state(false);
  enabled = $state<Record<string, boolean>>(allOn());
  body = $state<Body>('presidencia');
  /** selected election index per body (set to latest once data loads) */
  electionIdx = $state<Record<Body, number>>({ presidencia: 0, senado: 0, camara: 0 });
  hover = $state<Hover | null>(null);

  // Click-to-pin: `selected` holds the global indices of ALL events under the
  // last click (newest-first; a few px cover many records at national zoom);
  // empty = panel closed. Small, low-frequency state — safe to be deeply
  // reactive, unlike the $state.raw artifacts written every animation frame.
  selected = $state<number[]>([]);
  // Timeline position (mday) at the moment `selected` was pinned. A snapshot,
  // not a live read: mday keeps animating during playback while the pinned set
  // does not grow, so the panel header must assert "hasta {month}" about the
  // click moment. null = panel closed.
  selectedDay = $state<number | null>(null);

  // Which full-screen modal is open — a single enum keeps modals mutually
  // exclusive and lets the detail panel gate its Escape handler on it.
  overlay = $state<'welcome' | 'credits' | 'story' | null>(null);
  // The CNMH IdCaso whose "Read more…" annotation modal is open (null = none).
  // Read together with overlay === 'story'.
  storyId = $state<number | null>(null);
  // One-time "press play" microcopy hint, armed when the first-visit welcome
  // modal closes and dropped forever on the first timeline interaction.
  playHint = $state(false);

  // memoria view: continuous time (days since 1958-01-01), playback speed in
  // sim-days per real second, and the body driving the political field
  mday = $state((Date.UTC(1960, 0, 1) - Date.UTC(1958, 0, 1)) / 86_400_000);
  mspeed = $state(180);
  mbody = $state<Body>('camara');

  // deforestation view: continuous (float) scrub position in calendar years.
  // It drives the raster's smooth year-to-year crossfade and the gliding
  // playhead; playback advances it by fractions of a year per frame. `defYear`
  // is the integer year derived from it for the discrete panels/readouts —
  // hectare figures are annual and never interpolated, only the visuals are.
  defPos = $state(2025);
  get defYear() {
    return Math.floor(this.defPos);
  }
  defMuni = $state<number | null>(null);
  // Unified spotlight selector for the loss raster. A legend lens sets {dim, code}
  // on hover; MapView maps it to the LossRasterLayer's spotDim/spotCode uniforms,
  // which light that one code (driver / ag-kind / legality / coca) across the loss
  // up to the scrubbed year and fade the rest. dim=null ⇒ no spotlight.
  defSpot = $state<{ dim: 'driver' | 'kind' | 'legality' | 'coca' | null; code: number }>({
    dim: null,
    code: 0,
  });

  setAll(on: boolean) {
    for (const c of MODALITY_CODES) this.enabled[c] = on;
  }
}

export const app = new AppState();
