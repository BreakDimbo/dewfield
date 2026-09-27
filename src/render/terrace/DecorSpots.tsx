import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
} from 'three';
import type { DecorId } from '@/core/homestead/state';
import { terraceLevel } from '@/core/homestead/decor';
import { merge, part } from '@/render/assets/greybox';
import { PAL } from '@/render/assets/palette';
import { easeOutCubic, springOut } from '@/render/choreo/easing';
import { nudgeCamera } from '@/render/camera/nudge';
import { fieldRuntime } from '@/render/runtime';
import { useAppStore } from '@/state/appStore';
import { bus } from '@/state/bus';
import { gameCfg } from '@/state/config';

const c = (hex: string) => new Color(hex);

function potGeo(r: number, h: number, color = PAL.clay): BufferGeometry {
  const prof = [
    [0, 0],
    [r * 0.7, 0],
    [r * 0.8, h * 0.1],
    [r * 0.95, h * 0.85],
    [r, h * 0.9],
    [r, h],
    [r * 0.85, h],
    [0, h * 0.95],
  ].map(([x, y]) => new Vector2(x, y));
  return part(new LatheGeometry(prof, 16), c(color));
}

/** 02 §16.2 decor, modelled procedurally in the greybox vocabulary (vertex colours, one material). */
const BUILD: Record<DecorId, () => BufferGeometry> = {
  windChime: () =>
    merge([
      part(new CylinderGeometry(0.03, 0.03, 1.2, 6), c('#B7C4BE'), { p: [0, 0.6, 0] }),
      part(new TorusGeometry(0.22, 0.02, 6, 20), c(PAL.wood), { p: [0, 1.2, 0], r: [Math.PI / 2, 0, 0] }),
      ...[0, 1, 2, 3, 4].map((k) => {
        const a = (k / 5) * Math.PI * 2;
        return part(new CylinderGeometry(0.035, 0.035, 0.34 + 0.08 * (k % 3), 8), c(k % 2 ? '#CFE6EF' : PAL.mist), {
          p: [Math.cos(a) * 0.2, 0.95 - 0.04 * (k % 3), Math.sin(a) * 0.2],
        });
      }),
      part(new SphereGeometry(0.05, 8, 6), c(PAL.clay), { p: [0, 0.82, 0] }),
    ]),
  planters: () =>
    merge(
      [-1, 1].flatMap((sx) =>
        [-1, 1].flatMap((sz) => [
          part(potGeo(0.26, 0.38), c(PAL.clay), { p: [sx * 4.45, -0.02, sz * 4.45] }),
          part(new IcosahedronGeometry(0.22, 1), c('#86B68A'), { p: [sx * 4.45, 0.46, sz * 4.45], s: [1, 0.8, 1] }),
          part(new IcosahedronGeometry(0.14, 1), c('#A3CC9C'), { p: [sx * 4.45 + 0.1, 0.6, sz * 4.45 - 0.06] }),
        ]),
      ),
    ),
  awning: () => {
    const parts: BufferGeometry[] = [part(new CylinderGeometry(0.05, 0.05, 11, 8), c(PAL.wood), { p: [0, 4.3, -5.9], r: [0, 0, Math.PI / 2] })];
    for (let k = 0; k < 11; k++) {
      const x = -5 + k;
      parts.push(part(new BoxGeometry(0.98, 0.04, 1.4), c(k % 2 ? PAL.linen : '#E9C9BF'), { p: [x, 4.1, -5.3], r: [-0.35, 0, 0] }));
      parts.push(part(new ConeGeometry(0.5, 0.26, 12, 1, false, 0, Math.PI), c(k % 2 ? PAL.linen : '#E9C9BF'), { p: [x, 3.82, -4.66], r: [Math.PI / 2 - 0.35, 0, Math.PI] }));
    }
    return merge(parts);
  },
  beehive: () =>
    merge([
      part(new BoxGeometry(0.9, 0.12, 0.9), c(PAL.woodShade), { p: [0, 0.06, 0] }),
      ...[0, 1, 2].map((k) => part(new BoxGeometry(0.8, 0.36, 0.8), c(k % 2 ? '#E3C27A' : '#EDD08E'), { p: [0, 0.3 + k * 0.38, 0] })),
      part(new ConeGeometry(0.66, 0.34, 4), c(PAL.clay), { p: [0, 1.46, 0], r: [0, Math.PI / 4, 0] }),
      part(new BoxGeometry(0.26, 0.06, 0.04), c(PAL.charcoal), { p: [0, 0.2, 0.41] }),
    ]),
  bench: () =>
    merge([
      ...[0, 1, 2].map((k) => part(new BoxGeometry(1.9, 0.07, 0.16), c(k % 2 ? PAL.wood : '#DCC6A6'), { p: [0, 0.48, -0.18 + k * 0.18] })),
      ...[0, 1].map((k) => part(new BoxGeometry(1.9, 0.07, 0.12), c(PAL.wood), { p: [0, 0.78 + k * 0.18, -0.34], r: [-0.2, 0, 0] })),
      ...[-0.8, 0.8].flatMap((x) => [
        part(new BoxGeometry(0.08, 0.48, 0.5), c(PAL.woodShade), { p: [x, 0.24, 0] }),
        part(new BoxGeometry(0.08, 0.5, 0.08), c(PAL.woodShade), { p: [x, 0.72, -0.34] }),
      ]),
    ]),
  irrigation: () =>
    merge([
      part(new BoxGeometry(0.34, 0.16, 8.2), c(PAL.clay), { p: [0, -0.04, 0] }),
      part(new BoxGeometry(0.22, 0.03, 8.1), c('#7FB8CF'), { p: [0, 0.04, 0] }),
      ...[-3, 0, 3].map((z) => part(new CylinderGeometry(0.1, 0.1, 0.36, 10), c(PAL.woodShade), { p: [0, 0.08, z], r: [0, 0, Math.PI / 2] })),
    ]),
  glassMobile: () =>
    merge([
      part(new CylinderGeometry(0.02, 0.02, 1.4, 6), c('#B7C4BE'), { p: [0, 0.7, 0] }),
      part(new TorusGeometry(0.5, 0.015, 6, 28), c('#B7C4BE'), { p: [0, 0, 0], r: [Math.PI / 2, 0, 0] }),
      ...[0, 1, 2, 3, 4, 5].map((k) => {
        const a = (k / 6) * Math.PI * 2;
        const tint = ['#F2C6C0', '#F6E3A8', '#CDE8C4', '#BFE0EE', '#D2C8EC', '#F3D3E6'][k]!;
        return part(new IcosahedronGeometry(0.1, 0), c(tint), { p: [Math.cos(a) * 0.5, -0.3 - 0.1 * (k % 2), Math.sin(a) * 0.5] });
      }),
    ]),
  dewLanterns: () =>
    merge(
      [-6.4, -2.2].flatMap((z) =>
        Array.from({ length: 9 }, (_, k) => {
          const a = Math.PI * (0.12 + 0.76 * (k / 8));
          return part(new SphereGeometry(0.11, 10, 8), c('#FFF1C9'), { p: [Math.cos(a) * 7.3, Math.sin(a) * 7.3 - 0.35, z + 0.08] });
        }),
      ),
    ),
};

/** Scene placement per spot (02 §16.2 `spot`), all outside the board + 0.5-cell margin (RD-6). */
const PLACE: Record<DecorId, [number, number, number]> = {
  windChime: [-6.2, 2.2, 5.6],
  planters: [0, 0, 0],
  awning: [0, 0, 0],
  beehive: [-5.6, -0.3, 0.8],
  bench: [5.3, -0.3, 5.4],
  irrigation: [-4.55, 0, 0],
  glassMobile: [2.8, 4.4, -5.2],
  dewLanterns: [0, 0, 0],
};

/** Terrace dressing added at each level; tiers stack, so level 3 shows tiers 2 and 3. */
const TIERS: Record<number, () => BufferGeometry> = {
  2: () =>
    merge(
      (
        [
          [-6.6, -6.4],
          [6.6, -6.4],
          [-6.6, 6.4],
          [6.6, 6.4],
        ] as const
      ).flatMap(([x, z]) =>
        Array.from({ length: 6 }, (_, k) =>
          part(new IcosahedronGeometry(0.16 - k * 0.01, 1), c(k % 2 ? '#7FAE7E' : '#94BE8A'), { p: [x + Math.sin(k) * 0.12, 0.4 + k * 0.5, z + Math.cos(k) * 0.12] }),
        ),
      ),
    ),
  3: () =>
    merge(
      (
        [
          [-7.6, 1.8, 1.2],
          [7.4, -1.6, 1.1],
          [-3.5, -7.2, 0.9],
          [3.8, 7.3, 1],
        ] as const
      ).flatMap(([x, z, s]) => [
        part(potGeo(0.4 * s, 0.6 * s), c(PAL.clay), { p: [x, -0.3, z] }),
        part(new IcosahedronGeometry(0.46 * s, 1), c('#6E9E78'), { p: [x, 0.6 * s, z] }),
        part(new SphereGeometry(0.1 * s, 8, 6), c('#F2C6C0'), { p: [x + 0.2 * s, 0.9 * s, z + 0.2 * s] }),
      ]),
    ),
};

/** P2-13 level-up showcase: new dressing grows in, sparkles ring the terrace, the camera eases back. ≤ 1.5 s, never blocks input. */
const SHOWCASE_GROW = 0.9;

export function DecorSpots() {
  const owned = useAppStore((s) => s.home?.decor.owned);
  const { group, meshes, glow, rainbow, mat } = useMemo(() => {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
    const group = new Group();
    const meshes = {} as Record<DecorId, Mesh>;
    for (const id of Object.keys(BUILD) as DecorId[]) {
      const m = new Mesh(BUILD[id](), id === 'dewLanterns' ? new MeshStandardMaterial({ vertexColors: true, emissive: '#FFD98A', emissiveIntensity: 1.1, roughness: 0.4 }) : mat);
      m.position.set(...PLACE[id]);
      m.visible = false;
      group.add(m);
      meshes[id] = m;
    }
    const glow = new Mesh(new SphereGeometry(0.24, 10, 8), new MeshBasicMaterial({ color: '#FFE6A8', transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }));
    const rainbow = new Group();
    ['#F2B8B0', '#F6DE98', '#C6E6BC', '#B4DBEE', '#CDBFEA'].forEach((col, k) => {
      const d = new Mesh(new CircleGeometry(0.35, 20), new MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
      d.rotation.x = -Math.PI / 2;
      d.position.set(2.2 + k * 0.45, -0.17, -4.9 + (k % 2) * 0.2);
      rainbow.add(d);
    });
    rainbow.visible = false;
    group.add(rainbow);
    void glow;
    return { group, meshes, glow, rainbow, mat };
  }, []);
  const born = useRef<Partial<Record<DecorId, number>>>({});
  const tiers = useMemo(
    () =>
      Object.entries(TIERS).map(([lv, build]) => {
        // own material so the tier can fade in without touching the shared one
        const m = new Mesh(build(), mat.clone());
        m.visible = false;
        return { level: Number(lv), mesh: m };
      }),
    [mat],
  );
  // `pending` is set by the level-up cue and stamped with the frame clock on the next frame
  const showcase = useRef<{ pending: boolean; start: number; level: number }>({ pending: false, start: -Infinity, level: 0 });
  useEffect(
    () =>
      bus.on('cue', (cue) => {
        if (cue.t === 'ui' && cue.name === 'levelUp') showcase.current.pending = true;
      }),
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const set = new Set(owned ?? []);
    // RD-8: no spring overshoot and 1.5× faster under reduced motion
    const rm = useAppStore.getState().settings.reducedMotion;
    const speed = rm ? gameCfg().anim.reducedMotionScale : 1;
    for (const id of Object.keys(meshes) as DecorId[]) {
      const m = meshes[id];
      const has = set.has(id);
      if (has && born.current[id] === undefined) born.current[id] = owned && owned.length > 0 && t > 1 ? t : -10;
      if (!has) delete born.current[id];
      m.visible = has;
      if (!has) continue;
      const k = Math.min(1, ((t - born.current[id]!) * speed) / 0.7);
      const s = rm ? easeOutCubic(k) : springOut(k);
      m.scale.setScalar(Math.max(0.001, s));
      if (id === 'windChime') m.rotation.z = 0.06 * Math.sin(t * 1.4);
      if (id === 'glassMobile') m.rotation.y = t * 0.25;
      if (id === 'irrigation') m.position.y = 0.005 * Math.sin(t * 3);
    }
    const home = useAppStore.getState().home;
    const level = home ? terraceLevel(home, gameCfg()) : 1;
    const sc = showcase.current;
    if (sc.pending) {
      sc.pending = false;
      sc.start = t;
      sc.level = level;
      fieldRuntime.current?.vfx.terraceSparkle(rm);
      if (!rm) nudgeCamera(0.9);
    }
    for (const { level: lv, mesh } of tiers) {
      mesh.visible = lv <= level;
      if (!mesh.visible) continue;
      const mm = mesh.material as MeshStandardMaterial;
      const k = lv === sc.level ? Math.min(1, ((t - sc.start) * speed) / SHOWCASE_GROW) : 1;
      const growing = k < 1;
      if (mm.transparent !== growing) {
        mm.transparent = growing;
        mm.needsUpdate = true;
      }
      mm.opacity = growing ? easeOutCubic(Math.min(1, k * 1.6)) : 1;
      mesh.scale.set(1, Math.max(0.001, rm ? easeOutCubic(k) : springOut(k)), 1);
    }
    rainbow.visible = set.has('glassMobile');
    rainbow.children.forEach((d, k) => {
      ((d as Mesh).material as MeshBasicMaterial).opacity = 0.22 + 0.12 * Math.sin(t * 0.8 + k);
    });
    void glow;
  });

  return (
    <>
      <primitive object={group} />
      {tiers.map(({ level: lv, mesh }) => (
        <primitive key={lv} object={mesh} />
      ))}
    </>
  );
}
