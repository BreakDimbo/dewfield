import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Mesh, MeshStandardMaterial, Scene } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { assetList, geometryOf, manifestFor } from '../../src/render/assets/manifest';

/**
 * P2-09: bake the procedural field set (every manifest id) into an unoptimised glb, which `pnpm assets:models`
 * then runs through optimize.mjs into public/models/field.glb — the reference file an artist replaces, and the
 * proof that the glb path is geometry-identical to greybox.
 */

// GLTFExporter's binary path reads Blobs through FileReader, which Node lacks. Blob itself is native.
class NodeFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
}
(globalThis as { FileReader?: unknown }).FileReader ??= NodeFileReader;

const out = resolve(process.argv[2] ?? 'node_modules/.cache/dewfield/field.raw.glb');
const scene = new Scene();
// → scenes[0].extras: tells field-glb.test.ts this file must match greybox exactly (hand-made art need not).
scene.userData = { source: 'greybox' };
// Vertex colours carry all shading; the material is a placeholder (the runtime uses one shared material).
const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
material.name = 'vertex_colour';
for (const { id, src } of assetList(manifestFor('greybox'))) {
  const mesh = new Mesh(geometryOf(src), material);
  mesh.name = id;
  scene.add(mesh);
}

// Lathe poles carry zero-length normals on degenerate triangles; the exporter fixes those — say so once.
const warn = console.warn;
let fixedNormals = 0;
console.warn = (...a: unknown[]) => (String(a[0]).includes('normalized normal') ? fixedNormals++ : warn(...a));
const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
console.warn = warn;
if (fixedNormals)
  console.log(`normalised normals on ${fixedNormals} geometries (zero-length ones on degenerate triangles)`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, new Uint8Array(glb));
console.log(`${out}: ${scene.children.length} nodes, ${(glb.byteLength / 1024).toFixed(1)} KB (raw)`);
