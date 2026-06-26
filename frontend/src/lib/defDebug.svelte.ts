// Hidden visual-tuning state for the deforestation recency raster. Enabled with
// `?debug` in the URL (shares the flag with the Memoria panel). Every value is a
// display knob only — no data semantics. Defaults are imported from
// FIRE_DEFAULTS / RAMP_DEFAULTS in LossRasterLayer.ts so the panel opens on the
// shipped look and production (no panel) reads the exact same numbers.

import { FIRE_DEFAULTS, RAMP_DEFAULTS, type FireKnobs } from './LossRasterLayer';

export const defDbg = $state<FireKnobs>({ ...FIRE_DEFAULTS });

// Recency colour ramp (4 stops). Mutated live by the panel's colour pickers /
// position sliders; MapView converts each {hex,pos} to a vec4 ramp uniform.
export const defRamp = $state<{ hex: string; pos: number }[]>(
  RAMP_DEFAULTS.map((s) => ({ ...s }))
);

export interface DefDbgParam {
  key: keyof FireKnobs;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const DEF_DBG_GROUPS: { title: string; params: DefDbgParam[] }[] = [
  {
    title: 'burn front',
    params: [
      { key: 'fadeIn', label: 'dissolve-in yrs', min: 0.05, max: 2, step: 0.05 },
      { key: 'cool', label: 'cool span yrs', min: 1, max: 25, step: 0.5 },
      { key: 'jitter', label: 'burn into yr', min: 0, max: 1, step: 0.05 },
      { key: 'noiseScale', label: 'burn noise freq', min: 20, max: 600, step: 10 },
    ],
  },
];

// Recency colour-ramp stop labels: cold/ember end -> hot/fresh end (matches panel rows).
export const DEF_RAMP_LABELS = ['ember (old)', 'red', 'orange', 'hot (fresh)'];
