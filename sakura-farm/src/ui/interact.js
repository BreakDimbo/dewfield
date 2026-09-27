// What the player is looking at (sakura-farm): a plot (its soil or its tree), the seed stall or the shed door.
// Crosshair ray from the camera; plots highlight with a soft frame. Pure scene math — no game rules.
import * as THREE from 'three';
import { STAGE } from '../game/data.js';

const REACH = 6.5;

export function createTargeting(ctx) {
  const F = ctx.L.FARM;
  const farm = ctx.services.farm;
  const cam = ctx.camera;
  const dir = new THREE.Vector3();

  // highlight: four thin glowing rails around the targeted bed
  const hi = new THREE.Group();
  hi.name = 'plot-highlight';
  const railMat = ctx.mat.emissive('#fff2c8', 1.15, { transparent: true, opacity: 0.9 });
  const s = F.plot + 0.08;
  for (const [w, d, x, z] of [[s, 0.06, 0, s / 2], [s, 0.06, 0, -s / 2], [0.06, s, s / 2, 0], [0.06, s, -s / 2, 0]]) {
    const m = new THREE.Mesh(ctx.geo.G.box(), railMat);
    m.scale.set(w, 0.05, d);
    m.position.set(x, F.bedH + 0.03, z);
    hi.add(m);
  }
  hi.visible = false;
  ctx.noOutline(hi);
  ctx.add(hi);

  function facing(p, maxDist, minDot = 0.55) {
    const pl = ctx.player.position;
    const dx = p.x - pl.x, dz = p.z - pl.z;
    const d = Math.hypot(dx, dz);
    if (d > maxDist) return false;
    const f = Math.hypot(dir.x, dir.z) || 1;
    return (dir.x * dx + dir.z * dz) / (f * (d || 1)) > minDot;
  }

  /** Returns { kind: 'plot', plot } | { kind: 'stall' } | { kind: 'shed' } | null, and places the highlight. */
  function pick(state) {
    cam.getWorldDirection(dir);
    const o = cam.position;
    let best = null;
    if (farm) {
      if (facing(farm.stall.front, 2.8)) best = { kind: 'stall' };
      else if (facing(farm.shed.door, 2.6)) best = { kind: 'shed' };
    }
    if (!best && farm) {
      let bt = REACH;
      // soil: ray vs the bed top plane
      if (dir.y < -0.02) {
        const t = (F.soilY - o.y) / dir.y;
        if (t > 0 && t < bt) {
          const x = o.x + dir.x * t, z = o.z + dir.z * t;
          for (const p of farm.plots) if (Math.abs(x - p.x) <= p.size / 2 + 0.15 && Math.abs(z - p.z) <= p.size / 2 + 0.15) { best = { kind: 'plot', plot: p.i }; bt = t; }
        }
      }
      // tree: ray vs the plant's vertical axis (so looking at a crown or the fruit also works)
      for (const p of farm.plots) {
        const st = state.plots[p.i];
        if (!st || st.stage < STAGE.SPROUT) continue;
        const height = st.stage >= STAGE.MATURE ? 4.5 : st.stage === STAGE.YOUNG ? 2.8 : 1.2;
        const radius = st.stage >= STAGE.YOUNG ? 1.6 : 0.7;
        // closest approach between the ray and the vertical line through (p.x, p.z)
        const wx = o.x - p.x, wz = o.z - p.z;
        const a = dir.x * dir.x + dir.z * dir.z;
        if (a < 1e-6) continue;
        const t = -(wx * dir.x + wz * dir.z) / a;
        if (t <= 0 || t >= bt) continue;
        const cx = o.x + dir.x * t - p.x, cz = o.z + dir.z * t - p.z, y = o.y + dir.y * t;
        if (Math.hypot(cx, cz) < radius && y > F.soilY - 0.2 && y < F.soilY + height) { best = { kind: 'plot', plot: p.i }; bt = t; }
      }
    }
    if (best?.kind === 'plot') {
      const p = farm.plots[best.plot];
      hi.position.set(p.x, 0, p.z);
      hi.visible = true;
    } else hi.visible = false;
    return best;
  }

  return { pick, hide: () => (hi.visible = false) };
}
