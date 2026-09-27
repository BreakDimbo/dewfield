import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SphereGeometry } from 'three';
import { isBeeTarget } from '@/core/homestead/decor';
import { bandTexture } from '@/render/assets/greybox';
import { PAL } from '@/render/assets/palette';
import { cellZ } from '@/render/field/layout';
import { useAppStore } from '@/state/appStore';
import { useUiStore } from '@/state/uiStore';
import { fieldRuntime } from '@/render/runtime';

const ROW_KEY = -1000;

/** Water-a-row targeting band + the "watered today" trace at each row head (01 §9). */
export function RowHighlight() {
  const { g, band, marks } = useMemo(() => {
    const g = new Group();
    const band = new Mesh(
      new PlaneGeometry(7.4, 0.98),
      new MeshBasicMaterial({ map: bandTexture(), color: new Color('#9FD3EA'), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    );
    band.rotation.x = -Math.PI / 2;
    band.position.y = 0.1;
    band.renderOrder = 4;
    g.add(band);
    const markMat = new MeshBasicMaterial({ color: new Color(PAL.dew), toneMapped: false });
    const marks = Array.from({ length: 7 }, (_, y) => {
      const m = new Mesh(new SphereGeometry(0.09, 12, 8), markMat);
      m.scale.set(1, 1.35, 1);
      m.position.set(-4.08, 0.14, cellZ(y));
      g.add(m);
      return m;
    });
    return { g, band, marks };
  }, []);

  useFrame((state) => {
    const ui = useUiStore.getState();
    const home = useAppStore.getState().home;
    const app = useAppStore.getState().app;
    const row0 = ui.guideRow ?? ui.hoverRow;
    const show = app === 'hub' && ui.careMode === 'water' && row0 !== null;
    band.visible = show;
    const vfx = fieldRuntime.current?.vfx;
    if (show) {
      band.position.z = cellZ(row0!);
      const pulse = 0.55 + 0.2 * Math.sin(state.clock.elapsedTime * 5);
      (band.material as MeshBasicMaterial).opacity = pulse;
      const row = row0!;
      vfx?.telegraph(ROW_KEY, Array.from({ length: 7 }, (_, x) => ({ x, y: row })), 'dewOrb', 0.75 + 0.5 * pulse);
    } else if (app === 'hub' && ui.careMode === 'bee' && ui.hoverCell && home && isBeeTarget(home, ui.hoverCell)) {
      // P2-14: only plain crops are valid — special / bee cells get no telegraph
      vfx?.telegraph(ROW_KEY, [ui.hoverCell], 'bee', 0.9 + 0.4 * Math.sin(state.clock.elapsedTime * 5));
    } else vfx?.telegraph(ROW_KEY, [], 'dewOrb', 0);
    const watered = new Set(home?.care.wateredRows ?? []);
    marks.forEach((m, y) => (m.visible = (app === 'hub' || app === 'brief') && watered.has(y)));
  });

  return <primitive object={g} />;
}
