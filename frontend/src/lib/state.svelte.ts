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
  tab = $state<'violence' | 'elections'>('violence');
  year = $state(2000);
  allYears = $state(false);
  playing = $state(false);
  enabled = $state<Record<string, boolean>>(allOn());
  body = $state<Body>('presidencia');
  /** selected election index per body (set to latest once data loads) */
  electionIdx = $state<Record<Body, number>>({ presidencia: 0, senado: 0, camara: 0 });
  hover = $state<Hover | null>(null);

  setAll(on: boolean) {
    for (const c of MODALITY_CODES) this.enabled[c] = on;
  }
}

export const app = new AppState();
