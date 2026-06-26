// Pixel-raster tree-cover-loss layer. A BitmapLayer subclass sampling ONE
// texture (deforestation_lossyear.png):
//   R = earliest loss-year code (1..25 = 2001..2025; 0 = no loss)
//   G = loss density (0..255) → opacity
//   B = PACKED codes, 8 bits:  bits 0-2 WRI driver (0..7)
//                              bits 3-4 ag-kind  (0 none/1 pasto/2 cultivos/3 mosaico)
//                              bits 5-6 legality (0 none/1 protected/2 reserve/3 other)
//                              bit  7   coca present (0/1)
//   A = 255 where loss (kept opaque — storing data in A risks premultiply corruption)
//
// Packing into one texture sidesteps luma's second-sampler binding (a 2nd
// BitmapLayer texture fails `_areTexturesRenderable` and silently skips the draw).
// Nearest filtering is REQUIRED so the packed byte is never interpolated.
//
// FLOAT uniforms drive everything on the GPU per frame without re-uploading:
//   maxYear  — fractional calendar position; thresholds the cumulative reveal.
//   spotDim  — which dimension the legend is hovering (0 none, 1 driver, 2 kind,
//              3 legality, 4 coca); spotCode — the code within that dimension to
//              spotlight. Matched cells take the dimension's colour and pop; the
//              rest fade to faint context. One code path serves every lens.
import { BitmapLayer } from '@deck.gl/layers';
import type { BitmapLayerProps } from '@deck.gl/layers';

// WRI/GDM driver palette, indexed by class code 1..7. CSS strings for legend
// swatches; the GLSL lossDriverColor() below MUST mirror these RGBs (synced by hand).
export const DRIVER_COLORS: Record<number, string> = {
  1: 'rgb(232, 150, 30)', // permanent agriculture
  2: 'rgb(210, 75, 160)', // hard commodities (mining/energy)
  3: 'rgb(37, 176, 164)', // shifting cultivation
  4: 'rgb(76, 145, 224)', // logging
  5: 'rgb(238, 64, 54)', // wildfire
  6: 'rgb(154, 166, 178)', // settlements and infrastructure
  7: 'rgb(155, 123, 224)', // other natural disturbances
};

// Ag-kind palette (CORINE-derived). Pasto is the headline — a warm cattle tan,
// distinct from the crop green so the "cleared to pasture" story reads at a glance.
export const AG_KIND_COLORS: Record<number, string> = {
  1: 'rgb(222, 170, 92)', // pasto / ganadería
  2: 'rgb(120, 196, 104)', // cultivos
  3: 'rgb(186, 162, 120)', // mosaico agropecuario
};

// Coca spotlight colour (a single magenta — coca is a presence flag, not a ranked code).
export const COCA_COLOR = 'rgb(196, 72, 206)';

// Legality palette (mirrors GLSL legalityColor): protected red, reserve orange,
// other muted. The "illegality" signal reads hot; "no restriction" recedes.
export const LEGALITY_COLORS: Record<number, string> = {
  1: 'rgb(226, 64, 56)', // protected area (RUNAP) — clearing illegal
  2: 'rgb(241, 141, 58)', // Ley 2ª forest reserve — restricted
  3: 'rgb(141, 143, 148)', // no special restriction
};

// Spotlight dimension selector (mirrors app.defSpot.dim → the spotDim uniform).
export const SPOT_DIM: Record<string, number> = {
  driver: 1,
  kind: 2,
  legality: 3,
  coca: 4,
};

// Recency-raster shader knobs. These defaults ARE the shipped look — the ?debug panel
// (defDebug.svelte.ts) mutates copies of them live; production always reads these.
export const FIRE_DEFAULTS = {
  // dissolve-in duration (timeline-years) as the playhead reaches each loss cohort
  fadeIn: 0.4,
  // burn-front cooling span (timeline-years): a cohort glows hot when the playhead
  // reaches it and cools to a deep ember over this many years behind the playhead
  cool: 12,
  // how far into its loss year a pixel can burn (0 = whole cohort at the year edge,
  // 1 = spread across the full year), modulated by coherent noise for an organic front
  jitter: 0.85,
  // spatial frequency of that burn noise (cycles across the raster; higher = finer)
  noiseScale: 160,
  // Pre-age the 2001/2002 baseline cohorts. Hansen's first years absorb the pre-2001
  // clearing backlog, so they should NOT ignite in unison. Each baseline pixel gets a
  // decorrelated noise age offset of up to baseAge * cool timeline-years — fractions land
  // past the cool span (already cold), the rest scatter across their lifecycle. 0 = off.
  baseAge: 1.6,
  // how strongly the long-cooled baseline desaturates toward grey (0 = stays ember warm,
  // 1 = fully grey at heat 0). Makes the oldest clearing read as established land.
  baseGrey: 0.75,
};
export type FireKnobs = typeof FIRE_DEFAULTS;

// Burn-front colour ramp: 4 stops keyed on heat (0 = long-cooled, 1 = at the front /
// freshly cleared). Deep ember -> red -> orange -> hot near-white: every stop is a
// visible warm tone (NO grey), so cooled loss still reads as cumulative extent. The
// ?debug panel edits copies of these; production reads them verbatim. pos is the heat
// position.
export const RAMP_DEFAULTS: { hex: string; pos: number }[] = [
  { hex: '#7a1606', pos: 0.0 }, // deep ember (long cooled)
  { hex: '#d11c0d', pos: 0.4 }, // red
  { hex: '#ff8a1f', pos: 0.72 }, // orange
  { hex: '#fff1c2', pos: 1.0 }, // hot near-white (at the front)
];
// hex "#rrggbb" -> [r,g,b,pos] in 0..1 for a vec4 ramp uniform.
export function rampStopToVec4(s: { hex: string; pos: number }): [number, number, number, number] {
  const h = s.hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    s.pos,
  ];
}
const RAMP_VEC4 = RAMP_DEFAULTS.map(rampStopToVec4);
type Vec4 = [number, number, number, number];
type FireOpts = Partial<FireKnobs> & {
  maxYear?: number;
  spotDim?: number;
  spotCode?: number;
  spotYear?: number;
  filterDim?: number;
  filterMask?: number;
  // this tile's lng/lat extent: (west, north, lngSpan = east-west, latSpan = south-north).
  // Lets the burn-front noise key off GEOGRAPHY, not per-tile uv, so it is continuous
  // across tile seams and zoom levels. Default = full-country bounds (single-texture look).
  tileBounds?: Vec4;
  ramp0?: Vec4;
  ramp1?: Vec4;
  ramp2?: Vec4;
  ramp3?: Vec4;
};

// Full-country bbox (mirrors the pipeline WEST/NORTH/EAST/SOUTH). The noise is
// normalised into this box so every tile samples the SAME geo-locked field — the
// default tileBounds below makes a single full-country layer reproduce it identically.
const COUNTRY_BOUNDS: Vec4 = [-80, 14, 14, -19]; // west, north, lngSpan, latSpan

const uniformBlock = /* glsl */ `\
layout(std140) uniform lossUniforms {
  float maxYear;
  float spotDim;
  float spotCode;
  float spotYear;    // >0: restrict the spotlight to loss of this single year (code = year-2000); 0: cumulative
  float filterDim;   // active lens dimension for bucket visibility (1 driver/2 kind/3 legality); 0: no filtering
  float filterMask;  // bitmask of ENABLED codes within filterDim (bit code-1); a cleared bit hides that bucket
  float fadeIn;      // dissolve-in duration (timeline-years) as the playhead reaches a cohort
  float cool;        // burn-front cooling span (timeline-years) behind the playhead
  float jitter;      // how far into the loss year a pixel can burn (0..1), noise-modulated
  float noiseScale;  // spatial frequency of the burn noise
  float baseAge;     // 2001/2002 pre-age span as a multiple of cool (noise-offset age)
  float baseGrey;    // 2001/2002 cooled-baseline grey blend (0..1)
  // this tile's lng/lat extent (west, north, east-west, south-north). Used to turn the
  // per-tile uv into a country-relative coordinate so the burn noise does not seam.
  vec4 tileBounds;
  // recency colour ramp: 4 stops, rgb in .xyz and recency position in .w (ascending).
  vec4 ramp0;
  vec4 ramp1;
  vec4 ramp2;
  vec4 ramp3;
} loss;

// MUST mirror DRIVER_COLORS (code -> rgb, 0..1).
vec3 lossDriverColor(float d) {
  int i = int(d + 0.5);
  if (i == 1) return vec3(0.910, 0.588, 0.118);
  if (i == 2) return vec3(0.824, 0.294, 0.627);
  if (i == 3) return vec3(0.145, 0.690, 0.643);
  if (i == 4) return vec3(0.298, 0.569, 0.878);
  if (i == 5) return vec3(0.933, 0.251, 0.212);
  if (i == 6) return vec3(0.604, 0.651, 0.698);
  return vec3(0.608, 0.482, 0.878);
}
// MUST mirror AG_KIND_COLORS.
vec3 agKindColor(float d) {
  int i = int(d + 0.5);
  if (i == 1) return vec3(0.871, 0.667, 0.361);
  if (i == 2) return vec3(0.471, 0.769, 0.408);
  return vec3(0.729, 0.635, 0.471);
}
// MUST mirror LEGALITY_COLORS.
vec3 legalityColor(float d) {
  int i = int(d + 0.5);
  if (i == 1) return vec3(0.886, 0.250, 0.220); // protected (clearing illegal)
  if (i == 2) return vec3(0.945, 0.553, 0.227); // forest reserve
  return vec3(0.553, 0.561, 0.580);             // other / no special restriction
}
vec3 cocaColor() { return vec3(0.769, 0.282, 0.808); } // MUST mirror COCA_COLOR

// fireRamp: recency ramp keyed on recency r in [0,1] (0 = oldest loss, 1 = newest).
// Runs through the 4 debug-tunable stops (ramp0 -> ramp3); each stop's .w is its
// recency position; smoothstep between consecutive positions.
vec3 fireRamp(float r) {
  vec3 c = loss.ramp0.xyz;
  c = mix(c, loss.ramp1.xyz, smoothstep(loss.ramp0.w, loss.ramp1.w, r));
  c = mix(c, loss.ramp2.xyz, smoothstep(loss.ramp1.w, loss.ramp2.w, r));
  c = mix(c, loss.ramp3.xyz, smoothstep(loss.ramp2.w, loss.ramp3.w, r));
  return c;
}
// SMOOTH value noise (geo-locked, spatially coherent — NOT per-cell white noise). Used
// to vary how far into its loss year each pixel "burns", giving the front an organic
// wavy edge. Coherent = neighbours get similar offsets, so it does not strobe on pan.
float vhash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = vhash(i), b = vhash(i + vec2(1.0, 0.0));
  float c = vhash(i + vec2(0.0, 1.0)), d = vhash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

const lossModule = {
  name: 'loss',
  fs: uniformBlock,
  inject: {
    // BitmapLayer hands the sampled texel to DECKGL_FILTER_COLOR as `color` (rgba,
    // 0..1). The blue channel packs four codes (see header); we unpack with integer
    // bit ops (GLSL ES 3.00 / WebGL2).
    'fs:DECKGL_FILTER_COLOR': /* glsl */ `
    // === DETERMINISTIC RECENCY RASTER ===========================================
    // Rewritten from the old per-cell stochastic "fire" model (random ignite/ash, a
    // re-ignition loop, value-noise flicker, fwidth edge rims). That model painted a
    // high-frequency RANDOM field of bright/grey cells: panning swept screen pixels
    // across it and the random per-cell states made it strobe — flicker independent of
    // texture filtering. This version is fully deterministic and spatially COHERENT:
    // a cell's colour depends only on its loss YEAR, so neighbours look alike and there
    // is nothing to flicker when the camera moves. Colour comes from the year, opacity
    // from density, with a soft reveal as the playhead reaches each cohort.
    //
    // Texel: R = loss-year code (1..25), G = density, B = packed codes, A = loss mask.
    if (color.a < 0.5) discard;                          // outside the loss extent
    float ly = max(floor(color.r * 255.0 + 0.5), 1.0);   // loss year (1=2001 .. 25=2025)
    float density = color.g;
    // Per-pixel burn moment WITHIN the loss year: smooth, geo-locked value noise offsets
    // how far into the year each pixel ignites (jitter = how much of the year it can eat
    // into, 0 = whole cohort lights at the year boundary, 1 = spread across the full
    // year). Coherent noise -> the front gets an organic wavy edge, neighbours stay
    // similar, so it does NOT strobe on pan. burnT replaces the hard (ly-1) year edge.
    // Geo-locked noise input: map this tile's uv -> lng/lat -> country-relative uv, so the
    // burn field is identical across tiles and zoom levels (no seam, no swim on LOD swap).
    // With the default (full-country) tileBounds this reduces exactly to geometry.uv.
    float _lng = loss.tileBounds.x + geometry.uv.x * loss.tileBounds.z;
    float _lat = loss.tileBounds.y + geometry.uv.y * loss.tileBounds.w;
    vec2 cuv = vec2((_lng - (-80.0)) / 14.0, (14.0 - _lat) / 19.0); // country-relative 0..1
    float burn  = vnoise(cuv * loss.noiseScale);           // smooth 0..1
    float burnT = (ly - 1.0) + loss.jitter * burn;         // this pixel's ignition (years)
    // Reveal: the pixel dissolves in over fadeIn years once the playhead reaches burnT.
    // Deterministic in (burnT, maxYear) only — identical every frame at a given playhead.
    float reveal = smoothstep(burnT, burnT + max(loss.fadeIn, 0.05), loss.maxYear);
    if (reveal <= 0.0) discard;                          // not yet reached by the playhead
    // unpack the packed blue channel (codes; consumed only by the lens/filter branches)
    int packed = int(color.b * 255.0 + 0.5);
    float driverCode = float(packed & 7);
    float agKind = float((packed >> 3) & 3);
    float legality = float((packed >> 5) & 3);
    float cocaPresent = float((packed >> 7) & 1);
    // bucket visibility: hide loss whose active-lens code is toggled off in the
    // legend. Code 0 (unclassified for this dimension) is untoggleable context and
    // always survives; only the ranked buckets (code >= 1) can be filtered out.
    if (loss.filterDim > 0.5) {
      float fcode = (loss.filterDim < 1.5) ? driverCode
                  : (loss.filterDim < 2.5) ? agKind
                  : legality;
      int ci = int(fcode + 0.5);
      if (ci > 0 && (int(loss.filterMask + 0.5) & (1 << (ci - 1))) == 0) discard;
    }
    // Burn-front colour: a cohort glows hot the moment the playhead reaches it, then
    // cools smoothly to a deep ember over the cool-span (timeline-years) as the playhead
    // moves past. heat is a continuous function of (loss year, playhead) only — NO per-cell
    // randomness — so the front is calm under pan and smooth under scrub/play, and old
    // loss settles to a still-visible ember (never grey) so cumulative extent reads.
    float age  = loss.maxYear - burnT;                   // timeline-years behind the front
    // Hansen's 2001/2002 cohorts absorb the pre-2001 clearing backlog — painting them as one
    // synchronized fresh front is wrong. Pre-age each baseline pixel by decorrelated coherent
    // noise: some land past the cool span (already cold/grey), others at random lifecycle
    // points, so the first cohorts read as long-established rather than just-ignited.
    if (ly < 2.5) {
      float aNoise = vnoise(cuv * loss.noiseScale * 2.7 + vec2(31.7, 11.3)); // 0..1, decorrelated
      age += aNoise * loss.baseAge * max(loss.cool, 0.001);
    }
    float heat = 1.0 - clamp(age / max(loss.cool, 0.001), 0.0, 1.0);  // 1 fresh .. 0 cold
    vec3 rgb = fireRamp(heat);
    // desaturate the long-cooled baseline toward grey so the oldest clearing reads as
    // established land, not warm ember (scoped to 2001/2002 — newer cooled loss stays warm).
    if (ly < 2.5) {
      rgb = mix(rgb, vec3(0.46, 0.44, 0.42), (1.0 - heat) * loss.baseGrey);
    }
    // Opacity by cumulative clearing density (gamma'd so stray pixels stay faint and
    // concentrated clearing reads solid), faded in by the reveal.
    float a = clamp(pow(density, 0.6) * 0.95, 0.0, 0.95) * reveal;
    if (a < 0.02) discard;

    // spotlight: light one code within the active dimension; fade everything else.
    if (loss.spotDim > 0.5) {
      float code;
      vec3 hi;
      if (loss.spotDim < 1.5) {             // driver
        code = driverCode; hi = lossDriverColor(loss.spotCode);
      } else if (loss.spotDim < 2.5) {      // ag-kind
        code = agKind; hi = agKindColor(loss.spotCode);
      } else if (loss.spotDim < 3.5) {      // legality
        code = legality; hi = legalityColor(loss.spotCode);
      } else {                              // coca (presence bit)
        code = (cocaPresent > 0.5) ? loss.spotCode : 0.0;
        hi = cocaColor();
      }
      // year mode restricts the highlight to the single scrubbed year's loss;
      // total mode (spotYear==0) lights every matching year up to maxYear.
      bool yearMatch = (loss.spotYear < 0.5) || (abs(ly - loss.spotYear) < 0.5);
      if (abs(code - loss.spotCode) < 0.5 && yearMatch) {
        rgb = hi;
        a = clamp(a * 1.3 + 0.18, 0.0, 0.98);
      } else {
        rgb = mix(rgb, vec3(0.45, 0.42, 0.40), 0.55);
        a *= 0.10;
        if (a < 0.015) discard;
      }
    }
    color = vec4(rgb, a);
    `,
  },
  uniformTypes: {
    maxYear: 'f32',
    spotDim: 'f32',
    spotCode: 'f32',
    spotYear: 'f32',
    filterDim: 'f32',
    filterMask: 'f32',
    fadeIn: 'f32',
    cool: 'f32',
    jitter: 'f32',
    noiseScale: 'f32',
    baseAge: 'f32',
    baseGrey: 'f32',
    tileBounds: 'vec4<f32>',
    ramp0: 'vec4<f32>',
    ramp1: 'vec4<f32>',
    ramp2: 'vec4<f32>',
    ramp3: 'vec4<f32>',
  },
  getUniforms: (opts?: FireOpts) => ({
    maxYear: opts?.maxYear ?? 25,
    spotDim: opts?.spotDim ?? 0,
    spotCode: opts?.spotCode ?? 0,
    spotYear: opts?.spotYear ?? 0,
    filterDim: opts?.filterDim ?? 0,
    filterMask: opts?.filterMask ?? 0,
    fadeIn: opts?.fadeIn ?? FIRE_DEFAULTS.fadeIn,
    cool: opts?.cool ?? FIRE_DEFAULTS.cool,
    jitter: opts?.jitter ?? FIRE_DEFAULTS.jitter,
    noiseScale: opts?.noiseScale ?? FIRE_DEFAULTS.noiseScale,
    baseAge: opts?.baseAge ?? FIRE_DEFAULTS.baseAge,
    baseGrey: opts?.baseGrey ?? FIRE_DEFAULTS.baseGrey,
    tileBounds: opts?.tileBounds ?? COUNTRY_BOUNDS,
    ramp0: opts?.ramp0 ?? RAMP_VEC4[0],
    ramp1: opts?.ramp1 ?? RAMP_VEC4[1],
    ramp2: opts?.ramp2 ?? RAMP_VEC4[2],
    ramp3: opts?.ramp3 ?? RAMP_VEC4[3],
  }),
} as const;

export type LossRasterLayerProps = BitmapLayerProps &
  Partial<FireKnobs> & {
    maxYear?: number;
    spotDim?: number;
    spotCode?: number;
    spotYear?: number;
    filterDim?: number;
    filterMask?: number;
    tileBounds?: Vec4;
    ramp0?: Vec4;
    ramp1?: Vec4;
    ramp2?: Vec4;
    ramp3?: Vec4;
  };

export class LossRasterLayer extends BitmapLayer<LossRasterLayerProps> {
  static layerName = 'LossRasterLayer';
  static defaultProps = {
    ...BitmapLayer.defaultProps,
    maxYear: { type: 'number', value: 25 } as const,
    spotDim: { type: 'number', value: 0 } as const,
    spotCode: { type: 'number', value: 0 } as const,
    spotYear: { type: 'number', value: 0 } as const,
    filterDim: { type: 'number', value: 0 } as const,
    filterMask: { type: 'number', value: 0 } as const,
    fadeIn: { type: 'number', value: FIRE_DEFAULTS.fadeIn } as const,
    cool: { type: 'number', value: FIRE_DEFAULTS.cool } as const,
    jitter: { type: 'number', value: FIRE_DEFAULTS.jitter } as const,
    noiseScale: { type: 'number', value: FIRE_DEFAULTS.noiseScale } as const,
    baseAge: { type: 'number', value: FIRE_DEFAULTS.baseAge } as const,
    baseGrey: { type: 'number', value: FIRE_DEFAULTS.baseGrey } as const,
    tileBounds: { type: 'array', value: COUNTRY_BOUNDS } as const,
    ramp0: { type: 'array', value: RAMP_VEC4[0] } as const,
    ramp1: { type: 'array', value: RAMP_VEC4[1] } as const,
    ramp2: { type: 'array', value: RAMP_VEC4[2] } as const,
    ramp3: { type: 'array', value: RAMP_VEC4[3] } as const,
  };

  getShaders() {
    const shaders = super.getShaders();
    return { ...shaders, modules: [...shaders.modules, lossModule] };
  }

  draw(opts: Parameters<BitmapLayer['draw']>[0]) {
    const p = this.props;
    this.setShaderModuleProps({
      loss: {
        maxYear: p.maxYear ?? 25,
        spotDim: p.spotDim ?? 0,
        spotCode: p.spotCode ?? 0,
        spotYear: p.spotYear ?? 0,
        filterDim: p.filterDim ?? 0,
        filterMask: p.filterMask ?? 0,
        fadeIn: p.fadeIn ?? FIRE_DEFAULTS.fadeIn,
        cool: p.cool ?? FIRE_DEFAULTS.cool,
        jitter: p.jitter ?? FIRE_DEFAULTS.jitter,
        noiseScale: p.noiseScale ?? FIRE_DEFAULTS.noiseScale,
        baseAge: p.baseAge ?? FIRE_DEFAULTS.baseAge,
        baseGrey: p.baseGrey ?? FIRE_DEFAULTS.baseGrey,
        tileBounds: p.tileBounds ?? COUNTRY_BOUNDS,
        ramp0: p.ramp0 ?? RAMP_VEC4[0],
        ramp1: p.ramp1 ?? RAMP_VEC4[1],
        ramp2: p.ramp2 ?? RAMP_VEC4[2],
        ramp3: p.ramp3 ?? RAMP_VEC4[3],
      },
    });
    super.draw(opts);
  }
}
