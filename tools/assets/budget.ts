import { BufferGeometry } from 'three';
import { CROP_IDS } from '../../src/core/config/crops';
import { beeGeometry, cropGeometry, dishGeometry, markerGeometry, rimGeometry } from '../../src/render/assets/greybox';

/** 03 §14 polygon budgets for the procedural art set (P2-09 #1). Exits non-zero when over. */
const tris = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const rows: [string, number, number][] = [];
for (const c of CROP_IDS) for (const s of [0, 1, 2] as const) rows.push([`crop_${c}_s${s}`, tris(cropGeometry(c, s)), s === 2 ? 1500 : s === 1 ? 1200 : 800]);
for (const k of ['sickleH', 'sickleV', 'dewOrb'] as const) rows.push([`marker_${k}`, tris(markerGeometry(k)), 600]);
rows.push(['marker_bee', tris(beeGeometry()), 600], ['plot_dish', tris(dishGeometry()), 800], ['rim_ripe', tris(rimGeometry()), 600]);
let bad = 0;
console.log('| 资产 | 三角形 | 预算 |\n|---|---|---|');
for (const [n, t, b] of rows) {
  console.log(`| ${n} | ${t} | ≤ ${b}${t > b ? ' ✗' : ''} |`);
  if (t > b) bad++;
}
if (bad) process.exit(1);
