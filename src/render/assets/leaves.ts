import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Leaf outline: width (0–1 of max) along the blade, t = 0 at the base, 1 at the tip. */
export type LeafShape = 'oval' | 'lance' | 'strap' | 'round';

const OUTLINE: Record<LeafShape, (t: number) => number> = {
  /** Broad middle, rounded base (eggplant, blueberry, tomato leaflets). */
  oval: (t) => Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)) ** 0.75,
  /** Narrow and pointed (carrot leaflets, tomato cotyledons). */
  lance: (t) => Math.sin(Math.PI * t) ** 1.3 * (1 - 0.25 * t),
  /** Long even width, pointed tip (corn blades, husks). */
  strap: (t) => Math.min(1, 1.6 * Math.sin(Math.PI * Math.min(t, 0.999)) ** 0.5) * (1 - t ** 3),
  /** Almost circular (young seed leaves). */
  round: (t) => Math.sin(Math.PI * t) ** 0.6,
};

export interface LeafSpec {
  length: number;
  width: number;
  shape?: LeafShape;
  /** Bend along the blade in radians (positive droops the tip towards the leaf's front). */
  curl?: number;
  /** V-fold along the midrib, as a fraction of the half-width. */
  fold?: number;
  segments?: number;
  top: Color;
  under: Color;
}

/**
 * A curved, midrib-folded leaf blade: grows along +Y from the origin, faces +Z, width along X.
 * Both faces are real triangles (the tiles' shared material is single-sided): the front is `top`, the back is
 * `under`, and the tip is a little lighter than the base. Non-indexed, with normals and RGB colours.
 */
export function leafBlade(spec: LeafSpec): BufferGeometry {
  const { length, width, shape = 'oval', curl = 0.5, fold = 0.3, segments = 6, top, under } = spec;
  const w = OUTLINE[shape];
  const pos: number[] = [];
  const ts: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = curl * t;
    const R = Math.abs(curl) < 1e-3 ? 0 : length / curl;
    const cy = R ? R * Math.sin(a) : length * t;
    const cz = R ? R * (1 - Math.cos(a)) : 0;
    // The blade's front normal rotates with the bend; edges lift towards it (a shallow midrib valley).
    const ny = -Math.sin(a);
    const nz = Math.cos(a);
    const half = (width / 2) * w(t);
    const lift = fold * half;
    for (const side of [-1, 0, 1]) {
      const k = side === 0 ? 0 : lift;
      pos.push(side * half, cy + ny * k, cz + nz * k);
      ts.push(t);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < segments; i++)
    for (let c = 0; c < 2; c++) {
      const a = i * 3 + c;
      const b = a + 1;
      const d = a + 3;
      const e2 = b + 3;
      index.push(a, b, e2, a, e2, d);
    }
  const front = new BufferGeometry();
  front.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  front.setIndex(index);
  front.computeVertexNormals();
  const tint = (c: Color, t: number) => c.clone().lerp(new Color('#FFFFFF'), 0.18 * t);
  const colour = (g: BufferGeometry, c: Color) => {
    const col = new Float32Array(ts.length * 3);
    ts.forEach((t, k) => {
      const v = tint(c, t);
      col.set([v.r, v.g, v.b], k * 3);
    });
    g.setAttribute('color', new BufferAttribute(col, 3));
  };
  const back = front.clone();
  back.setIndex(index.map((_, k) => index[k - (k % 3) + (2 - (k % 3))]!));
  const n = back.getAttribute('normal');
  for (let k = 0; k < n.count; k++) n.setXYZ(k, -n.getX(k), -n.getY(k), -n.getZ(k));
  colour(front, top);
  colour(back, under);
  const out = mergeGeometries([front.toNonIndexed(), back.toNonIndexed()], false);
  if (!out) throw new Error('leafBlade merge failed');
  return out;
}

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();

/**
 * Place a blade: `yaw` turns it around the stem (0 = facing +Z), `pitch` tilts it away from vertical
 * (0 = upright, π/2 = flat), `roll` twists it about its own axis; `at` is where its base attaches.
 */
export function placeLeaf(
  g: BufferGeometry,
  at: [number, number, number],
  yaw: number,
  pitch: number,
  roll = 0,
): BufferGeometry {
  q.setFromEuler(e.set(pitch, yaw, roll, 'YXZ'));
  m4.compose(new Vector3(...at), q, new Vector3(1, 1, 1));
  g.applyMatrix4(m4);
  return g;
}
