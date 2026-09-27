import { Color, Vector3, type MeshStandardMaterial } from 'three';

/**
 * Crop material classes, stored in the alpha of the crops' RGBA vertex colour (COLOR_0.a in field.glb).
 * Anything without vertex alpha (dish, rim, markers, bee) renders as plain MeshStandardMaterial.
 * Values are spaced so 12-bit quantisation in optimize.mjs cannot move one class into another.
 */
export const CROP_MAT = { leaf: 0.25, dusty: 0.5, gloss: 0.75, body: 1 } as const;
export type CropMat = keyof typeof CROP_MAT;

/** Shared, per-frame uniforms (FieldView and LightingRig write them; every tile reads the same objects). */
export const cropUniforms = {
  uTime: { value: 0 },
  /** 1 = gentle leaf sway; 0 under reduced motion (RD-8). */
  uWind: { value: 1 },
  /** Direction towards the sun, view space. */
  uSunView: { value: new Vector3(0, 1, 0) },
  uSunColor: { value: new Color('#FFF0D8') },
  uRimColor: { value: new Color('#FFF4DE') },
  uRim: { value: 0.25 },
};

const VERT_HEAD = /* glsl */ `
uniform float uTime;
uniform float uWind;
`;

/** Leaves sway around their base, more towards the tip; each tile gets its own phase from its world position. */
const VERT_SWAY = /* glsl */ `
#include <begin_vertex>
#ifdef USE_COLOR_ALPHA
  if (color.a < 0.37) {
    vec2 tile = vec2(modelMatrix[3].x, modelMatrix[3].z);
    float phase = dot(tile, vec2(1.7, 2.3));
    float tip = smoothstep(0.12, 0.9, position.y);
    float sway = sin(uTime * 1.6 + phase) + 0.35 * sin(uTime * 3.1 + phase * 1.7);
    transformed.x += uWind * 0.018 * tip * sway;
    transformed.z += uWind * 0.012 * tip * cos(uTime * 1.3 + phase);
  }
#endif
`;

const FRAG_HEAD = /* glsl */ `
uniform vec3 uSunView;
uniform vec3 uSunColor;
uniform vec3 uRimColor;
uniform float uRim;
`;

/** Vertex alpha is a material mask, never opacity: keep diffuse alpha at 1. */
const FRAG_COLOR = /* glsl */ `
#if defined( USE_COLOR_ALPHA )
  diffuseColor.rgb *= vColor.rgb;
  float cropMat = vColor.a;
#elif defined( USE_COLOR )
  diffuseColor *= vColor;
#endif
`;

/** gloss: waxy skin (tomato, eggplant); dusty: blueberry bloom, corn silk; leaf: soft matte. */
const FRAG_ROUGHNESS = /* glsl */ `
#include <roughnessmap_fragment>
#ifdef USE_COLOR_ALPHA
  roughnessFactor = cropMat > 0.87 ? roughnessFactor : cropMat > 0.62 ? 0.3 : cropMat > 0.37 ? 0.88 : 0.72;
#endif
`;

/**
 * Soft warm rim (01 §13.1 "柔光玻璃": outlines each crop against the soil) and leaf translucency: leaves glow
 * when the sun is behind them relative to the camera, plus a little wrap light on their shaded side.
 */
const FRAG_OUT = /* glsl */ `
#ifdef USE_COLOR_ALPHA
  {
    vec3 V = normalize(vViewPosition);
    float fres = pow(1.0 - saturate(dot(normal, V)), 3.0);
    bool isLeaf = cropMat < 0.37;
    outgoingLight += uRimColor * fres * uRim * (isLeaf ? 0.5 : 1.0);
    if (isLeaf) {
      vec3 L = normalize(uSunView);
      float back = pow(saturate(dot(-V, L)), 2.0);
      float wrap = saturate(-dot(normal, L));
      outgoingLight += diffuseColor.rgb * uSunColor * (0.45 * back + 0.18 * wrap);
    }
  }
#endif
#include <opaque_fragment>
`;

/** Patch the tiles' shared MeshStandardMaterial once. Still one material, one draw call per tile. */
export function applyCropShading(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, cropUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', VERT_SWAY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGHNESS)
      .replace('#include <opaque_fragment>', FRAG_OUT);
  };
  material.customProgramCacheKey = () => 'crop-shading-v1';
}
