import {
  BufferAttribute,
  BufferGeometry,
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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CropSpecial, Stage } from '@/core/board/model';
import type { CropId } from '@/core/config/crops';
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

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries failed');
  g.computeBoundingSphere();
  return g;
}

function shade(c: Color, k: number) {
  return c.clone().multiplyScalar(k);
}

/** P2-09 direction test: the showcase crop — tapered root, growth rings, green shoulder, feathery compound leaves. */
function carrot(stage: Stage): BufferGeometry {
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
    profile.map(([x, y]) => new Vector2(x, y)),
    14,
  );
  const pos = root.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ring = Math.sin(v.y * 62) > 0.7 && v.y < 0.47 ? 0.93 : 1;
    pos.setXYZ(i, v.x * ring + 0.05 * (0.55 - v.y) ** 2, v.y, v.z * ring);
  }
  root.computeVertexNormals();
  const parts: BufferGeometry[] = [
    part(root, (p) => (p.y > 0.5 ? shoulder : Math.sin(p.y * 62) > 0.7 && p.y < 0.47 ? groove : body), { p: [0, 0.03, 0] }),
  ];
  const lc = leafColor(stage);
  const ll = leafColor(stage, true);
  const fronds: [number, number, number][] = [
    [0, 0.42, 0.34],
    [2.1, 0.32, 0.3],
    [4.2, 0.36, 0.32],
    [1.05, 0.12, 0.26],
    [3.15, 0.18, 0.26],
  ];
  fronds.forEach(([yaw, tilt, len], f) => {
    const dir = new Vector3(Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), Math.cos(yaw) * Math.sin(tilt));
    const base = new Vector3(0, 0.57, 0);
    const stem = new CylinderGeometry(0.008, 0.012, len, 5);
    stem.translate(0, len / 2, 0);
    const q2 = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
    stem.applyQuaternion(q2);
    stem.translate(base.x, base.y, base.z);
    parts.push(part(stem, f % 2 ? ll : lc));
    for (let k = 1; k <= 3; k++) {
      const at = base.clone().addScaledVector(dir, (len * k) / 3.4);
      for (const side of [-1, 1]) {
        const g = new ConeGeometry(0.03, 0.11 - k * 0.012, 5, 1);
        g.translate(0, (0.11 - k * 0.012) / 2, 0);
        g.scale(1, 1, 0.35);
        const out = new Vector3(Math.cos(yaw) * side, 0.9, -Math.sin(yaw) * side).normalize();
        g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), out.lerp(dir, 0.35).normalize()));
        g.translate(at.x, at.y, at.z);
        parts.push(part(g, k % 2 ? ll : lc));
      }
    }
    const tip = new ConeGeometry(0.028, 0.1, 5, 1);
    tip.translate(0, 0.05, 0);
    tip.scale(1, 1, 0.35);
    tip.applyQuaternion(q2);
    const end = base.clone().addScaledVector(dir, len);
    tip.translate(end.x, end.y, end.z);
    parts.push(part(tip, ll));
  });
  return merge(parts);
}

function tomato(stage: Stage): BufferGeometry {
  const body = cropColor('tomato', stage);
  const sphere = new SphereGeometry(0.25, 18, 12);
  const pos = sphere.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const phi = Math.atan2(v.z, v.x);
    const lat = 1 - Math.abs(v.y) / 0.25;
    const k = 1 + 0.06 * Math.cos(phi * 5) * lat;
    const dent = v.y > 0.2 ? -0.03 : 0;
    pos.setXYZ(i, v.x * k, v.y + dent, v.z * k);
  }
  sphere.computeVertexNormals();
  const lc = leafColor(stage);
  const ld = shade(lc, 0.85);
  const calyx = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const g = new ConeGeometry(0.034, 0.16, 4, 1);
    g.translate(0, 0.08, 0);
    g.scale(1, 1, 0.3);
    g.rotateZ(-1.25);
    g.rotateY(-a);
    g.translate(0, 0.42, 0);
    return part(g, i % 2 ? lc : ld);
  });
  return merge([
    part(sphere, (p) => {
      const hi = p.y > 0.1 && p.x < -0.05 && p.z > 0 ? 0.28 : p.y > 0.14 ? 0.12 : 0;
      return body.clone().lerp(new Color('#FFB7A0'), hi);
    }, { p: [0, 0.23, 0], s: [1, 0.82, 1] }),
    ...calyx,
    part(new CylinderGeometry(0.014, 0.022, 0.09, 6), ld, { p: [0.01, 0.47, 0], r: [0, 0, 0.25] }),
  ]);
}

function corn(stage: Stage): BufferGeometry {
  const body = cropColor('corn', stage);
  const kernelDark = shade(body, 0.86);
  const cob = new CapsuleGeometry(0.11, 0.34, 4, 14);
  const pos = cob.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const row = Math.sin(v.y * 95);
    const col = Math.sin(Math.atan2(v.z, v.x) * 14);
    const bump = 1 + 0.045 * Math.max(0, row) * Math.max(0, col);
    pos.setXYZ(i, v.x * bump, v.y, v.z * bump);
  }
  cob.computeVertexNormals();
  const lc = leafColor(stage);
  const ll = leafColor(stage, true);
  const husk = (yaw: number, tilt: number, len: number, col: Color) => {
    const g = new ConeGeometry(0.1, len, 7, 2, true);
    g.translate(0, len / 2, 0);
    const p2 = g.getAttribute('position');
    for (let i = 0; i < p2.count; i++) {
      v.fromBufferAttribute(p2, i);
      p2.setXYZ(i, v.x, v.y, v.z * 0.35 + 0.06 * (v.y / len) ** 2);
    }
    g.computeVertexNormals();
    g.rotateZ(tilt);
    g.rotateY(yaw);
    g.translate(0, 0.04, 0);
    return part(g, col);
  };
  const silk = [0, 1, 2, 3].map((k) =>
    part(new CylinderGeometry(0.006, 0.01, 0.13, 4), new Color(k % 2 ? '#D9B27A' : '#C79D62'), {
      p: [0.02 * Math.cos(k * 1.6), 0.73, 0.02 * Math.sin(k * 1.6)],
      r: [0.4 * Math.sin(k), 0, 0.5 * Math.cos(k * 2)],
    }),
  );
  return merge([
    part(cob, (p) => (Math.sin(p.y * 95) < -0.2 || Math.sin(Math.atan2(p.z, p.x) * 14) < -0.3 ? kernelDark : body), { p: [0, 0.38, 0] }),
    husk(0, -0.32, 0.54, lc),
    husk(Math.PI, -0.3, 0.5, ll),
    husk(Math.PI / 2, -0.22, 0.42, shade(lc, 0.92)),
    husk(-Math.PI / 2, -0.25, 0.38, ll),
    ...silk,
  ]);
}

function eggplant(stage: Stage): BufferGeometry {
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
  ].map(([x, y]) => new Vector2(x, y));
  const g = new LatheGeometry(pts, 14);
  const pos = g.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    pos.setX(i, v.x + 0.34 * v.y * v.y);
  }
  g.computeVertexNormals();
  const lc = leafColor(stage);
  const sheen = body.clone().lerp(new Color('#C9B4EA'), 0.45);
  const cap = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2;
    const c2 = new ConeGeometry(0.05, 0.16, 4);
    c2.translate(0, -0.08, 0);
    c2.scale(1, 1, 0.35);
    c2.rotateZ(0.5);
    c2.rotateY(-a);
    c2.translate(0.1, 0.57, 0);
    return part(c2, i % 2 ? lc : shade(lc, 0.88));
  });
  return merge([
    part(g, (p) => (p.x < -0.1 && p.y > 0.12 && p.y < 0.34 ? sheen : body), { p: [-0.07, 0.03, 0] }),
    part(new SphereGeometry(0.07, 10, 6), lc, { p: [0.09, 0.59, 0], s: [1, 0.55, 1] }),
    ...cap,
    part(new CylinderGeometry(0.018, 0.026, 0.11, 6), shade(lc, 0.85), { p: [0.12, 0.66, 0], r: [0, 0, -0.4] }),
  ]);
}

function blueberry(stage: Stage): BufferGeometry {
  const body = cropColor('blueberry', stage);
  const bloom = body.clone().lerp(new Color('#B9C7E6'), 0.32);
  const crown = shade(body, 0.55);
  const berries: [number, number, number, number][] = [
    [-0.12, 0.13, 0.07, 0.135],
    [0.12, 0.13, 0.07, 0.13],
    [0, 0.15, -0.12, 0.14],
  ];
  const parts: BufferGeometry[] = [];
  for (const [x, y, z, r] of berries) {
    const sph = new SphereGeometry(r, 11, 7);
    parts.push(part(sph, (p) => (p.y > 0.04 ? bloom : body), { p: [x, y, z], s: [1, 0.92, 1] }));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      parts.push(
        part(new ConeGeometry(0.018, 0.05, 3), crown, {
          p: [x + Math.cos(a) * 0.028, y + r * 0.9, z + Math.sin(a) * 0.028],
          r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9],
        }),
      );
    }
  }
  const lc = leafColor(stage);
  parts.push(part(new SphereGeometry(1, 8, 6), lc, { p: [0.04, 0.32, -0.2], r: [0.7, 0.3, 0.2], s: [0.11, 0.018, 0.2] }));
  parts.push(part(new SphereGeometry(1, 8, 6), leafColor(stage, true), { p: [-0.1, 0.3, -0.2], r: [0.7, -0.5, -0.3], s: [0.08, 0.016, 0.15] }));
  parts.push(part(new CylinderGeometry(0.01, 0.014, 0.2, 5), shade(lc, 0.8), { p: [0, 0.27, -0.1], r: [0.55, 0, 0] }));
  return merge(parts);
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
    part(new SphereGeometry(1, 13, 9), (p) => (Math.sin(p.z * 34) > 0.35 ? ink : honey), { p: [0, 0.3, 0], s: [0.17, 0.15, 0.22] }),
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
      part(new LatheGeometry(drop, 16), (p) => (p.x < -0.04 && p.y > 0.12 ? new Color('#EAF5FA') : new Color(PAL.dew)), { p: [0, -0.16, 0] }),
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
    part(new LatheGeometry(profile.reverse(), 22), (p) => (Math.hypot(p.x, p.z) < 0.4 ? soil : p.y > 0.06 ? saucer : new Color(PAL.saucerShade))),
  ]);
  return dishGeo;
}

let rimGeo: BufferGeometry | null = null;
/** RD-2: ripe tiles get a gold rim on the saucer. */
export function rimGeometry(): BufferGeometry {
  if (rimGeo) return rimGeo;
  rimGeo = merge([part(new TorusGeometry(0.445, 0.024, 6, 36), new Color(PAL.gold), { p: [0, 0.075, 0], r: [Math.PI / 2, 0, 0] })]);
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
