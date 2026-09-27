// 03 §14 glb optimiser + budget report (P2-09 #1).
//   node tools/assets/optimize.mjs <in.glb> [out.glb]   dedup → weld → meshopt (quantised), then report
//   node tools/assets/optimize.mjs --report <file.glb>  report only
// Exits non-zero when a node is over its triangle budget, lacks COLOR_0, or the file exceeds 1.5 MB.
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

/** 03 §14 面数预算 (plot/rim/bee share tools/assets/budget.ts's numbers). */
const MAX_BYTES = 1.5 * 1024 * 1024;
function budgetFor(name) {
  const crop = /^crop_\w+_s([012])$/.exec(name);
  if (crop) return [800, 1200, 1500][Number(crop[1])];
  if (name === 'plot_dish') return 800;
  if (name.startsWith('marker_') || name === 'rim_ripe') return 600;
  return 5000;
}

const args = process.argv.slice(2);
const reportOnly = args[0] === '--report';
const [input, output = input] = reportOnly ? args.slice(1) : args;
if (!input) {
  console.error('usage: optimize.mjs <in.glb> [out.glb] | --report <file.glb>');
  process.exit(2);
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);

if (!reportOnly) {
  // Degenerate triangles are kept so counts stay identical to the procedural originals (swap parity test).
  // Colours get 12 bits (uint16): 8-bit linear colour bands visibly in the dark soil/charcoal tones.
  await doc.transform(dedup(), prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizeColor: 12 }));
  await io.write(output, doc);
}

let bad = 0;
let total = 0;
const rows = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  let tris = 0;
  let colour = true;
  for (const p of mesh.listPrimitives()) {
    tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    colour &&= !!p.getAttribute('COLOR_0');
  }
  const name = node.getName();
  const budget = budgetFor(name);
  const flags = [
    tris > budget && '✗ over budget',
    !colour && '✗ no COLOR_0',
    mesh.listPrimitives().length > 1 && '✗ >1 primitive',
  ]
    .filter(Boolean)
    .join(' ');
  if (flags) bad++;
  total += tris;
  rows.push(`| ${name} | ${tris} | ≤ ${budget} | ${flags} |`);
}
const bytes = statSync(reportOnly ? input : output).size;
console.log(`| 节点 | 三角形 | 预算 | |\n|---|---|---|---|\n${rows.join('\n')}`);
console.log(
  `\n${reportOnly ? input : output}: ${rows.length} nodes, ${total} triangles, ${(bytes / 1024).toFixed(1)} KB (≤ ${MAX_BYTES / 1024} KB)`,
);
if (bytes > MAX_BYTES) {
  console.error('✗ file over the 1.5 MB crop-asset budget');
  bad++;
}
if (bad) process.exit(1);
