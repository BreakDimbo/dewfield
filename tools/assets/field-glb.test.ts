import { readFileSync } from 'node:fs';
import { Box3, type BufferGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { parseGlb } from '../../src/render/assets/gltf';
import { assetList, geometryOf, manifestFor } from '../../src/render/assets/manifest';

/** P2-09 #3 swap parity: public/models/field.glb, loaded through the runtime glb path, matches greybox id for id. */

const tris = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

/** Surface area and area-weighted mean colour — order-independent, so they survive weld + meshopt reordering. */
function surface(g: BufferGeometry) {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const idx = (i: number) => (g.index ? g.index.getX(i) : i);
  const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
  let area = 0;
  const rgb = [0, 0, 0];
  for (let t = 0; t < tris(g); t++) {
    const v = [idx(t * 3), idx(t * 3 + 1), idx(t * 3 + 2)];
    a.fromBufferAttribute(pos, v[0]!);
    b.fromBufferAttribute(pos, v[1]!);
    c.fromBufferAttribute(pos, v[2]!);
    const s = b.sub(a).cross(c.sub(a)).length() / 2;
    area += s;
    for (let k = 0; k < 3; k++) rgb[k]! += (s * v.reduce((acc, i) => acc + col.getComponent(i, k), 0)) / 3;
  }
  return { area, rgb: rgb.map((x) => x / area) };
}

const glb = readFileSync(new URL('../../public/models/field.glb', import.meta.url));
const nodes = await parseGlb(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength));
/** GLB = 12-byte header, then the JSON chunk (length, type, bytes). */
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as {
  scenes?: { extras?: { source?: string } }[];
};
/** Set by export-greybox.ts; hand-made art only has to satisfy the contract above, not match greybox. */
const fromGreybox = json.scenes?.[0]?.extras?.source === 'greybox';

describe('public/models/field.glb (P2-09)', () => {
  const greybox = assetList(manifestFor('greybox'));

  it.each(assetList(manifestFor('glb')))('$id: glb manifest node exists with COLOR_0', ({ src }) => {
    expect(src.kind).toBe('gltf');
    if (src.kind !== 'gltf') return;
    const g = nodes.get(src.node);
    expect(g, `node ${src.node} missing`).toBeDefined();
    expect(g!.getAttribute('color'), 'COLOR_0').toBeDefined();
  });

  it.runIf(fromGreybox).each(greybox)('$id: swap parity with the procedural original', ({ id, src }) => {
    const g = nodes.get(id)!;
    const ref = geometryOf(src);
    expect(tris(g)).toBe(tris(ref));
    const [box, refBox] = [new Box3().setFromBufferAttribute(g.getAttribute('position') as never), new Box3()];
    refBox.setFromBufferAttribute(ref.getAttribute('position') as never);
    for (const k of ['min', 'max'] as const) expect(box[k].distanceTo(refBox[k])).toBeLessThan(2e-3);
    const [s, r] = [surface(g), surface(ref)];
    expect(Math.abs(s.area - r.area) / r.area).toBeLessThan(5e-3);
    for (let k = 0; k < 3; k++) expect(Math.abs(s.rgb[k]! - r.rgb[k]!)).toBeLessThan(5e-4);
  });
});
