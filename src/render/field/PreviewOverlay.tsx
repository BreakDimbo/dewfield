import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { CROP_BY_ID } from '@/core/config/crops';
import { glowTexture } from '@/render/assets/greybox';
import { PAL } from '@/render/assets/palette';
import { usePresentationStore } from '@/state/presentationStore';
import { useRunStore } from '@/state/runStore';
import { cellX, cellZ } from './layout';

const tmpM = new Matrix4();
const tmpP = new Vector3();
const tmpS = new Vector3();
const tmpQ = new Quaternion();
const tmpC = new Color();
const flatQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const UP_V = new Vector3(0, 1, 0);
const guideDir = new Vector3();
const guideQ = new Quaternion();

/**
 * RD-5 preview hierarchy, strongest first: harvest outline (linen ring) > yield beads > growth chevrons > special ghost.
 * Shapes differ per layer as well as colour, so it survives colour-blindness and greyscale.
 */
export function PreviewOverlay() {
  const camera = useThree((s) => s.camera);
  const layers = useMemo(() => {
    const g = new Group();
    const mk = (geo: ConstructorParameters<typeof InstancedMesh>[0], mat: MeshBasicMaterial, cap: number, order: number) => {
      const m = new InstancedMesh(geo, mat, cap);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = order;
      m.setColorAt(0, tmpC.set(1, 1, 1));
      g.add(m);
      return m;
    };
    const outline = mk(new RingGeometry(0.4, 0.48, 40), new MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false, depthWrite: false, transparent: true }), 49, 6);
    const fill = mk(new PlaneGeometry(0.92, 0.92), new MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }), 49, 5);
    const beads = mk(new SphereGeometry(0.085, 14, 10), new MeshBasicMaterial({ toneMapped: false }), 49, 7);
    const arrows = mk(new ConeGeometry(0.075, 0.14, 4), new MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false }), 49, 7);
    const ghosts = mk(new RingGeometry(0.18, 0.26, 6), new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }), 16, 7);
    const cross = mk(new PlaneGeometry(0.5, 0.09), new MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false, transparent: true, depthWrite: false }), 4, 7);
    const guide = mk(new ConeGeometry(0.16, 0.34, 3), new MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false }), 1, 7);
    return { g, outline, fill, beads, arrows, ghosts, cross, guide };
  }, []);

  useFrame((state) => {
    const rs = useRunStore.getState();
    const busy = usePresentationStore.getState().busy;
    const pv = busy ? null : rs.preview;
    const t = state.clock.elapsedTime;
    const pulse = 0.85 + 0.15 * Math.sin(t * 6);
    const camQ = camera.quaternion;
    let no = 0;
    let nb = 0;
    let na = 0;
    let ng = 0;
    let nc = 0;
    if (pv?.result.valid) {
      for (const h of pv.result.harvest) {
        const x = cellX(h.pos.x);
        const z = cellZ(h.pos.y);
        tmpM.compose(tmpP.set(x, 0.09, z), flatQ, tmpS.set(pulse, pulse, 1));
        layers.outline.setMatrixAt(no, tmpM);
        layers.fill.setMatrixAt(no, tmpM.compose(tmpP.set(x, 0.088, z), flatQ, tmpS.set(1, 1, 1)));
        layers.fill.setColorAt(no, tmpC.set('#FFF2D6').multiplyScalar(0.28));
        layers.outline.setColorAt(no++, tmpC.set(h.delivered ? '#FFFFFF' : '#F4EADB'));
        const bob = 0.04 * Math.sin(t * 4 + h.pos.x);
        if (h.yield !== 'none' && h.crop) {
          const col = h.yield === 'crop' ? CROP_BY_ID[h.crop].color : PAL.dew;
          const s = h.delivered ? 1.25 : 0.9;
          tmpM.compose(tmpP.set(x, 1.08 + bob, z), tmpQ.identity(), tmpS.set(s, h.yield === 'dewdrop' ? s * 1.3 : s, s));
          layers.beads.setMatrixAt(nb, tmpM);
          layers.beads.setColorAt(nb++, tmpC.set(col));
        }
      }
      for (const g of pv.result.growth) {
        tmpM.compose(tmpP.set(cellX(g.pos.x), 0.95 + 0.05 * Math.sin(t * 5 + g.pos.y), cellZ(g.pos.y)), tmpQ.identity(), tmpS.set(1, 1, 1));
        layers.arrows.setMatrixAt(na, tmpM);
        layers.arrows.setColorAt(na++, tmpC.set(g.cause === 'dewRing' ? '#BFE6F5' : '#B9E3A4'));
      }
      for (const c of pv.result.created) {
        const s = 1 + 0.12 * Math.sin(t * 5);
        tmpM.compose(tmpP.set(cellX(c.pos.x), 1.3, cellZ(c.pos.y)), camQ, tmpS.set(s, s, s));
        layers.ghosts.setMatrixAt(ng, tmpM);
        layers.ghosts.setColorAt(ng++, tmpC.set(c.kind === 'dewOrb' ? '#CFEFFA' : c.kind === 'bee' ? PAL.honey : '#FFE6A6'));
      }
      for (const tr of pv.result.triggered)
        for (const c of tr.area) {
          if (no >= 49) break;
          if (pv.result.harvest.some((h) => h.pos.x === c.x && h.pos.y === c.y)) continue;
          tmpM.compose(tmpP.set(cellX(c.x), 0.09, cellZ(c.y)), flatQ, tmpS.set(0.9, 0.9, 1));
          layers.outline.setMatrixAt(no, tmpM);
          layers.fill.setMatrixAt(no, tmpM);
          layers.fill.setColorAt(no, tmpC.set('#FFE2A8').multiplyScalar(0.2));
          layers.outline.setColorAt(no++, tmpC.set('#FFE2A8'));
        }
    } else if (pv && !pv.result.valid && pv.result.reason === 'noMatch') {
      const { a, b } = pv.move;
      const x = (cellX(a.x) + cellX(b.x)) / 2;
      const z = (cellZ(a.y) + cellZ(b.y)) / 2;
      for (const r of [Math.PI / 4, -Math.PI / 4]) {
        tmpQ.setFromAxisAngle(new Vector3(0, 0, 1), r);
        tmpM.compose(tmpP.set(x, 0.9, z), camQ.clone().multiply(tmpQ), tmpS.set(1, 1, 1));
        layers.cross.setMatrixAt(nc, tmpM);
        layers.cross.setColorAt(nc++, tmpC.set('#F3E4DA'));
      }
    }
    let ngd = 0;
    if (!pv && !busy && rs.guide) {
      const { a, b } = rs.guide;
      const ax = cellX(a.x);
      const az = cellZ(a.y);
      const dx = cellX(b.x) - ax;
      const dz = cellZ(b.y) - az;
      const k = 0.5 + 0.12 * Math.sin(t * 4);
      guideQ.setFromUnitVectors(UP_V, guideDir.set(dx, 0, dz).normalize());
      tmpM.compose(tmpP.set(ax + dx * k, 1.05 + 0.05 * Math.sin(t * 4), az + dz * k), guideQ, tmpS.set(1, 1, 0.45));
      layers.guide.setMatrixAt(ngd, tmpM);
      layers.guide.setColorAt(ngd++, tmpC.set('#EAF6FB'));
    }
    const set = (m: InstancedMesh, n: number) => {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    set(layers.outline, no);
    set(layers.fill, no);
    set(layers.beads, nb);
    set(layers.arrows, na);
    set(layers.ghosts, ng);
    set(layers.cross, nc);
    set(layers.guide, ngd);
  });

  return <primitive object={layers.g} />;
}
