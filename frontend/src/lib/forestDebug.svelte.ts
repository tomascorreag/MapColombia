// Hidden visual-tuning state for the jungle-green forest backdrop (ForestLayer).
// Shares the ?debug flag with the fire panel. Every value is a display knob only —
// no data semantics. Defaults import from FOREST_DEFAULTS / FOREST_COLORS so the
// panel opens on the shipped look and production (no panel) reads the same numbers.

import { FOREST_DEFAULTS, FOREST_COLORS, type ForestKnobs } from './ForestLayer';

export const forestDbg = $state<ForestKnobs>({ ...FOREST_DEFAULTS });

// Two-stop green (hex), mutated live by the panel's colour pickers; MapView
// converts each to a vec4 colour uniform.
export const forestColors = $state<{ lowCol: string; highCol: string }>({
  ...FOREST_COLORS,
});

export interface ForestDbgParam {
  key: keyof ForestKnobs;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const FOREST_DBG_GROUPS: { title: string; params: ForestDbgParam[] }[] = [
  {
    title: 'canopy → green',
    params: [
      { key: 'canopyPow', label: 'canopy curve', min: 0.2, max: 4, step: 0.1 },
      { key: 'bright', label: 'brightness', min: 0.2, max: 2, step: 0.05 },
      { key: 'alpha', label: 'backdrop opacity', min: 0, max: 1, step: 0.02 },
      { key: 'canopyAlpha', label: 'sparse fade', min: 0, max: 1, step: 0.02 },
    ],
  },
  {
    title: 'foliage mottling',
    params: [
      { key: 'noiseAmt', label: 'mottle amount', min: 0, max: 1, step: 0.02 },
      { key: 'noiseScale', label: 'mottle freq (fine)', min: 20, max: 800, step: 10 },
      { key: 'noiseScale2', label: 'mottle freq (coarse)', min: 5, max: 300, step: 5 },
      { key: 'sway', label: 'timeline drift', min: 0, max: 0.2, step: 0.005 },
    ],
  },
];

// Colour pickers (no position sliders): the two ends of the canopy green ramp.
export const FOREST_COLOR_KEYS: { key: 'lowCol' | 'highCol'; label: string }[] = [
  { key: 'lowCol', label: 'sparse (0% canopy)' },
  { key: 'highCol', label: 'dense (100% canopy)' },
];
