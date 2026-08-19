// Custom deck.gl layer drawing the blood tendrils of the Memoria tab. One
// non-instanced triangle strip per field (geometry packed by tendrils.ts), two
// layers per field: a PERMANENT-scar pass (normal blend, uniform settled
// alpha) and a fresh-flare pass (additive). Per-vertex static attributes
// (wound day / scar day / distance / arc position / victims / modality, baked
// once in tendrils.ts) plus a single per-frame time uniform drive:
//   - the fresh-wound envelope: an EXACT mirror of the wound layers'
//     DataFilterExtension soft-range shape (full brightness for the first 30
//     days, smoothstep fade-out over WOUND_FADE_DAYS, hard zero pre-event)
//   - the width profile: thickest at the massacre, tapering to 0 at REACH
//   - an outward-travelling brightness pulse along the curve while fresh
//   - a PERMANENT scar state the tendril settles into (dark crimson, thin),
//     mirroring the scar dots — including year-end appearance for massacres
//     with an unknown exact date
// Per-frame cost is one uniform-block update plus a range-limited draw — no
// attribute touches, per the load-bearing scrubbing constraint in
// docs/stack-decision.md.
//
// Why a custom layer instead of LineLayer + a LayerExtension (the previous
// design): the memoria frame is vertex-bound. LineLayer draws every segment as
// a 4-vertex instance that projects BOTH endpoints, and every instance of the
// whole field is vertex-shaded every frame even when the shader then collapses
// it. The strip layout halves the invocations (2 per curve point instead of 4
// per segment), projects each point once, and — because tendrils.ts emits
// curves sorted by the day they first appear — each pass draws only the
// contiguous range that can be visible (scar = prefix, fresh = window), with
// the whole-curve cull done BEFORE any projection. Same shading maths, same
// colours, a few times less GPU work; visually the only delta is mitered joins
// where the old per-segment quads overlapped.
import { Layer, project32, picking } from '@deck.gl/core';
import type { LayerContext, UpdateParameters, DefaultProps } from '@deck.gl/core';
import { Model } from '@luma.gl/engine';
import { Buffer } from '@luma.gl/core';
import type { Device } from '@luma.gl/core';
import { WOUND_FADE_DAYS } from './memoria';
import {
  REACH_KM,
  VERTS_PER_CURVE,
  VERTEX_BYTES,
  DIST_MAX_KM,
  NEVER_U16,
  MITER_RANGE,
  lowerBound,
  upperBound,
  type TendrilField,
} from './tendrils';
import { drawRange } from './rangeDraw';

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
  /** packed strip field from tendrils.ts (named `field`, not `data`, so deck's
   * generic data plumbing — attribute generation, count() — stays idle) */
  field?: TendrilField;
  /** current memoria day (app.mday); the only required per-frame input */
  tendrilTime?: number;
  tendrilParams?: TendrilShaderParams;
  /** base stroke width in CSS px (the shader scales it by the taper profile) */
  baseWidth?: number;
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
  float baseWidthPx;
  float distMax;
  int enabledMask;
} tendril;
`;

const tendrilModule = {
  name: 'tendril',
  vs: uniformBlock,
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
    baseWidthPx: 'f32',
    distMax: 'f32',
    enabledMask: 'i32',
  },
  getUniforms: (
    opts?: { timeDay?: number; baseWidthPx?: number } & TendrilShaderParams
  ) => ({
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
    baseWidthPx: opts?.baseWidthPx ?? 1,
    distMax: DIST_MAX_KM,
    enabledMask: opts?.enabledMask ?? -1,
  }),
} as const;

// Attribute formats mirror the packed layout in tendrils.ts. Everything is
// declared float in the shader: non-normalized uint8/uint16 arrive as exact
// small integers (days, victims, modality, side), unorm16/snorm8 as [0,1]/[-1,1].
const vs = /* glsl */ `\
#version 300 es
#define SHADER_NAME tendril-layer-vertex-shader
in vec2 positions;
in vec2 distArc;
in vec2 days;
in float victims;
in vec2 miterNormal;
in float miterExtra;
in float modality;
in float side;
out float vAlpha;
out float vFresh;

void main(void) {
  float woundDay = days.x >= ${NEVER_U16 - 0.5} ? 1e9 : days.x;
  float scarDay = days.y;
  float tF = tendril.timeDay - woundDay;
  float env = step(0.0, tF)
    * (1.0 - smoothstep(tendril.fullDays, tendril.fadeDays, tF));
  // legend gate: hide curves whose modality checkbox is off
  int bit = 1 << int(modality + 0.5);
  float modOn = (tendril.enabledMask & bit) != 0 ? 1.0 : 0.0;
  float on = step(scarDay, tendril.timeDay) * modOn;
  // whole-curve cull BEFORE any projection: every vertex of a curve shares
  // these inputs, so the whole strip collapses together (the join vertices
  // are exact copies, so junction triangles stay zero-area)
  if (on < 0.5 || (tendril.scarMode < 0.5 && env <= 0.0)) {
    gl_Position = vec4(0.0);
    vAlpha = 0.0;
    vFresh = 0.0;
    return;
  }
  float victimW = sqrt(max(victims, 1.0));
  float reach = tendril.reachKm * (0.5 + 0.5 * min(victimW / tendril.victimNorm, 2.0));
  float dist = distArc.x * tendril.distMax;
  float arc = distArc.y * tendril.distMax;
  float nrm = clamp(dist / reach, 0.0, 1.0);
  // thickest at the wound centre, tapering to 0 at reach
  float taper = pow(1.0 - nrm, tendril.widthFalloff);
  float widthScale;
  float alpha;
  float fresh;
  if (tendril.scarMode > 0.5) {
    // permanent scar pass: thin, dark, NORMAL blending so any number of
    // overlapping strands composites to one ceiling alpha — every scar
    // settles to the same intensity regardless of how many victims fell.
    widthScale = on * taper * tendril.widthBoost * tendril.scarWidth;
    alpha = on * taper * tendril.scarAlpha;
    fresh = 0.0;
  } else {
    // fresh-flare pass: transient, ADDITIVE so dense/deadly wounds burn hot.
    float pd = (arc - tF * tendril.pulseSpeedKmPerDay) / tendril.pulseWidthKm;
    float pulse = exp(-pd * pd) * env;
    widthScale = on * taper * tendril.widthBoost * mix(tendril.scarWidth, 1.0, env);
    alpha = on * taper * env * (tendril.freshAlpha + tendril.pulseStrength * pulse);
    fresh = env;
  }
  // tapered-out vertex: zero WIDTH, never zero position — collapsing a single
  // vertex inside a live strip would stretch a sliver to the clip origin
  if (widthScale < 0.003) widthScale = 0.0;

  geometry.worldPosition = vec3(positions, 0.0);
  vec4 commonPos;
  vec4 clip = project_position_to_clipspace(vec3(positions, 0.0), vec3(0.0), vec3(0.0), commonPos);
  geometry.position = commonPos;
  // extrusion: the baked miter normal is a common-space (Mercator) direction;
  // through the view-projection it stays perpendicular under bearing/pitch
  vec4 nClip = project.viewProjectionMatrix * vec4(miterNormal, 0.0, 0.0);
  vec2 dirPx = normalize(nClip.xy * project.viewportSize);
  float miter = 1.0 + miterExtra * ${MITER_RANGE.toFixed(1)};
  float widthPx = tendril.baseWidthPx * widthScale;
  vec2 offsetPx = dirPx * (side * 2.0 - 1.0) * widthPx * 0.5 * miter;
  gl_Position = clip + vec4(project_pixel_size_to_clipspace(offsetPx), 0.0, 0.0);
  vAlpha = alpha;
  vFresh = fresh;
}
`;

const fs = /* glsl */ `\
#version 300 es
#define SHADER_NAME tendril-layer-fragment-shader
precision highp float;
in float vAlpha;
in float vFresh;
out vec4 fragColor;

void main(void) {
  // fresh: bright wound red (#ff3a1c); scar: the scar dots' dark crimson (#601016)
  vec3 rgb = mix(vec3(0.376, 0.063, 0.086), vec3(1.0, 0.227, 0.110), vFresh);
  float a = clamp(vAlpha * layer.opacity, 0.0, 1.0);
  if (a < 0.004) discard;
  fragColor = vec4(rgb, a);
  DECKGL_FILTER_COLOR(fragColor, geometry);
}
`;

// One GPU buffer per field, shared by its scar and fresh layers (the two
// passes of the same geometry), refcounted so the upload happens once and is
// freed when the last layer using it is finalized or swaps data.
interface SharedBuffer {
  buffer: Buffer;
  device: Device;
  refs: number;
}
const bufferCache = new WeakMap<TendrilField, SharedBuffer>();

function acquireBuffer(device: Device, field: TendrilField): Buffer {
  let entry = bufferCache.get(field);
  if (!entry || entry.device !== device) {
    const buffer = device.createBuffer({
      id: 'tendril-field',
      usage: Buffer.VERTEX,
      data: new Uint8Array(field.bytes),
    });
    entry = { buffer, device, refs: 0 };
    bufferCache.set(field, entry);
  }
  entry.refs++;
  return entry.buffer;
}

function releaseBuffer(field: TendrilField | undefined): void {
  if (!field) return;
  const entry = bufferCache.get(field);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    entry.buffer.destroy();
    bufferCache.delete(field);
  }
}

const defaultProps: DefaultProps<TendrilLayerProps> = {
  // identity compare: a field swap (debug-panel rebuild, tier demotion) must
  // reach updateState, but never deep-compare a 100+ MB buffer per frame
  field: { type: 'object', value: undefined as unknown as TendrilField, optional: true, compare: false },
  tendrilTime: { type: 'number', value: 0 },
  tendrilParams: { type: 'object', value: {}, compare: true },
  baseWidth: { type: 'number', value: 1, min: 0 },
};

type State = { model?: Model; field?: TendrilField; buffer?: Buffer };

export class TendrilLayer extends Layer<TendrilLayerProps> {
  static override layerName = 'TendrilLayer';
  static override defaultProps = defaultProps;

  declare state: State;

  override getShaders() {
    return super.getShaders({ vs, fs, modules: [project32, picking, tendrilModule] });
  }

  // no per-instance attributes: the vertex buffer is managed directly
  override getNumInstances(): number {
    return 0;
  }

  override initializeState(_context: LayerContext): void {
    this.state = {};
  }

  override updateState(params: UpdateParameters<this>): void {
    super.updateState(params);
    const { changeFlags } = params;
    if (changeFlags.extensionsChanged) {
      this.state.model?.destroy();
      this.state.model = this._getModel();
      if (this.state.buffer) this.state.model.setAttributes({ tendril: this.state.buffer });
    }
    const field = this.props.field;
    if (field !== this.state.field) {
      releaseBuffer(this.state.field);
      this.state.field = field;
      this.state.buffer = field && field.vertexCount > 0
        ? acquireBuffer(this.context.device, field)
        : undefined;
      if (this.state.buffer && this.state.model) {
        this.state.model.setAttributes({ tendril: this.state.buffer });
      }
    }
  }

  override finalizeState(context: LayerContext): void {
    super.finalizeState(context);
    releaseBuffer(this.state.field);
    this.state.field = undefined;
    this.state.buffer = undefined;
    this.state.model?.destroy();
    this.state.model = undefined;
  }

  override draw(): void {
    const { model, field, buffer } = this.state;
    if (!model || !field || !buffer) return;
    const timeDay = this.props.tendrilTime ?? 0;
    const params = this.props.tendrilParams ?? {};
    const scar = (params.scarMode ?? 0) > 0.5;
    const fade = params.fadeDays ?? WOUND_FADE_DAYS;
    // curves are sorted by appearDay: scar pass = prefix that has appeared,
    // fresh pass = the window still inside the fade envelope (the shader cuts
    // both exactly; these are superset bounds on what can be visible)
    const hi = upperBound(field.appearDay, timeDay, 0, field.nCurves);
    const lo = scar ? 0 : lowerBound(field.appearDay, timeDay - fade, 0, hi);
    if (hi <= lo) return;
    model.shaderInputs.setProps({
      tendril: { timeDay, ...params, baseWidthPx: this.props.baseWidth ?? 1 },
    });
    drawRange(
      model,
      this.context.renderPass,
      lo * VERTS_PER_CURVE,
      (hi - lo) * VERTS_PER_CURVE,
      false
    );
  }

  private _getModel(): Model {
    return new Model(this.context.device, {
      ...this.getShaders(),
      id: this.props.id,
      topology: 'triangle-strip',
      isInstanced: false,
      vertexCount: 0,
      bufferLayout: [
        {
          name: 'tendril',
          byteStride: VERTEX_BYTES,
          attributes: [
            { attribute: 'positions', format: 'float32x2', byteOffset: 0 },
            { attribute: 'distArc', format: 'unorm16x2', byteOffset: 8 },
            { attribute: 'days', format: 'uint16x2', byteOffset: 12 },
            { attribute: 'victims', format: 'uint16', byteOffset: 16 },
            { attribute: 'miterNormal', format: 'snorm8x2', byteOffset: 18 },
            { attribute: 'miterExtra', format: 'unorm8', byteOffset: 20 },
            { attribute: 'modality', format: 'uint8', byteOffset: 21 },
            { attribute: 'side', format: 'uint8', byteOffset: 22 },
          ],
        },
      ],
    });
  }
}
