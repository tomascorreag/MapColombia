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
  tab = $state<'violence' | 'elections' | 'memoria'>('violence');
  year = $state(2000);
  allYears = $state(false);
  playing = $state(false);
  enabled = $state<Record<string, boolean>>(allOn());
  body = $state<Body>('presidencia');
  /** selected election index per body (set to latest once data loads) */
  electionIdx = $state<Record<Body, number>>({ presidencia: 0, senado: 0, camara: 0 });
  hover = $state<Hover | null>(null);

  // memoria view: continuous time (days since 1958-01-01), playback speed in
  // sim-days per real second, and the body driving the political field
  mday = $state((Date.UTC(1990, 0, 1) - Date.UTC(1958, 0, 1)) / 86_400_000);
  mspeed = $state(180);
  mbody = $state<Body>('camara');

  setAll(on: boolean) {
    for (const c of MODALITY_CODES) this.enabled[c] = on;
  }
}

export const app = new AppState();
