// Range-limited draws for deck.gl/luma.gl models: draw only vertices (or
// instances) [first, first+count) of a model whose data is SORTED so that the
// visible set at a given time is contiguous. The vertex shader still culls
// exactly (this is a superset bound), but the GPU no longer runs it over the
// whole buffer — the memoria scene's frame cost is vertex-bound (millions of
// tendril strip vertices + wound sprites per frame), so skipping dead geometry
// at the draw call is the main lever on weak GPUs (docs/stack-decision.md).
//
// luma's Model.draw has no firstVertex/firstInstance, and re-laying-out the
// buffers through deck's attribute path rebuilds the VAO + pipeline per frame
// (offset counts as a layout change). So the offset is applied directly on the
// model's WebGL vertex array: every buffer-backed attribute pointer of the
// matching step mode is re-pointed to `byteOffset + first * byteStride` right
// before the draw. This touches luma 9.x internals (`vertexArray.handle`,
// `attributeInfos`, `attributes`, `buffer.handle`) — all guarded: if any is
// missing the helper falls back to a PREFIX draw of `first + count` from 0,
// which renders the same pixels (the shader culls) and only loses the saving.
// Pointers are re-applied every draw (deck re-binds them on attribute updates),
// so there is no stale-offset state to track.
import type { Model } from '@luma.gl/engine';
import type { RenderPass } from '@luma.gl/core';
import { ScatterplotLayer } from '@deck.gl/layers';
import { UNIT } from '@deck.gl/core';

const GL_ARRAY_BUFFER = 0x8892;
// luma NormalizedDataType → GL vertex attrib type
const GL_TYPE: Record<string, number> = {
  uint8: 0x1401,
  sint8: 0x1400,
  unorm8: 0x1401,
  snorm8: 0x1400,
  uint16: 0x1403,
  sint16: 0x1402,
  unorm16: 0x1403,
  snorm16: 0x1402,
  uint32: 0x1405,
  sint32: 0x1404,
  float16: 0x140b,
  float32: 0x1406,
};

interface AttrInfo {
  bufferDataType: string;
  bufferComponents: number;
  byteStride: number;
  byteOffset: number;
  normalized: boolean;
  integer: boolean;
  stepMode: 'vertex' | 'instance';
}

/** Re-point the model's buffer attributes to element `first` (vertex or
 * instance, by step mode) and draw `count` elements. */
export function drawRange(
  model: Model,
  renderPass: RenderPass,
  first: number,
  count: number,
  instanced: boolean
): void {
  if (count <= 0) return;
  const va = model.vertexArray as unknown as {
    handle?: WebGLVertexArrayObject;
    attributeInfos?: (AttrInfo | undefined)[];
    attributes?: (unknown | null)[];
  };
  const gl = (model.device as unknown as { gl?: WebGL2RenderingContext }).gl;
  const step = instanced ? 'instance' : 'vertex';
  const canOffset =
    !!gl && !!va?.handle && Array.isArray(va.attributeInfos) && Array.isArray(va.attributes);
  let drawCount = count;
  if (canOffset) {
    gl.bindVertexArray(va.handle!);
    for (let loc = 0; loc < va.attributes!.length; loc++) {
      const buf = va.attributes![loc] as { handle?: WebGLBuffer } | null;
      const info = va.attributeInfos![loc];
      // typed-array entries are constant attributes; skip those and any
      // attribute stepping the other way (a quad's corner positions must not
      // move with the instance offset)
      if (!buf || ArrayBuffer.isView(buf) || !buf.handle || !info || info.stepMode !== step) {
        continue;
      }
      const type = GL_TYPE[info.bufferDataType];
      if (type === undefined) continue;
      const offset = info.byteOffset + first * info.byteStride;
      gl.bindBuffer(GL_ARRAY_BUFFER, buf.handle);
      if (info.integer) {
        gl.vertexAttribIPointer(loc, info.bufferComponents, type, info.byteStride, offset);
      } else {
        gl.vertexAttribPointer(
          loc,
          info.bufferComponents,
          type,
          info.normalized,
          info.byteStride,
          offset
        );
      }
    }
    gl.bindBuffer(GL_ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  } else {
    drawCount = first + count; // prefix fallback: same pixels, no saving
  }
  if (instanced) model.setInstanceCount(drawCount);
  else model.setVertexCount(drawCount);
  model.draw(renderPass);
}

export type InstanceRange = [first: number, count: number];

/** ScatterplotLayer that draws only instances `instanceRange` = [first, count)
 * of its (pre-sorted) data. Picking colours are part of the offset buffers, so
 * `info.index` stays the original index into `data`. */
export type RangedProps = { instanceRange?: InstanceRange | null };

// generics mirror ScatterplotLayer's so extension props (filterRange, …) keep
// inferring from the constructor argument as they do for the parent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class RangedScatterplotLayer<DataT = any, ExtraPropsT extends {} = {}> extends ScatterplotLayer<
  DataT,
  ExtraPropsT & RangedProps
> {
  static override layerName = 'RangedScatterplotLayer';
  static override defaultProps = {
    ...ScatterplotLayer.defaultProps,
    instanceRange: { type: 'array', value: null, optional: true, compare: true },
  };

  // Mirrors ScatterplotLayer.draw (deck 9.3) — same uniforms, ranged draw call.
  override draw(): void {
    const {
      radiusUnits,
      radiusScale,
      radiusMinPixels,
      radiusMaxPixels,
      stroked,
      filled,
      billboard,
      antialiasing,
      lineWidthUnits,
      lineWidthScale,
      lineWidthMinPixels,
      lineWidthMaxPixels,
    } = this.props;
    const model = this.state.model as Model;
    model.shaderInputs.setProps({
      scatterplot: {
        stroked,
        filled,
        billboard,
        antialiasing,
        radiusUnits: UNIT[radiusUnits],
        radiusScale,
        radiusMinPixels,
        radiusMaxPixels,
        lineWidthUnits: UNIT[lineWidthUnits],
        lineWidthScale,
        lineWidthMinPixels,
        lineWidthMaxPixels,
      },
    });
    const n = this.getNumInstances();
    const r = this.props.instanceRange;
    const first = r ? Math.max(0, Math.min(n, r[0])) : 0;
    const count = r ? Math.max(0, Math.min(n - first, r[1])) : n;
    drawRange(model, this.context.renderPass, first, count, true);
  }
}
