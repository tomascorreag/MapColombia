// Hidden visual-tuning state for the Memoria tab. Enabled with `?debug` in
// the URL; every value here is a display knob only — no data semantics.
// Defaults mirror the shipped constants in tendrils.ts / TendrilExtension.ts /
// MapView.svelte so the panel opens showing the current look.

export const DBG_DEFAULTS = {
  // tendril geometry, primary field (CPU rebuild on slider release)
  nCurves: 4000,
  stepKm: 3.4,
  reachKm: 55,
  noiseLen1: 30, // km wavelength, broad meander
  noiseLen2: 3, // km wavelength, fine wiggle
  noiseAmp1: 3.0, // turns contributed by the broad octave
  noiseAmp2: 0.4, // turns contributed by the fine octave
  // tendril geometry, secondary detail field (different seed; wispier)
  t2Curves: 2500,
  t2StepKm: 1.6,
  t2NoiseLen1: 12,
  t2NoiseLen2: 2,
  t2NoiseAmp1: 3.0,
  t2NoiseAmp2: 0.6,
  t2BaseWidth: 0.3,
  // tendril shader (live uniforms, shared by both fields)
  baseWidth: 0.5,
  widthBoost: 7.5,
  widthFalloff: 2.7,
  scarWidth: 1.0,
  scarAlpha: 0.25,
  freshAlpha: 0.5,
  pulseSpeed: 0.6, // km per sim-day
  pulseWidth: 15, // km
  pulseStrength: 0.95,
  // wound / scar markers
  fadeDays: 1050,
  glowScale: 5000,
  glowMaxPx: 100,
  glowAlpha: 40,
  coreScale: 1500,
  coreMaxPx: 30,
  coreAlpha: 230,
  scarScale: 900,
  scarDotAlpha: 125,
};

export type DbgKey = keyof typeof DBG_DEFAULTS;

export const dbg = $state({ ...DBG_DEFAULTS });

export const dbgEnabled =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

export interface DbgParam {
  key: DbgKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** geometry param: commits on release only (rebuilds the tendril field) */
  rebuild?: boolean;
}

export const DBG_GROUPS: { title: string; params: DbgParam[] }[] = [
  {
    title: 'tendril field (rebuilds on release)',
    params: [
      { key: 'nCurves', label: 'curves', min: 200, max: 8000, step: 100, rebuild: true },
      { key: 'stepKm', label: 'step km', min: 0.8, max: 8, step: 0.2, rebuild: true },
      { key: 'reachKm', label: 'reach km', min: 10, max: 150, step: 5, rebuild: true },
      { key: 'noiseLen1', label: 'noise λ broad km', min: 4, max: 100, step: 2, rebuild: true },
      { key: 'noiseLen2', label: 'noise λ fine km', min: 1, max: 30, step: 1, rebuild: true },
      { key: 'noiseAmp1', label: 'noise amp broad', min: 0, max: 4, step: 0.1, rebuild: true },
      { key: 'noiseAmp2', label: 'noise amp fine', min: 0, max: 2, step: 0.05, rebuild: true },
    ],
  },
  {
    title: 'tendril field 2 (rebuilds on release)',
    params: [
      { key: 't2Curves', label: 'curves', min: 0, max: 8000, step: 100, rebuild: true },
      { key: 't2StepKm', label: 'step km', min: 0.8, max: 8, step: 0.2, rebuild: true },
      { key: 't2NoiseLen1', label: 'noise λ broad km', min: 4, max: 100, step: 2, rebuild: true },
      { key: 't2NoiseLen2', label: 'noise λ fine km', min: 1, max: 30, step: 1, rebuild: true },
      { key: 't2NoiseAmp1', label: 'noise amp broad', min: 0, max: 4, step: 0.1, rebuild: true },
      { key: 't2NoiseAmp2', label: 'noise amp fine', min: 0, max: 2, step: 0.05, rebuild: true },
      { key: 't2BaseWidth', label: 'base width px', min: 0.1, max: 6, step: 0.1 },
    ],
  },
  {
    title: 'tendril shader',
    params: [
      { key: 'baseWidth', label: 'base width px', min: 0.2, max: 6, step: 0.1 },
      { key: 'widthBoost', label: 'width boost', min: 1, max: 20, step: 0.5 },
      { key: 'widthFalloff', label: 'width falloff exp', min: 0.4, max: 5, step: 0.1 },
      { key: 'scarWidth', label: 'scar width frac', min: 0, max: 1, step: 0.02 },
      { key: 'scarAlpha', label: 'scar alpha', min: 0, max: 0.6, step: 0.01 },
      { key: 'freshAlpha', label: 'fresh alpha', min: 0, max: 1, step: 0.02 },
      { key: 'pulseSpeed', label: 'pulse km/day', min: 0, max: 4, step: 0.05 },
      { key: 'pulseWidth', label: 'pulse width km', min: 1, max: 40, step: 1 },
      { key: 'pulseStrength', label: 'pulse strength', min: 0, max: 1.5, step: 0.05 },
    ],
  },
  {
    title: 'wounds & scars',
    params: [
      { key: 'fadeDays', label: 'wound fade days', min: 90, max: 4000, step: 30 },
      { key: 'glowScale', label: 'glow radius scale', min: 500, max: 10000, step: 100 },
      { key: 'glowMaxPx', label: 'glow max px', min: 8, max: 200, step: 2 },
      { key: 'glowAlpha', label: 'glow alpha', min: 0, max: 255, step: 5 },
      { key: 'coreScale', label: 'core radius scale', min: 300, max: 6000, step: 50 },
      { key: 'coreMaxPx', label: 'core max px', min: 4, max: 120, step: 2 },
      { key: 'coreAlpha', label: 'core alpha', min: 0, max: 255, step: 5 },
      { key: 'scarScale', label: 'scar radius scale', min: 200, max: 4000, step: 50 },
      { key: 'scarDotAlpha', label: 'scar alpha', min: 0, max: 255, step: 5 },
    ],
  },
];
