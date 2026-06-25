// Pixel-raster tree-cover-loss layer. A BitmapLayer subclass sampling TWO
// grid-aligned textures:
//   image      (deforestation_lossyear.png) RED = earliest loss-year code (1..25),
//              GREEN = loss density, BLUE = WRI dominant-driver code (1..7; 0 none).
//   codesImage (deforestation_codes.png)    RED = ag-kind (1 pasto/2 cultivos/3 mosaico),
//              GREEN = legality code (phase 2b), BLUE = earliest coca year (1..23; 0 none).
// Both share the exact same grid, so a single texCoord (`uv`) samples both.
//
// FLOAT uniforms drive everything on the GPU per frame without re-uploading:
//   maxYear  — fractional calendar position; thresholds the cumulative reveal.
//   spotDim  — which dimension the legend is hovering (0 none, 1 driver, 2 kind,
//              3 legality, 4 coca); spotCode — the code within that dimension to
//              spotlight. Matched cells take the dimension's colour and pop; the
//              rest fade to faint context. One code path serves every lens.
// Same "filter on the GPU, never touch attributes per frame" design as the
// violence layer (docs/stack-decision.md); std140 + setShaderModuleProps mirrors
// TendrilExtension. The codes texture is a second sampler bound the same way as
// BitmapLayer's own bitmapTexture.
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

const uniformBlock = /* glsl */ `\
uniform sampler2D codesTexture;

layout(std140) uniform lossUniforms {
  float maxYear;
  float spotDim;
  float spotCode;
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
// Phase 2b legality palette (stub until the legality channel is populated).
vec3 legalityColor(float d) {
  int i = int(d + 0.5);
  if (i == 1) return vec3(0.886, 0.250, 0.220); // protected (clearing illegal)
  if (i == 2) return vec3(0.945, 0.553, 0.227); // forest reserve
  if (i == 3) return vec3(0.937, 0.792, 0.353); // outside ag frontier
  return vec3(0.553, 0.561, 0.580);             // permitted
}
vec3 cocaColor() { return vec3(0.769, 0.282, 0.808); } // MUST mirror COCA_COLOR
`;

const lossModule = {
  name: 'loss',
  fs: uniformBlock,
  inject: {
    // BitmapLayer hands the sampled texel to DECKGL_FILTER_COLOR as `color`
    // (rgba, 0..1). This hook is a separate function (color, geometry) — the
    // main-local `uv` is NOT in scope, but the bitmap fragment copies it to
    // `geometry.uv`, which we use to sample the companion codes texture at the
    // identical coordinate.
    'fs:DECKGL_FILTER_COLOR': /* glsl */ `
    float ly = floor(color.r * 255.0 + 0.5);
    if (ly < 0.5) discard;
    // smooth reveal: a loss cohort fades in across the calendar year that ends at
    // its own code (fade 0 at maxYear==ly-1, full at maxYear>=ly), so scrubbing or
    // playing the float year DISSOLVES new loss in instead of popping it on.
    float fade = clamp(loss.maxYear - ly + 1.0, 0.0, 1.0);
    if (fade < 0.01) discard;
    // green channel = loss density (fraction of the cell cleared). Opacity tracks
    // it (gamma'd) so a single stray pixel is near-invisible and only concentrated
    // clearing reads as solid — honest extent, not "any loss = full cell".
    float density = color.g;
    float a = clamp(pow(density, 0.6) * 0.95, 0.0, 0.95) * fade;
    if (a < 0.02) discard;
    float driverCode = floor(color.b * 255.0 + 0.5);
    // recency ramp: older loss amber, recent loss hot red (GFW-like).
    float tnorm = clamp((ly - 1.0) / 24.0, 0.0, 1.0);
    vec3 rgb = mix(vec3(0.86, 0.53, 0.12), vec3(1.0, 0.30, 0.10), tnorm);
    // spotlight: light one code within the active dimension; fade everything else.
    if (loss.spotDim > 0.5) {
      float code;
      vec3 hi;
      if (loss.spotDim < 1.5) {             // driver (main blue channel)
        code = driverCode; hi = lossDriverColor(loss.spotCode);
      } else {
        vec4 cc = texture(codesTexture, geometry.uv);
        if (loss.spotDim < 2.5) {           // ag-kind (codes red)
          code = floor(cc.r * 255.0 + 0.5); hi = agKindColor(loss.spotCode);
        } else if (loss.spotDim < 3.5) {    // legality (codes green)
          code = floor(cc.g * 255.0 + 0.5); hi = legalityColor(loss.spotCode);
        } else {                            // coca (codes blue = earliest coca year)
          float cy = floor(cc.b * 255.0 + 0.5);
          code = (cy > 0.5 && cy <= loss.maxYear) ? loss.spotCode : 0.0;
          hi = cocaColor();
        }
      }
      if (abs(code - loss.spotCode) < 0.5) {
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
  uniformTypes: { maxYear: 'f32', spotDim: 'f32', spotCode: 'f32' },
  getUniforms: (opts?: { maxYear?: number; spotDim?: number; spotCode?: number }) => ({
    maxYear: opts?.maxYear ?? 25,
    spotDim: opts?.spotDim ?? 0,
    spotCode: opts?.spotCode ?? 0,
  }),
} as const;

export type LossRasterLayerProps = BitmapLayerProps & {
  maxYear?: number;
  spotDim?: number;
  spotCode?: number;
  codesImage?: unknown; // second texture (deforestation_codes.png), type 'image'
};

export class LossRasterLayer extends BitmapLayer<LossRasterLayerProps> {
  static layerName = 'LossRasterLayer';
  static defaultProps = {
    ...BitmapLayer.defaultProps,
    maxYear: { type: 'number', value: 25 } as const,
    spotDim: { type: 'number', value: 0 } as const,
    spotCode: { type: 'number', value: 0 } as const,
    // async:true makes deck.gl decode the ImageBitmap into a luma Texture, exactly
    // like the base `image` prop; this.props.codesImage is a Texture by draw time.
    codesImage: { type: 'image', value: null, async: true } as const,
  };

  getShaders() {
    const shaders = super.getShaders();
    return { ...shaders, modules: [...shaders.modules, lossModule] };
  }

  draw(opts: Parameters<BitmapLayer['draw']>[0]) {
    // Bind the codes sampler + the float uniforms before the base draw issues the
    // model.draw. Fall back to the main image so the sampler is always valid even
    // on the first frame before the codes texture finishes decoding.
    this.setShaderModuleProps({
      loss: {
        maxYear: this.props.maxYear ?? 25,
        spotDim: this.props.spotDim ?? 0,
        spotCode: this.props.spotCode ?? 0,
        codesTexture: this.props.codesImage ?? this.props.image,
      },
    });
    super.draw(opts);
  }
}
