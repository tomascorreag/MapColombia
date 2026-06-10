// Continuous political-field mesh: one indexed triangle list over municipio
// centroids. Each vertex carries (score, alphaFactor); the GPU interpolates
// the SCALAR field and the fragment shader applies the diverging ramp
// per-pixel — yellow (left) <-> blue (right) with a transparent centre, so a
// centre vote reads as absence of tilt. Interpolating the score (not RGB)
// avoids muddy colour lerps between opposing municipios.
//
// Geometry is built once (Delaunay over centroids); only the small
// `fieldValues` attribute re-uploads, on the existing 15-sim-day colour
// bucket. The fragment shader calls DECKGL_FILTER_COLOR, so MaskExtension
// clips the Delaunay hull's overshoot back to the country silhouette.
import { Layer, project32 } from '@deck.gl/core';
import type { DefaultProps, LayerProps, UpdateParameters } from '@deck.gl/core';
import { Model } from '@luma.gl/engine';

export interface FieldMesh {
  length: number; // vertex count (pass the mesh as `data` too: deck reads .length)
  positions: Float32Array; // [lon, lat] per vertex; vertex i == muni index i
  indices: Uint32Array; // triangle list from Delaunay
}

type FieldMeshLayerProps = LayerProps & {
  mesh: FieldMesh;
  // per vertex [score in [-1,1] (0 when no data), alphaFactor in [0,1]
  // (0 = no data, dimmed when coverage < 50%)] — see fieldMeshValues().
  // NOT named after the `fieldValues` attribute: deck's AttributeManager
  // throws on any layer prop sharing an attribute's name.
  field: Float32Array;
  // MaskExtension props (the extension's defaultProps are merged at runtime;
  // declared here so the constructor call typechecks)
  maskId?: string;
  maskByInstance?: boolean;
};

const vs = `\
#version 300 es
#define SHADER_NAME field-mesh-layer-vertex-shader
in vec2 positions;
in vec2 fieldValues;
out vec2 vField;

void main(void) {
  geometry.worldPosition = vec3(positions, 0.0);
  vec4 commonPosition;
  gl_Position = project_position_to_clipspace(
    vec3(positions, 0.0), vec3(0.0), vec3(0.0), commonPosition);
  geometry.position = commonPosition;
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
  vField = fieldValues;
}
`;

const fs = `\
#version 300 es
#define SHADER_NAME field-mesh-layer-fragment-shader
precision highp float;
in vec2 vField;
out vec4 fragColor;

const vec3 LEFT_YELLOW = vec3(0.914, 0.769, 0.271);
const vec3 RIGHT_BLUE = vec3(0.251, 0.463, 0.839);
const float MAX_ALPHA = 0.82;

void main(void) {
  geometry.uv = vec2(0.0);
  float s = clamp(vField.x, -1.0, 1.0);
  // hue crossfade only matters near 0 where alpha is ~0 anyway; keep it tight
  vec3 rgb = mix(LEFT_YELLOW, RIGHT_BLUE, smoothstep(-0.12, 0.12, s));
  // centre vote -> transparent; gamma keeps moderate scores visible
  float a = vField.y * pow(abs(s), 0.65) * MAX_ALPHA * layer.opacity;
  fragColor = vec4(rgb, a);
  DECKGL_FILTER_COLOR(fragColor, geometry);
}
`;

const defaultProps: DefaultProps<FieldMeshLayerProps> = {};

export class FieldMeshLayer extends Layer<FieldMeshLayerProps> {
  static layerName = 'FieldMeshLayer';
  static defaultProps = defaultProps;

  declare state: { model?: Model };

  getShaders() {
    return super.getShaders({ vs, fs, modules: [project32] });
  }

  initializeState() {
    const attributeManager = this.getAttributeManager()!;
    // Not pickable (an invisible polygon layer handles per-muni hover);
    // drop the auto-added instanced picking attribute on this vertex model.
    attributeManager.remove(['instancePickingColors']);
    attributeManager.add({
      indices: {
        size: 1,
        isIndexed: true,
        noAlloc: true,
        update: (attribute) => {
          attribute.value = this.props.mesh.indices;
        },
      },
      positions: {
        size: 2,
        noAlloc: true,
        update: (attribute) => {
          attribute.value = this.props.mesh.positions;
        },
      },
      fieldValues: {
        size: 2,
        noAlloc: true,
        update: (attribute) => {
          attribute.value = this.props.field;
        },
      },
    });
  }

  updateState(params: UpdateParameters<this>) {
    super.updateState(params);
    const { props, oldProps, changeFlags } = params;
    const attributeManager = this.getAttributeManager()!;
    if (changeFlags.extensionsChanged) {
      this.state.model?.destroy();
      this.state.model = this._getModel();
      attributeManager.invalidateAll();
      return;
    }
    if (props.mesh !== oldProps.mesh) {
      attributeManager.invalidate('indices');
      attributeManager.invalidate('positions');
    }
    if (props.field !== oldProps.field) {
      attributeManager.invalidate('fieldValues');
    }
  }

  draw() {
    const model = this.state.model!;
    model.setVertexCount(this.props.mesh.indices.length);
    model.draw(this.context.renderPass);
  }

  _getModel(): Model {
    return new Model(this.context.device, {
      ...this.getShaders(),
      id: this.props.id,
      bufferLayout: this.getAttributeManager()!.getBufferLayouts({ isInstanced: false }),
      topology: 'triangle-list',
      isIndexed: true,
      isInstanced: false,
      vertexCount: 0,
    });
  }
}
