// LayerExtension animating the blood tendrils on the GPU. Per-segment static
// attributes (wound day / scar day / distance / arc position / victim weight,
// baked once in tendrils.ts) plus a single per-frame time uniform drive:
//   - the fresh-wound envelope: an EXACT mirror of the wound layers'
//     DataFilterExtension soft-range shape (full brightness for the first 30
//     days, smoothstep fade-out over WOUND_FADE_DAYS, hard zero pre-event)
//   - the width profile: thickest at the massacre, tapering to 0 at REACH
//   - an outward-travelling brightness pulse along the curve while fresh
//   - a PERMANENT scar state the tendril settles into (dark crimson, thin),
//     mirroring the scar dots — including year-end appearance for massacres
//     with an unknown exact date
// Per-frame cost is one uniform-block update — no attribute touches, per the
// load-bearing scrubbing constraint in docs/stack-decision.md.
import { LayerExtension } from '@deck.gl/core';
import type { Layer } from '@deck.gl/core';
import { WOUND_FADE_DAYS } from './memoria';
import { REACH_KM } from './tendrils';

const FULL_DAYS = 30; // matches the wound layers' filterSoftRange width
const VICTIM_NORM = 5; // sqrt(victims) of a "typical" massacre
const PULSE_SPEED_KM_PER_DAY = 0.4; // outward spread ~ REACH in ~140 sim-days
const PULSE_WIDTH_KM = 24;
const WIDTH_BOOST = 7.5; // width multiplier at the massacre centre (fresh)
const WIDTH_FALLOFF = 2.7; // taper exponent, wound centre -> reach
const SCAR_WIDTH = 1.0; // scar width as a fraction of the fresh width
const SCAR_ALPHA = 0.15; // permanent scar opacity (additive, accumulates)
const FRESH_ALPHA = 0.96; // fresh tendril base opacity (pulse adds on top)
const PULSE_STRENGTH = 1.05; // extra opacity at the pulse crest

/** Visual knobs overridable per frame from the debug panel. */
export interface TendrilShaderParams {
  fadeDays?: number;
  reachKm?: number;
  pulseSpeedKmPerDay?: number;
  pulseWidthKm?: number;
  widthBoost?: number;
  widthFalloff?: number;
  scarWidth?: number;
  scarAlpha?: number;
  freshAlpha?: number;
  pulseStrength?: number;
  /** bit i set = modality i is shown (legend checkboxes); -1 = all */
  enabledMask?: number;
  /** 0 = fresh-flare pass (additive), 1 = permanent-scar pass (uniform alpha) */
  scarMode?: number;
}

export type TendrilLayerProps = {
  /** current memoria day (app.mday); the only required per-frame input */
  tendrilTime?: number;
  tendrilParams?: TendrilShaderParams;
};

const uniformBlock = /* glsl */ `\
layout(std140) uniform tendrilUniforms {
  float timeDay;
  float fullDays;
  float fadeDays;
  float reachKm;
  float victimNorm;
  float pulseSpeedKmPerDay;
  float pulseWidthKm;
  float widthBoost;
  float widthFalloff;
  float scarWidth;
  float scarAlpha;
  float freshAlpha;
  float pulseStrength;
  float scarMode;
  int enabledMask;
} tendril;
`;

const tendrilModule = {
  name: 'tendril',
  vs: /* glsl */ `\
${uniformBlock}
in float instanceWoundDay;
in float instanceScarDay;
in float instanceWoundDist;
in float instanceArcFromWound;
in float instanceVictimW;
in float instanceModality;
out float tendril_alpha;
out float tendril_fresh;
float tendril_widthScale;
`,
  fs: /* glsl */ `\
in float tendril_alpha;
in float tendril_fresh;
`,
  inject: {
    'vs:#main-start': /* glsl */ `
    float tendril_tF = tendril.timeDay - instanceWoundDay;
    float tendril_env = step(0.0, tendril_tF)
      * (1.0 - smoothstep(tendril.fullDays, tendril.fadeDays, tendril_tF));
    // legend gate: hide segments whose modality checkbox is off
    int tendril_bit = 1 << int(instanceModality + 0.5);
    float tendril_modOn = (tendril.enabledMask & tendril_bit) != 0 ? 1.0 : 0.0;
    float tendril_on = step(instanceScarDay, tendril.timeDay) * tendril_modOn;
    float tendril_reach = tendril.reachKm
      * (0.5 + 0.5 * min(instanceVictimW / tendril.victimNorm, 2.0));
    float tendril_norm = clamp(instanceWoundDist / tendril_reach, 0.0, 1.0);
    // thickest at the wound centre, tapering to 0 at reach
    float tendril_taper = pow(1.0 - tendril_norm, tendril.widthFalloff);
    if (tendril.scarMode > 0.5) {
      // permanent scar pass: thin, dark, NORMAL blending so any number of
      // overlapping strands composites to one ceiling alpha — every scar
      // settles to the same intensity regardless of how many victims fell.
      tendril_widthScale = tendril_on * tendril_taper * tendril.widthBoost
        * tendril.scarWidth;
      tendril_alpha = tendril_on * tendril_taper * tendril.scarAlpha;
      tendril_fresh = 0.0;
    } else {
      // fresh-flare pass: transient, ADDITIVE so dense/deadly wounds burn hot.
      float tendril_pd =
        (instanceArcFromWound - tendril_tF * tendril.pulseSpeedKmPerDay)
        / tendril.pulseWidthKm;
      float tendril_pulse = exp(-tendril_pd * tendril_pd) * tendril_env;
      tendril_widthScale = tendril_on * tendril_taper * tendril.widthBoost
        * mix(tendril.scarWidth, 1.0, tendril_env);
      tendril_alpha = tendril_on * tendril_taper * tendril_env
        * (tendril.freshAlpha + tendril.pulseStrength * tendril_pulse);
      tendril_fresh = tendril_env;
    }
    `,
    'vs:DECKGL_FILTER_SIZE': /* glsl */ `
    size.xy *= tendril_widthScale;
    `,
    'vs:#main-end': /* glsl */ `
    if (tendril_widthScale < 0.003) {
      gl_Position = vec4(0.0);
    }
    `,
    'fs:DECKGL_FILTER_COLOR': /* glsl */ `
    // fresh: bright wound red; scar: the scar dots' dark crimson
    vec3 tendril_rgb = mix(vec3(0.376, 0.063, 0.086), vec3(1.0, 0.227, 0.110), tendril_fresh);
    color.rgb = tendril_rgb;
    color.a = clamp(color.a * tendril_alpha, 0.0, 1.0);
    if (color.a < 0.004) discard;
    `,
  },
  uniformTypes: {
    timeDay: 'f32',
    fullDays: 'f32',
    fadeDays: 'f32',
    reachKm: 'f32',
    victimNorm: 'f32',
    pulseSpeedKmPerDay: 'f32',
    pulseWidthKm: 'f32',
    widthBoost: 'f32',
    widthFalloff: 'f32',
    scarWidth: 'f32',
    scarAlpha: 'f32',
    freshAlpha: 'f32',
    pulseStrength: 'f32',
    scarMode: 'f32',
    enabledMask: 'i32',
  },
  getUniforms: (opts?: { timeDay?: number } & TendrilShaderParams) => ({
    timeDay: opts?.timeDay ?? 0,
    fullDays: FULL_DAYS,
    fadeDays: opts?.fadeDays ?? WOUND_FADE_DAYS,
    reachKm: opts?.reachKm ?? REACH_KM,
    victimNorm: VICTIM_NORM,
    pulseSpeedKmPerDay: opts?.pulseSpeedKmPerDay ?? PULSE_SPEED_KM_PER_DAY,
    pulseWidthKm: opts?.pulseWidthKm ?? PULSE_WIDTH_KM,
    widthBoost: opts?.widthBoost ?? WIDTH_BOOST,
    widthFalloff: opts?.widthFalloff ?? WIDTH_FALLOFF,
    scarWidth: opts?.scarWidth ?? SCAR_WIDTH,
    scarAlpha: opts?.scarAlpha ?? SCAR_ALPHA,
    freshAlpha: opts?.freshAlpha ?? FRESH_ALPHA,
    pulseStrength: opts?.pulseStrength ?? PULSE_STRENGTH,
    scarMode: opts?.scarMode ?? 0,
    enabledMask: opts?.enabledMask ?? -1,
  }),
} as const;

export class TendrilExtension extends LayerExtension {
  static extensionName = 'TendrilExtension';
  static defaultProps = {
    tendrilTime: 0,
    tendrilParams: {},
    getWoundDay: { type: 'accessor', value: 1e9 },
    getScarDay: { type: 'accessor', value: 1e9 },
    getWoundDist: { type: 'accessor', value: 1e6 },
    getArcFromWound: { type: 'accessor', value: 0 },
    getVictimW: { type: 'accessor', value: 1 },
    getModality: { type: 'accessor', value: 0 },
  };

  getShaders(this: Layer) {
    return { modules: [tendrilModule] };
  }

  initializeState(this: Layer) {
    const attributeManager = this.getAttributeManager();
    if (!attributeManager) return;
    attributeManager.addInstanced({
      instanceWoundDay: { size: 1, accessor: 'getWoundDay' },
      instanceScarDay: { size: 1, accessor: 'getScarDay' },
      instanceWoundDist: { size: 1, accessor: 'getWoundDist' },
      instanceArcFromWound: { size: 1, accessor: 'getArcFromWound' },
      instanceVictimW: { size: 1, accessor: 'getVictimW' },
      instanceModality: { size: 1, accessor: 'getModality' },
    });
  }

  draw(this: Layer<TendrilLayerProps>) {
    this.setShaderModuleProps({
      tendril: { timeDay: this.props.tendrilTime ?? 0, ...this.props.tendrilParams },
    });
  }
}
