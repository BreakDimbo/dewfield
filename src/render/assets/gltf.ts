import { BufferAttribute, BufferGeometry, type Mesh, type Object3D } from 'three';

/**
 * 03 §14 glb path: a glTF file → one baked, float, vertex-coloured BufferGeometry per named node, so every
 * manifest id drops into the shared vertex-colour material exactly like its greybox twin. Node transforms
 * (incl. KHR_mesh_quantization offsets/scales) are baked in; only POSITION / NORMAL / COLOR_0 are kept.
 */

/** Authoring contract (03 §14): these must exist on every mesh node. */
const KEEP = ['position', 'normal', 'color'] as const;

function toFloat(a: BufferGeometry['attributes'][string]): BufferAttribute {
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
  return new BufferAttribute(out, a.itemSize);
}

function bake(mesh: Mesh): BufferGeometry {
  const src = mesh.geometry;
  if (!src.getAttribute('color')) {
    throw new Error(
      `glTF node "${mesh.name}" has no COLOR_0 — field art must carry vertex colours (03 §14)`,
    );
  }
  const g = new BufferGeometry();
  for (const k of KEEP) {
    const a = src.getAttribute(k);
    if (a) g.setAttribute(k, toFloat(a));
  }
  if (src.index) g.setIndex(Array.from(src.index.array));
  g.applyMatrix4(mesh.matrixWorld);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Every named single-primitive mesh node in the scene, keyed by node name. */
export function extractNodes(scene: Object3D): Map<string, BufferGeometry> {
  scene.updateMatrixWorld(true);
  const out = new Map<string, BufferGeometry>();
  scene.traverse((o) => {
    if ((o as Mesh).isMesh && o.name) out.set(o.name, bake(o as Mesh));
  });
  return out;
}

/** Parse a .glb buffer (meshopt-compressed or not). Works in the browser and in Node (tests, tools). */
export async function parseGlb(data: ArrayBuffer): Promise<Map<string, BufferGeometry>> {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(data, '');
  return extractNodes(gltf.scene);
}

export async function loadGlb(url: string): Promise<Map<string, BufferGeometry>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return parseGlb(await res.arrayBuffer());
}
