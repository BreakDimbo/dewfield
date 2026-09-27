import {
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CropSpecial, Stage } from '@/core/board/model';
import type { CropId } from '@/core/config/crops';
import { CROP_MAT, type CropMat } from '@/render/field/cropShading';
import { leafBlade, placeLeaf, type LeafSpec } from './leaves';
import { PAL, cropColor, leafColor } from './palette';

/** 03 §14 greybox generator: one merged, vertex-coloured geometry per (crop, stage) → 1 draw call per tile. */

const m4 = new Matrix4();
const q = new Quaternion();
const eul = new Euler();

export function part(
  geo: BufferGeometry,
  color: Color | string | ((p: Vector3) => Color),
  at: { p?: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] } = {},
): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  q.setFromEuler(eul.set(at.r?.[0] ?? 0, at.r?.[1] ?? 0, at.r?.[2] ?? 0));
  m4.compose(new Vector3(...(at.p ?? [0, 0, 0])), q, new Vector3(...(at.s ?? [1, 1, 1])));
  g.applyMatrix4(m4);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const c = typeof color === 'function' ? color(v) : new Color(color);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

/**
 * Baked ambient occlusion into vertex colours (01 §13.4, zero runtime cost). Every part's bounding sphere is an
 * occluder for the other parts (analytic sphere occlusion: cosθ · r² / d²), plus a contact term near the soil.
 * Crevices — calyx on fruit, leaf bases, berry joins, the underside at the soil — darken; open surfaces keep
 * their authored colour.
 */
export function bakeAO(parts: BufferGeometry[], strength = 0.9, floor = 0.55): void {
  const spheres = parts.map((g) => {
    g.computeBoundingSphere();
    return g.boundingSphere!;
  });
  const p = new Vector3();
  const n = new Vector3();
  const d = new Vector3();
  parts.forEach((g, i) => {
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const col = g.getAttribute('color');
    for (let k = 0; k < pos.count; k++) {
      p.fromBufferAttribute(pos, k);
      n.fromBufferAttribute(nor, k).normalize();
      let occ = 0;
      spheres.forEach((sph, j) => {
        if (j === i || sph.radius < 0.02) return;
        d.subVectors(sph.center, p);
        const l = Math.max(d.length(), sph.radius * 1.05);
        occ += (Math.max(0, n.dot(d) / l) * (sph.radius * sph.radius)) / (l * l);
      });
      // Contact with the soil: the lowest few centimetres, more so on surfaces facing down or sideways.
      occ += Math.max(0, 1 - p.y / 0.1) * (0.6 - 0.4 * n.y);
      const k2 = Math.max(floor, 1 - strength * Math.min(1, occ));
      col.setXYZ(k, col.getX(k) * k2, col.getY(k) * k2, col.getZ(k) * k2);
    }
  });
}

/** Mark a crop part's material class (glossy skin, leaf, …); untagged parts are 'body'. */
function tag(g: BufferGeometry, mat: CropMat): BufferGeometry {
  g.userData.mat = mat;
  return g;
}
const leafy = (g: BufferGeometry) => tag(g, 'leaf');

/** Crop merge: bake AO across the parts, then widen colours to RGBA with the material class in alpha. */
function mergeCrop(parts: BufferGeometry[]): BufferGeometry {
  bakeAO(parts);
  for (const g of parts) {
    const rgb = g.getAttribute('color');
    const a = CROP_MAT[(g.userData.mat as CropMat | undefined) ?? 'body'];
    const rgba = new Float32Array(rgb.count * 4);
    for (let i = 0; i < rgb.count; i++) rgba.set([rgb.getX(i), rgb.getY(i), rgb.getZ(i), a], i * 4);
    g.setAttribute('color', new BufferAttribute(rgba, 4));
  }
  return merge(parts);
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries failed');
  g.computeBoundingSphere();
  return g;
}

/**
 * Weld coincident vertices (lathe seams, sphere poles) and recompute normals, so deformed bodies shade as one
 * smooth surface instead of showing a hard seam line.
 */
function smooth(geo: BufferGeometry): BufferGeometry {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const g = mergeVertices(geo, 1e-4);
  g.computeVertexNormals();
  return g;
}

function shade(c: Color, k: number) {
  return c.clone().multiplyScalar(k);
}

/** Fruit size inside the model per stage; TilePool's STAGE_SCALE (0.55 / 0.8 / 1) scales the whole plant on top. */
const FRUIT: Record<Stage, number> = { 0: 0.6, 1: 0.8, 2: 1 };
/** Per-stage value, picked from [sprout, unripe, ripe]. */
const byStage = <T>(stage: Stage, v: readonly [T, T, T]): T => v[stage];

/** One curved leaf blade (leaves.ts), tagged as leaf material, placed around the plant. */
function leaf(
  spec: Omit<LeafSpec, 'top' | 'under'> & { stage: Stage },
  at: [number, number, number],
  yaw: number,
  pitch: number,
  roll = 0,
) {
  const { stage, ...rest } = spec;
  return leafy(
    placeLeaf(leafBlade({ ...rest, top: leafColor(stage), under: leafColor(stage, true) }), at, yaw, pitch, roll),
  );
}

/** A thin stem from `a` to `b`. */
function stem(a: Vector3, b: Vector3, r0: number, r1: number, col: Color, radial = 5) {
  const dir = b.clone().sub(a);
  const g = new CylinderGeometry(r1, r0, dir.length(), radial);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return leafy(part(g, col));
}

/** Tapered root with growth rings and a green shoulder; a feathery tuft that is relatively larger when young. */
function carrot(stage: Stage): BufferGeometry {
  const k = FRUIT[stage];
  const body = cropColor('carrot', stage);
  const groove = shade(body, 0.86);
  const shoulder = body.clone().lerp(leafColor(stage), 0.35);
  const profile: [number, number][] = [
    [0, 0],
    [0.018, 0.03],
    [0.045, 0.09],
    [0.075, 0.16],
    [0.105, 0.24],
    [0.135, 0.32],
    [0.158, 0.39],
    [0.172, 0.445],
    [0.176, 0.48],
    [0.165, 0.51],
    [0.13, 0.535],
    [0.07, 0.548],
    [0, 0.552],
  ];
  const root = new LatheGeometry(
    profile.map(([x, y]) => new Vector2(x * k, y * k)),
    byStage(stage, [12, 16, 18]),
  );
  const pos = root.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const y = v.y / k;
    const ring = Math.sin(y * 62) > 0.7 && y < 0.47 ? 0.93 : 1;
    pos.setXYZ(i, v.x * ring + 0.05 * k * (0.55 - y) ** 2, v.y, v.z * ring);
  }
  const top = 0.03 + 0.552 * k;
  const parts: BufferGeometry[] = [
    part(
      smooth(root),
      (p) => {
        const y = (p.y - 0.03) / k;
        return y > 0.5 ? shoulder : Math.sin(y * 62) > 0.7 && y < 0.47 ? groove : body;
      },
      { p: [0, 0.03, 0] },
    ),
  ];
  const lc = leafColor(stage);
  const fronds = [
    [0, 0.3, 0.36],
    [2.1, 0.42, 0.32],
    [4.2, 0.38, 0.33],
    [1.05, 0.2, 0.28],
    [3.15, 0.24, 0.28],
  ].slice(0, byStage(stage, [3, 4, 5]));
  const segs = stage === 0 ? 2 : 3;
  const grow = byStage(stage, [1.2, 1.08, 1]);
  for (const [yaw, tilt, len0] of fronds) {
    const len = len0! * grow;
    const dir = new Vector3(Math.sin(yaw!) * Math.sin(tilt!), Math.cos(tilt!), Math.cos(yaw!) * Math.sin(tilt!));
    const base = new Vector3(0, top - 0.01, 0);
    const end = base.clone().addScaledVector(dir, len);
    parts.push(stem(base, end, 0.011, 0.007, lc));
    for (let j = 1; j <= 3; j++) {
      const at = base.clone().addScaledVector(dir, (len * j) / 3.3);
      for (const side of [-1, 1])
        parts.push(
          leaf(
            { stage, length: 0.13 - j * 0.015, width: 0.07, shape: 'lance', curl: 0.5, fold: 0.2, segments: segs },
            [at.x, at.y, at.z],
            yaw! + side * 1.2,
            0.55 + tilt!,
          ),
        );
    }
    parts.push(
      leaf(
        { stage, length: 0.12, width: 0.07, shape: 'lance', curl: 0.4, segments: segs },
        [end.x, end.y, end.z],
        yaw!,
        tilt!,
      ),
    );
  }
  return mergeCrop(parts);
}

/** Flattened, lobed fruit with a star calyx; young plants show seed leaves and a true leaf. */
function tomato(stage: Stage): BufferGeometry {
  const k = FRUIT[stage];
  const body = cropColor('tomato', stage);
  const sphere = stage === 0 ? new SphereGeometry(0.25, 14, 10) : new SphereGeometry(0.25, 22, 14);
  const pos = sphere.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const phi = Math.atan2(v.z, v.x);
    const lat = 1 - Math.abs(v.y) / 0.25;
    const lobe = 1 + 0.06 * Math.cos(phi * 5) * lat;
    const dent = v.y > 0.2 ? -0.03 : 0;
    pos.setXYZ(i, v.x * lobe, v.y + dent, v.z * lobe);
  }
  const lc = leafColor(stage);
  const ld = shade(lc, 0.85);
  const fruitTop = 0.02 + 0.41 * k;
  const parts: BufferGeometry[] = [
    tag(
      part(
        smooth(sphere),
        (p) => {
          const hi = p.y > 0.1 * k && p.x < -0.05 * k && p.z > 0 ? 0.28 : p.y > 0.14 * k ? 0.12 : 0;
          return body.clone().lerp(new Color('#FFB7A0'), hi);
        },
        { p: [0, 0.23 * k, 0], s: [k, 0.82 * k, k] },
      ),
      'gloss',
    ),
  ];
  for (let i = 0; i < 5; i++)
    parts.push(
      leaf(
        { stage, length: 0.17 * Math.max(0.7, k), width: 0.07, shape: 'lance', curl: 1.2, fold: 0.1, segments: 2 },
        [0, fruitTop, 0],
        (i / 5) * Math.PI * 2 + 0.3,
        1.35,
      ),
    );
  parts.push(stem(new Vector3(0, fruitTop - 0.01, 0), new Vector3(0.015, fruitTop + 0.07, 0), 0.02, 0.013, ld, 6));
  if (stage === 0) {
    const s0 = new Vector3(0.1, 0.02, -0.08);
    const s1 = new Vector3(0.1, 0.3, -0.1);
    parts.push(stem(s0, s1, 0.014, 0.01, lc));
    parts.push(leaf({ stage, length: 0.22, width: 0.12, shape: 'lance', curl: 0.7 }, [s1.x, s1.y, s1.z], 1.3, 1.05));
    parts.push(leaf({ stage, length: 0.22, width: 0.12, shape: 'lance', curl: 0.7 }, [s1.x, s1.y, s1.z], -1.8, 1.05));
    parts.push(
      leaf({ stage, length: 0.28, width: 0.2, shape: 'oval', curl: 0.6 }, [s1.x, s1.y + 0.01, s1.z], 0.2, 0.55),
    );
  } else {
    const n = stage === 1 ? 3 : 2;
    for (let i = 0; i < n; i++)
      parts.push(
        leaf(
          { stage, length: 0.34, width: 0.22, shape: 'oval', curl: 1.0, fold: 0.35 },
          [0, 0.05, -0.1],
          Math.PI + (i - (n - 1) / 2) * 0.9,
          0.75,
        ),
      );
  }
  return mergeCrop(parts);
}

/** Tall kernelled cob wrapped in husk blades with silk; young corn is grass-like blades around a small cob tip. */
function corn(stage: Stage): BufferGeometry {
  const k = FRUIT[stage];
  const body = cropColor('corn', stage);
  const kernelDark = shade(body, 0.86);
  const cob = new CapsuleGeometry(0.11 * k, 0.34 * k, 4, 16);
  const pos = cob.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const row = Math.sin((v.y / k) * 95);
    const col = Math.sin(Math.atan2(v.z, v.x) * 14);
    const bump = 1 + 0.045 * Math.max(0, row) * Math.max(0, col);
    pos.setXYZ(i, v.x * bump, v.y, v.z * bump);
  }
  const cobY = 0.04 + 0.28 * k;
  const parts: BufferGeometry[] = [
    part(
      smooth(cob),
      (p) =>
        Math.sin(((p.y - cobY) / k) * 95) < -0.2 || Math.sin(Math.atan2(p.z, p.x) * 14) < -0.3 ? kernelDark : body,
      {
        p: [0, cobY + 0.06 * k, 0],
      },
    ),
  ];
  // Husks hug the cob: broad strap blades rooted just outside it, covering its lower two thirds.
  const husks = stage === 0 ? 2 : 4;
  for (let i = 0; i < husks; i++) {
    const yaw = (i / husks) * Math.PI * 2 + 0.4;
    const r = 0.1 * k;
    parts.push(
      leaf(
        { stage, length: 0.46 * k, width: 0.2 * k, shape: 'strap', curl: -0.35, fold: 0.55, segments: 5 },
        [Math.sin(yaw) * r, 0.03, Math.cos(yaw) * r],
        yaw,
        0.32,
      ),
    );
  }
  // Outer leaves: arching blades (the young plant is mostly these).
  const outer = byStage(stage, [3, 2, 1]);
  for (let i = 0; i < outer; i++)
    parts.push(
      leaf(
        {
          stage,
          length: byStage(stage, [0.46, 0.44, 0.4]),
          width: 0.11,
          shape: 'strap',
          curl: 1.3,
          fold: 0.4,
          segments: 6,
        },
        [0, 0.03, 0],
        Math.PI * 0.8 + i * 2.1,
        0.35,
      ),
    );
  if (stage > 0) {
    const silkTop = cobY + 0.06 * k + 0.28 * k;
    for (let j = 0; j < 4; j++)
      parts.push(
        tag(
          part(new CylinderGeometry(0.006, 0.01, 0.13 * k, 4), new Color(j % 2 ? '#D9B27A' : '#C79D62'), {
            p: [0.02 * Math.cos(j * 1.6), silkTop, 0.02 * Math.sin(j * 1.6)],
            r: [0.4 * Math.sin(j), 0, 0.5 * Math.cos(j * 2)],
          }),
          'dusty',
        ),
      );
  }
  return mergeCrop(parts);
}

/** Curved glossy teardrop with a star cap; young plants carry broad, drooping leaves. */
function eggplant(stage: Stage): BufferGeometry {
  const k = FRUIT[stage];
  const body = cropColor('eggplant', stage);
  const pts = [
    [0, 0],
    [0.1, 0.012],
    [0.17, 0.05],
    [0.205, 0.12],
    [0.21, 0.2],
    [0.185, 0.3],
    [0.14, 0.4],
    [0.1, 0.48],
    [0.075, 0.54],
    [0.05, 0.575],
    [0, 0.585],
  ].map(([x, y]) => new Vector2(x! * k, y! * k));
  const g = new LatheGeometry(pts, stage === 0 ? 14 : 20);
  const pos = g.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    pos.setX(i, v.x + (0.34 * v.y * v.y) / k);
  }
  const lc = leafColor(stage);
  const sheen = body.clone().lerp(new Color('#C9B4EA'), 0.45);
  const capAt = new Vector3(-0.07 + (0.34 * (0.575 * k) ** 2) / k + 0.02, 0.03 + 0.575 * k, 0);
  const parts: BufferGeometry[] = [
    tag(
      part(smooth(g), (p) => (p.x < -0.1 * k && p.y > 0.12 * k && p.y < 0.34 * k ? sheen : body), {
        p: [-0.07, 0.03, 0],
      }),
      'gloss',
    ),
    leafy(
      part(new SphereGeometry(0.07 * Math.max(0.7, k), 10, 6), lc, { p: [capAt.x, capAt.y, capAt.z], s: [1, 0.55, 1] }),
    ),
  ];
  for (let i = 0; i < 5; i++)
    parts.push(
      leaf(
        { stage, length: 0.14 * Math.max(0.75, k), width: 0.06, shape: 'lance', curl: 1.6, fold: 0.1, segments: 2 },
        [capAt.x, capAt.y, capAt.z],
        (i / 5) * Math.PI * 2,
        1.75,
      ),
    );
  parts.push(stem(capAt, capAt.clone().add(new Vector3(0.05, 0.08, 0)), 0.026, 0.018, shade(lc, 0.85), 6));
  const leaves = byStage(stage, [2, 2, 1]);
  for (let i = 0; i < leaves; i++)
    parts.push(
      leaf(
        {
          stage,
          length: byStage(stage, [0.36, 0.36, 0.34]),
          width: byStage(stage, [0.28, 0.26, 0.24]),
          shape: 'oval',
          curl: 1.0,
          fold: 0.3,
        },
        [0.02, 0.04, -0.1],
        Math.PI + (leaves === 1 ? 0.4 : (i - 0.5) * 1.3),
        0.8,
      ),
    );
  return mergeCrop(parts);
}

/** A cluster of dusty berries with crowned tips on a woody twig with small paired leaves. */
function blueberry(stage: Stage): BufferGeometry {
  const k = FRUIT[stage];
  const body = cropColor('blueberry', stage);
  const bloom = body.clone().lerp(new Color('#B9C7E6'), 0.32);
  const crown = shade(body, 0.55);
  const berries: [number, number, number, number][] = [
    [-0.12, 0.13, 0.07, 0.135],
    [0.12, 0.13, 0.07, 0.13],
    [0, 0.15, -0.12, 0.14],
  ];
  const parts: BufferGeometry[] = [];
  for (const [x, y, z, r0] of berries) {
    const r = r0 * k;
    const [bx, by, bz] = [x * (0.4 + 0.6 * k), 0.02 + (y - 0.02) * k, z * (0.4 + 0.6 * k)];
    const sph = new SphereGeometry(r, stage === 0 ? 10 : 12, stage === 0 ? 6 : 8);
    parts.push(
      tag(
        part(sph, (p) => (p.y > by + 0.04 * k ? bloom : body), { p: [bx, by, bz], s: [1, 0.92, 1] }),
        'dusty',
      ),
    );
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2;
      parts.push(
        part(new ConeGeometry(0.018 * k, 0.05 * k, 3), crown, {
          p: [bx + Math.cos(a) * 0.028 * k, by + r * 0.9, bz + Math.sin(a) * 0.028 * k],
          r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9],
        }),
      );
    }
  }
  const wood = new Color('#8A6A55');
  const t0 = new Vector3(0, 0.02, -0.12);
  const t1 = new Vector3(0.02, byStage(stage, [0.38, 0.36, 0.34]), -0.2);
  parts.push(stem(t0, t1, 0.014, 0.009, wood));
  const pairs = byStage(stage, [3, 2, 2]);
  for (let j = 0; j < pairs; j++) {
    const at = t0.clone().lerp(t1, 0.45 + (0.55 * j) / Math.max(1, pairs - 1));
    for (const side of [-1, 1])
      parts.push(
        leaf(
          { stage, length: 0.17, width: 0.11, shape: 'oval', curl: 0.6, fold: 0.3, segments: 4 },
          [at.x, at.y, at.z],
          side * 1.4 + Math.PI + j * 0.5,
          1.0,
        ),
      );
  }
  return mergeCrop(parts);
}

const BUILDERS: Record<CropId, (s: Stage) => BufferGeometry> = { carrot, tomato, corn, eggplant, blueberry };

const cropCache = new Map<string, BufferGeometry>();
/** Crops are modelled at ~0.55 cell height and presented 1.3× so a ripe crop fills its saucer under the 55° camera. */
export const CROP_SCALE = 1.3;
export function cropGeometry(crop: CropId, stage: Stage): BufferGeometry {
  const k = `${crop}:${stage}`;
  let g = cropCache.get(k);
  if (!g) {
    g = BUILDERS[crop](stage);
    g.scale(CROP_SCALE, CROP_SCALE, CROP_SCALE);
    g.computeBoundingSphere();
    cropCache.set(k, g);
  }
  return g;
}

let beeGeo: BufferGeometry | null = null;
/** RD-4: the bee has its own model — striped body, glassy wings. */
export function beeGeometry(): BufferGeometry {
  if (beeGeo) return beeGeo;
  const honey = new Color(PAL.honey);
  const ink = new Color(PAL.charcoal);
  const wing = new Color('#FDFBF6');
  beeGeo = merge([
    part(new SphereGeometry(1, 13, 9), (p) => (Math.sin(p.z * 34) > 0.35 ? ink : honey), {
      p: [0, 0.3, 0],
      s: [0.17, 0.15, 0.22],
    }),
    part(new SphereGeometry(1, 12, 8), ink, { p: [0, 0.33, 0.2], s: [0.1, 0.1, 0.09] }),
    part(new SphereGeometry(1, 10, 6), wing, { p: [0.13, 0.47, -0.02], r: [0, 0.3, -0.5], s: [0.14, 0.03, 0.09] }),
    part(new SphereGeometry(1, 10, 6), wing, { p: [-0.13, 0.47, -0.02], r: [0, -0.3, 0.5], s: [0.14, 0.03, 0.09] }),
    part(new ConeGeometry(0.03, 0.08, 5), ink, { p: [0, 0.3, -0.24], r: [-Math.PI / 2, 0, 0] }),
  ]);
  return beeGeo;
}

const markerCache = new Map<CropSpecial, BufferGeometry>();
/** RD-4 special markers: a floating linen badge; sickles show their sweep axis with arrows. */
export function markerGeometry(kind: CropSpecial): BufferGeometry {
  let g = markerCache.get(kind);
  if (g) return g;
  const badge = new Color(PAL.linen);
  const ink = new Color(PAL.charcoal);
  const steel = new Color(PAL.steel);
  if (kind === 'dewOrb') {
    const drop = [
      [0, 0],
      [0.09, 0.03],
      [0.13, 0.1],
      [0.12, 0.18],
      [0.07, 0.26],
      [0.02, 0.32],
      [0, 0.34],
    ].map(([x, y]) => new Vector2(x, y));
    g = merge([
      part(
        new LatheGeometry(drop, 16),
        (p) => (p.x < -0.04 && p.y > 0.12 ? new Color('#EAF5FA') : new Color(PAL.dew)),
        { p: [0, -0.16, 0] },
      ),
      part(new TorusGeometry(0.2, 0.022, 6, 28), new Color('#CFE6EF'), { p: [0, -0.14, 0], r: [Math.PI / 2, 0, 0] }),
    ]);
  } else {
    const blade = new TorusGeometry(0.12, 0.028, 5, 18, Math.PI * 1.25);
    const arrows = kind === 'sickleH' ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
    g = merge([
      part(new CylinderGeometry(0.19, 0.19, 0.035, 28), badge),
      part(new TorusGeometry(0.19, 0.012, 5, 28), new Color(PAL.gold), { r: [Math.PI / 2, 0, 0] }),
      part(blade, steel, { p: [0, 0.03, 0], r: [Math.PI / 2, 0, kind === 'sickleH' ? 0.6 : 0.6 + Math.PI / 2] }),
      ...arrows.map((a) =>
        part(new ConeGeometry(0.07, 0.13, 3), ink, {
          p: [Math.cos(a) * 0.29, 0, -Math.sin(a) * 0.29],
          r: [0, a, -Math.PI / 2],
        }),
      ),
    ]);
  }
  markerCache.set(kind, g);
  return g;
}

let dishGeo: BufferGeometry | null = null;
/** Clay saucer with a soil mound — the plot (地块). */
export function dishGeometry(): BufferGeometry {
  if (dishGeo) return dishGeo;
  const profile = [
    [0, 0.06],
    [0.3, 0.068],
    [0.38, 0.06],
    [0.41, 0.05],
    [0.44, 0.075],
    [0.47, 0.07],
    [0.47, 0.0],
    [0.0, 0.0],
  ].map(([x, y]) => new Vector2(x, y));
  const saucer = new Color(PAL.saucer);
  const soil = new Color(PAL.soil);
  dishGeo = merge([
    part(new LatheGeometry(profile.reverse(), 22), (p) =>
      Math.hypot(p.x, p.z) < 0.4 ? soil : p.y > 0.06 ? saucer : new Color(PAL.saucerShade),
    ),
  ]);
  return dishGeo;
}

let rimGeo: BufferGeometry | null = null;
/** RD-2: ripe tiles get a gold rim on the saucer. */
export function rimGeometry(): BufferGeometry {
  if (rimGeo) return rimGeo;
  rimGeo = merge([
    part(new TorusGeometry(0.445, 0.024, 6, 36), new Color(PAL.gold), { p: [0, 0.075, 0], r: [Math.PI / 2, 0, 0] }),
  ]);
  return rimGeo;
}

function radialTexture(stops: [number, string][], size = 128): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) grad.addColorStop(o, c);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

let shadowTex: Texture | null = null;
export function blobShadowTexture(): Texture {
  return (shadowTex ??= radialTexture([
    [0, 'rgba(60,40,28,0.55)'],
    [0.55, 'rgba(60,40,28,0.22)'],
    [1, 'rgba(60,40,28,0)'],
  ]));
}

let glowTex: Texture | null = null;
export function glowTexture(): Texture {
  return (glowTex ??= radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.25, 'rgba(255,248,230,0.6)'],
    [1, 'rgba(255,240,210,0)'],
  ]));
}

let bandTex: Texture | null = null;
/** Soft-edged horizontal band (row targeting). */
export function bandTexture(): Texture {
  if (bandTex) return bandTex;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 64);
  return (bandTex = new CanvasTexture(canvas));
}

let sparkTex: Texture | null = null;
export function sparkTexture(): Texture {
  return (sparkTex ??= radialTexture(
    [
      [0, 'rgba(255,255,255,1)'],
      [0.3, 'rgba(255,255,255,0.75)'],
      [1, 'rgba(255,255,255,0)'],
    ],
    64,
  ));
}
