import { useMemo } from 'react';
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { merge, part } from '@/render/assets/greybox';
import { PAL } from '@/render/assets/palette';

/** Rounded slab: a box with a softly bevelled silhouette via a lathe-free trick (stacked, inset boxes). */
function slab(w: number, d: number, h: number, bevel: number, color: Color | string, y: number): BufferGeometry[] {
  return [
    part(new BoxGeometry(w, h - bevel, d), color, { p: [0, y + (h - bevel) / 2, 0] }),
    part(new BoxGeometry(w - bevel * 2, bevel, d - bevel * 2), color, { p: [0, y + h - bevel / 2, 0] }),
  ];
}

function pot(x: number, z: number, scale: number, hue: 'sage' | 'mint' | 'olive'): BufferGeometry[] {
  const clay = new Color(PAL.clay);
  const profile = [
    [0, 0],
    [0.34, 0],
    [0.4, 0.08],
    [0.46, 0.62],
    [0.52, 0.66],
    [0.52, 0.74],
    [0.44, 0.74],
    [0.42, 0.7],
    [0, 0.7],
  ].map(([px, py]) => new Vector2(px! * scale, py! * scale));
  const leafBase = new Color(hue === 'sage' ? PAL.leaf : hue === 'mint' ? '#7DB38A' : '#8A9A5B');
  const parts: BufferGeometry[] = [
    part(new LatheGeometry(profile, 20), (p) => (p.y > 0.62 * scale ? clay.clone().multiplyScalar(1.04) : clay), { p: [x, 0, z] }),
  ];
  const blobs: [number, number, number, number][] = [
    [0, 1.05, 0, 0.42],
    [0.26, 0.9, 0.1, 0.3],
    [-0.24, 0.92, -0.08, 0.32],
    [0.05, 1.3, -0.12, 0.28],
  ];
  blobs.forEach(([bx, by, bz, r], i) =>
    parts.push(
      part(new IcosahedronGeometry(r * scale, 1), leafBase.clone().offsetHSL(0, 0, i * 0.025), {
        p: [x + bx * scale, by * scale, z + bz * scale],
      }),
    ),
  );
  return parts;
}

/** Glass-house rib: a thin arch, kept well outside the board + 0.5 cell margin (RD-6). */
function rib(z: number): BufferGeometry {
  return part(new TorusGeometry(7.4, 0.06, 6, 48, Math.PI), new Color('#B7C4BE'), { p: [0, -0.2, z] });
}

export function Terrace() {
  const { solid, glass, floor } = useMemo(() => {
    const planks: BufferGeometry[] = [];
    const plankW = 0.7;
    for (let i = -9; i <= 9; i++) {
      const tone = new Color(i % 2 === 0 ? PAL.wood : '#E0CDB2').offsetHSL(0, 0, (i % 3) * 0.006);
      planks.push(part(new BoxGeometry(plankW - 0.035, 0.18, 13.6), tone, { p: [i * plankW, -0.28, 0] }));
    }
    const bedClay = new Color('#D39C8C');
    const soilTone = (p: { x: number; z: number }) =>
      new Color(PAL.soilDeep).offsetHSL(0, 0, 0.018 * Math.sin(p.x * 3.1 + p.z * 2.3) * Math.cos(p.z * 1.7));
    const bed = [
      ...slab(8.2, 8.2, 0.3, 0.07, bedClay, -0.34),
      part(new BoxGeometry(7.5, 0.04, 7.5, 12, 1, 12), soilTone, { p: [0, -0.02, 0] }),
      ...[-1, 1].flatMap((s) => [
        part(new BoxGeometry(8.2, 0.12, 0.34), bedClay, { p: [0, -0.02, s * 3.93] }),
        part(new BoxGeometry(0.34, 0.12, 7.52), bedClay, { p: [s * 3.93, -0.02, 0] }),
      ]),
    ];
    const rim = [-1, 1].flatMap((s) => [
      part(new BoxGeometry(8.24, 0.04, 0.22), new Color(PAL.linen), { p: [0, 0.055, s * 3.97] }),
      part(new BoxGeometry(0.22, 0.04, 7.72), new Color(PAL.linen), { p: [s * 3.97, 0.055, 0] }),
    ]);
    const lip = [-1, 1].flatMap((s) => [
      part(new CylinderGeometry(0.075, 0.075, 8.18, 10), new Color(PAL.linen), { p: [0, 0.08, s * 3.97], r: [0, 0, Math.PI / 2] }),
      part(new CylinderGeometry(0.075, 0.075, 8.18, 10), new Color(PAL.linen), { p: [s * 3.97, 0.08, 0], r: [Math.PI / 2, 0, 0] }),
    ]);
    const caps = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => part(new SphereGeometry(0.15, 12, 8), new Color(PAL.clay), { p: [sx * 3.97, 0.1, sz * 3.97] })),
    );
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const pebbles: BufferGeometry[] = [];
    for (let i = 1; i < 7; i++)
      for (let j = 1; j < 7; j++) {
        if (rnd() < 0.35) continue;
        const tone = new Color(rnd() < 0.5 ? '#8C7462' : '#A08C7C').offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
        const r = 0.035 + rnd() * 0.035;
        pebbles.push(
          part(new IcosahedronGeometry(r, 0), tone, {
            p: [i - 3.5 + (rnd() - 0.5) * 0.12, 0.0, j - 3.5 + (rnd() - 0.5) * 0.12],
            r: [rnd() * 3, rnd() * 3, 0],
            s: [1.2, 0.55, 1],
          }),
        );
      }
    const moss = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        part(new IcosahedronGeometry(0.16, 1), new Color('#7FA070'), { p: [sx * 3.62, 0.02, sz * 3.62], s: [1.4, 0.45, 1.1] }),
      ),
    );
    const mullions = [
      ...[-4.4, -2.2, 0, 2.2, 4.4].map((x) => part(new BoxGeometry(0.05, 7.2, 0.05), new Color('#B7C4BE'), { p: [x, 3.4, -6.42] })),
      ...[1.4, 3.6, 5.8].map((y) => part(new BoxGeometry(13.2, 0.05, 0.05), new Color('#B7C4BE'), { p: [0, y, -6.42] })),
    ];
    const pots = [
      ...pot(-5.6, -5.4, 1.35, 'sage'),
      ...pot(5.7, -5.1, 1.1, 'mint'),
      ...pot(-5.9, 4.6, 0.9, 'olive'),
      ...pot(6.1, 5.3, 1.25, 'sage'),
      ...pot(4.7, -6.3, 0.75, 'olive'),
    ];
    const posts = [-6.6, 6.6].flatMap((x) =>
      [-6.4, 6.4].map((z) => part(new CylinderGeometry(0.07, 0.07, 3.6, 8), new Color('#B7C4BE'), { p: [x, 1.4, z] })),
    );
    const solidGeo = merge([...planks, ...bed, ...rim, ...lip, ...caps, ...pebbles, ...moss, ...mullions, ...pots, ...posts, rib(-6.4), rib(-2.2)]);
    const solidMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    const glassMat = new MeshStandardMaterial({
      color: '#DDEBEF',
      transparent: true,
      opacity: 0.2,
      roughness: 0.08,
      metalness: 0.1,
      depthWrite: false,
      side: DoubleSide,
      envMapIntensity: 1.2,
    });
    const back = new PlaneGeometry(13.2, 7.4);
    back.translate(0, 3.5, -6.45);
    const sides = [-1, 1].map((s) => {
      const g = new PlaneGeometry(12.8, 7.4);
      g.rotateY(Math.PI / 2);
      g.translate(s * 6.62, 3.5, 0);
      return g;
    });
    const glassGeo = mergeGeometries([back, ...sides].map((g) => g.toNonIndexed()), false)!;
    const floorGeo = new CircleGeometry(60, 48);
    floorGeo.rotateX(-Math.PI / 2);
    floorGeo.translate(0, -0.38, 0);
    const floorMat = new MeshStandardMaterial({ color: '#E9DFCF', roughness: 1 });
    const g = new Mesh(glassGeo, glassMat);
    g.renderOrder = 8;
    return { solid: new Mesh(solidGeo, solidMat), glass: g, floor: new Mesh(floorGeo, floorMat) };
  }, []);

  return (
    <group>
      <primitive object={floor} />
      <primitive object={solid} />
      <primitive object={glass} />
    </group>
  );
}
