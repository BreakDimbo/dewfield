import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from 'three';
import { CLIENTS } from '@/core/config/clients';
import { merge, part } from '@/render/assets/greybox';
import { PAL } from '@/render/assets/palette';
import { signboard } from '@/render/runtime';
import { useAppStore } from '@/state/appStore';

/** P1-20 market signboard: tap it (or the HUD button) to open today's commission. */
export function Signboard() {
  const { root, pin, collider } = useMemo(() => {
    const geo = merge([
      part(new CylinderGeometry(0.06, 0.07, 1.7, 8), new Color(PAL.woodShade), { p: [-0.62, 0.85, 0] }),
      part(new CylinderGeometry(0.06, 0.07, 1.7, 8), new Color(PAL.woodShade), { p: [0.62, 0.85, 0] }),
      part(new BoxGeometry(1.5, 0.9, 0.08), new Color(PAL.wood), { p: [0, 1.35, 0] }),
      part(new BoxGeometry(1.34, 0.74, 0.02), new Color(PAL.linen), { p: [0, 1.35, 0.05] }),
      part(new ConeGeometry(0.95, 0.3, 4), new Color(PAL.clay), { p: [0, 1.95, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.3] }),
      ...[0, 1, 2].map((k) => part(new BoxGeometry(0.9 - k * 0.2, 0.05, 0.01), new Color(PAL.charcoal).lerp(new Color(PAL.linen), 0.55), { p: [0.1, 1.5 - k * 0.14, 0.065] })),
    ]);
    const root = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    root.position.set(-5.4, -0.3, -3.6);
    root.rotation.y = 0.55;
    const pin = new Mesh(new SphereGeometry(0.13, 14, 10), new MeshStandardMaterial({ color: PAL.clay, roughness: 0.4, emissive: PAL.clay, emissiveIntensity: 0.25 }));
    pin.position.set(-0.45, 1.5, 0.08);
    root.add(pin);
    const collider = new Mesh(new BoxGeometry(1.8, 2.2, 0.6), new MeshBasicMaterial({ visible: false }));
    collider.position.set(0, 1.1, 0);
    root.add(collider);
    return { root, pin, collider };
  }, []);

  useEffect(() => {
    signboard.collider = collider;
    return () => {
      signboard.collider = null;
    };
  }, [collider]);

  useFrame((state) => {
    const home = useAppStore.getState().home;
    const active = home?.commissions.active;
    const waiting = !!active && home?.phase === 'morning';
    const mat = pin.material as MeshStandardMaterial;
    if (active) {
      mat.color.set(CLIENTS[active.clientId].tint);
      mat.emissive.set(CLIENTS[active.clientId].tint);
    }
    pin.visible = waiting;
    pin.position.y = 1.5 + (waiting ? 0.04 * Math.sin(state.clock.elapsedTime * 3) : 0);
    root.rotation.z = waiting ? 0.015 * Math.sin(state.clock.elapsedTime * 1.3) : 0;
  });

  return <primitive object={root} />;
}
