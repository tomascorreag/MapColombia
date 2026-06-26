// Jungle-green forest backdrop for the deforestation view. A BitmapLayer subclass
// sampling ONE texture (deforestation_forest.png):
//   R = year-2000 tree canopy cover percent (0..100 scaled to 0..255)
//   A = 255 inside the Colombia land footprint (clips the green to the country)
//
// It renders BELOW the loss raster: the standing year-2000 forest is the canvas,
// the fire/ember loss layer burns on top of it. Canopy density drives the green
// depth (deep jungle in the Amazon/Pacific, barren olive in the llanos/Andes) and
// a 2-octave value-noise mottles it into foliage. All look knobs are FLOAT uniforms
// tuned live by the ?debug panel (forestDebug.svelte.ts); production reads the
// defaults here. Own single texture/sampler — independent of the lossyear layer's
// packed-channel path, so no luma second-sampler issue.
//
// Data honesty: treecover2000 is a YEAR-2000 canopy SNAPSHOT, not current forest
// and not biomass; it is a visualization-only backdrop (labeled in the meta).
import { BitmapLayer } from '@deck.gl/layers';
import type { BitmapLayerProps } from '@deck.gl/layers';

// Jungle-green look knobs. These defaults ARE the shipped backdrop; the ?debug
// panel mutates copies of them live (forestDebug.svelte.ts).
export const FOREST_DEFAULTS = {
  canopyPow: 0.8, // gamma on canopy% -> green depth (>1 darkens sparse cover)
  noiseScale: 220, // foliage mottling spatial frequency (texture/geo space)
  noiseScale2: 70, // second, coarser octave for large green patches
  noiseAmt: 0.3, // mottling strength (0 = flat green, 1 = strong light/dark) — kept
  // low so the backdrop stays a fairly uniform green with no muddy blur to offset
  // behind the sharp loss cells
  bright: 1.0, // overall brightness multiplier
  alpha: 0.92, // backdrop opacity over the basemap
  canopyAlpha: 0.55, // how much low canopy fades the backdrop (0 = uniform alpha)
  sway: 0, // timeline-driven drift of the noise field (0 = static; no wall-clock)
};
export type ForestKnobs = typeof FOREST_DEFAULTS;

// Two-stop green: sparse low-canopy tone -> deep jungle at full canopy. Both stops
// stay clearly GREEN (G dominant) — the old low stop (#26301c) was a grey-olive that
// read as muddy grey where the deforestation arc meets the low-canopy llanos, and
// showed through faint loss cells as an offset grey halo. A clean green backdrop means
// nothing grey sits behind the loss raster.
export const FOREST_COLORS = {
  lowCol: '#2c4622', // ~0% canopy (sparse land) — dim but unmistakably green
  highCol: '#15692c', // ~100% canopy (dense jungle)
};
export type ForestColors = typeof FOREST_COLORS;

type Vec4 = [number, number, number, number];

// hex "#rrggbb" -> [r,g,b,1] in 0..1 for a vec4 colour uniform.
export function hexToVec4(hex: string): Vec4 {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    1,
  ];
}
const LOW_VEC4 = hexToVec4(FOREST_COLORS.lowCol);
const HIGH_VEC4 = hexToVec4(FOREST_COLORS.highCol);

type ForestOpts = Partial<ForestKnobs> & {
  maxYear?: number;
  lowCol?: Vec4;
  highCol?: Vec4;
};

const uniformBlock = /* glsl */ `\
layout(std140) uniform forestUniforms {
  float maxYear;     // timeline position (only used when sway > 0)
  float canopyPow;
  float noiseScale;
  float noiseScale2;
  float noiseAmt;
  float bright;
  float alpha;
  float canopyAlpha;
  float sway;
  vec4 lowCol;       // rgb in .xyz (.w unused)
  vec4 highCol;
} forest;

float fhash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// value noise + 4-octave fbm for foliage mottling (no texture, no wall-clock).
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = fhash(i), b = fhash(i + vec2(1.0, 0.0));
  float c = fhash(i + vec2(0.0, 1.0)), d = fhash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) { s += amp * vnoise(p); p *= 2.0; amp *= 0.5; }
  return s;
}
`;

const forestModule = {
  name: 'forest',
  fs: uniformBlock,
  inject: {
    // BitmapLayer hands the sampled texel as `color` (rgba, 0..1). R = canopy%,
    // A = country mask. We recolour to jungle green; outside the country we discard.
    'fs:DECKGL_FILTER_COLOR': /* glsl */ `
    if (color.a < 0.5) discard;                         // outside Colombia land
    float canopy = pow(clamp(color.r, 0.0, 1.0), forest.canopyPow);
    vec2 uv = geometry.uv + forest.maxYear * forest.sway;
    float mott = mix(fbm(uv * forest.noiseScale),
                     fbm(uv * forest.noiseScale2 + 7.3), 0.5);
    vec3 green = mix(forest.lowCol.xyz, forest.highCol.xyz, canopy);
    green *= forest.bright * (1.0 - forest.noiseAmt * (0.5 - mott));
    float a = forest.alpha * mix(1.0 - forest.canopyAlpha, 1.0, canopy);
    color = vec4(clamp(green, 0.0, 1.0), clamp(a, 0.0, 1.0));
    `,
  },
  uniformTypes: {
    maxYear: 'f32',
    canopyPow: 'f32',
    noiseScale: 'f32',
    noiseScale2: 'f32',
    noiseAmt: 'f32',
    bright: 'f32',
    alpha: 'f32',
    canopyAlpha: 'f32',
    sway: 'f32',
    lowCol: 'vec4<f32>',
    highCol: 'vec4<f32>',
  },
  getUniforms: (opts?: ForestOpts) => ({
    maxYear: opts?.maxYear ?? 25,
    canopyPow: opts?.canopyPow ?? FOREST_DEFAULTS.canopyPow,
    noiseScale: opts?.noiseScale ?? FOREST_DEFAULTS.noiseScale,
    noiseScale2: opts?.noiseScale2 ?? FOREST_DEFAULTS.noiseScale2,
    noiseAmt: opts?.noiseAmt ?? FOREST_DEFAULTS.noiseAmt,
    bright: opts?.bright ?? FOREST_DEFAULTS.bright,
    alpha: opts?.alpha ?? FOREST_DEFAULTS.alpha,
    canopyAlpha: opts?.canopyAlpha ?? FOREST_DEFAULTS.canopyAlpha,
    sway: opts?.sway ?? FOREST_DEFAULTS.sway,
    lowCol: opts?.lowCol ?? LOW_VEC4,
    highCol: opts?.highCol ?? HIGH_VEC4,
  }),
} as const;

export type ForestLayerProps = BitmapLayerProps &
  Partial<ForestKnobs> & {
    maxYear?: number;
    lowCol?: Vec4;
    highCol?: Vec4;
  };

export class ForestLayer extends BitmapLayer<ForestLayerProps> {
  static layerName = 'ForestLayer';
  static defaultProps = {
    ...BitmapLayer.defaultProps,
    maxYear: { type: 'number', value: 25 } as const,
    canopyPow: { type: 'number', value: FOREST_DEFAULTS.canopyPow } as const,
    noiseScale: { type: 'number', value: FOREST_DEFAULTS.noiseScale } as const,
    noiseScale2: { type: 'number', value: FOREST_DEFAULTS.noiseScale2 } as const,
    noiseAmt: { type: 'number', value: FOREST_DEFAULTS.noiseAmt } as const,
    bright: { type: 'number', value: FOREST_DEFAULTS.bright } as const,
    alpha: { type: 'number', value: FOREST_DEFAULTS.alpha } as const,
    canopyAlpha: { type: 'number', value: FOREST_DEFAULTS.canopyAlpha } as const,
    sway: { type: 'number', value: FOREST_DEFAULTS.sway } as const,
    lowCol: { type: 'array', value: LOW_VEC4 } as const,
    highCol: { type: 'array', value: HIGH_VEC4 } as const,
  };

  getShaders() {
    const shaders = super.getShaders();
    return { ...shaders, modules: [...shaders.modules, forestModule] };
  }

  draw(opts: Parameters<BitmapLayer['draw']>[0]) {
    const p = this.props;
    this.setShaderModuleProps({
      forest: {
        maxYear: p.maxYear ?? 25,
        canopyPow: p.canopyPow ?? FOREST_DEFAULTS.canopyPow,
        noiseScale: p.noiseScale ?? FOREST_DEFAULTS.noiseScale,
        noiseScale2: p.noiseScale2 ?? FOREST_DEFAULTS.noiseScale2,
        noiseAmt: p.noiseAmt ?? FOREST_DEFAULTS.noiseAmt,
        bright: p.bright ?? FOREST_DEFAULTS.bright,
        alpha: p.alpha ?? FOREST_DEFAULTS.alpha,
        canopyAlpha: p.canopyAlpha ?? FOREST_DEFAULTS.canopyAlpha,
        sway: p.sway ?? FOREST_DEFAULTS.sway,
        lowCol: p.lowCol ?? LOW_VEC4,
        highCol: p.highCol ?? HIGH_VEC4,
      },
    });
    super.draw(opts);
  }
}
