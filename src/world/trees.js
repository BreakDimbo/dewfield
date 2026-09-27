// 畑の木 (sakura-farm, docs/DESIGN.md §4) — the tree growing in each farm plot, rebuilt whenever that plot's
// state changes (stage, species, produce). Six species × stages: seed mound → sprout → sapling → young → mature.
// Built from the shared cel foliage library (lib/foliage.js) so the farm matches the town's trees.
import * as THREE from 'three';
import { makeShrub, makeCloudTree, SHRUB_COLORS } from './lib/foliage.js';
import { STAGE } from '../game/data.js';
import { newGame } from '../game/state.js';

/**
 * Per-species look. h = mature height, r = crown radius, stem = clear-trunk fraction of h, flat = lump height/width,
 * crown = lumps as [azimuth°, reach (×r), height (×h), size (×r)] — a centre lump has reach 0.
 */
const LOOK = {
  sakura: { // wide, flat umbrella whose outer lumps droop
    bark: '#5a4032', h: 4.5, r: 2.3, trunk: 0.14, stem: 0.42, flat: 0.72,
    colors: { top: '#fdecf2', mid: '#f4bccf', base: '#d897b0' }, young: { top: '#c9dd93', mid: '#8fbb6b', base: '#5f8d5c' },
    flowers: { colors: ['#fdf2f6', '#f7d3de', '#f2b5c8', '#fbe9ef'], density: 1.4, size: 1.1 },
    crown: [[0, 0, 0.86, 0.62], [20, 0.62, 0.74, 0.5], [140, 0.66, 0.72, 0.5], [260, 0.64, 0.7, 0.5], [80, 0.82, 0.6, 0.4], [200, 0.84, 0.58, 0.4], [320, 0.8, 0.6, 0.4]],
  },
  ume: { // gnarled, sparse, blossoms on thinner clusters
    bark: '#4b3a34', h: 3.5, r: 1.75, trunk: 0.12, stem: 0.4, flat: 0.8, gnarled: true,
    colors: { top: '#fbf4f5', mid: '#efd7df', base: '#c7a3b3' }, young: { top: '#c3d98b', mid: '#86b466', base: '#5a875a' },
    flowers: { colors: ['#ffffff', '#fbe3ea', '#ec9ab0', '#d9718f'], density: 1.6, size: 1.2 },
    crown: [[0, 0.15, 0.9, 0.5], [40, 0.7, 0.72, 0.42], [170, 0.72, 0.66, 0.4], [290, 0.66, 0.78, 0.38], [230, 0.4, 0.55, 0.32]],
  },
  momiji: { // two thin layered tiers of red leaves
    bark: '#6a4c3e', h: 4.0, r: 2.1, trunk: 0.1, stem: 0.4, flat: 0.5, layered: true,
    colors: { top: '#f7a174', mid: '#de5b50', base: '#a53f4c' }, young: { top: '#f1b28a', mid: '#d96a5a', base: '#9e4a50' },
    crown: [[0, 0, 0.92, 0.5], [30, 0.5, 0.76, 0.55], [150, 0.5, 0.74, 0.55], [270, 0.5, 0.78, 0.55], [90, 0.72, 0.56, 0.52], [210, 0.72, 0.54, 0.52], [330, 0.7, 0.58, 0.5]],
  },
  kaki: { // upright oval
    bark: '#5e4a3c', h: 4.2, r: 1.8, trunk: 0.15, stem: 0.38, flat: 1.0,
    colors: SHRUB_COLORS.camellia, young: SHRUB_COLORS.young,
    fruit: { color: '#f08a3a', r: 0.09, base: 10 },
    crown: [[0, 0, 0.84, 0.62], [60, 0.55, 0.66, 0.5], [180, 0.58, 0.64, 0.5], [300, 0.55, 0.7, 0.48], [0, 0.1, 0.52, 0.5]],
  },
  mikan: { // low and round, dense dark leaves
    bark: '#5a4a3a', h: 3.0, r: 1.65, trunk: 0.11, stem: 0.26, flat: 1.0,
    colors: SHRUB_COLORS.dark, young: SHRUB_COLORS.privet,
    fruit: { color: '#f5a623', r: 0.075, base: 16 },
    crown: [[0, 0, 0.72, 0.78], [45, 0.5, 0.52, 0.55], [165, 0.52, 0.5, 0.55], [285, 0.5, 0.54, 0.55]],
  },
  matsu: { bark: '#6b5244', h: 3.6, r: 1.05, colors: SHRUB_COLORS.pine, young: SHRUB_COLORS.pine },
};

/** Tapered trunk that bends a little, as one merged cylinder chain. Returns { geo, top: Vector3 }. */
function trunkGeometry(h, r0, seed, gnarled) {
  const parts = [];
  let p = new THREE.Vector3(0, 0, 0);
  let dir = new THREE.Vector3(0, 1, 0);
  const segs = 4;
  const rnd = mulberry(seed);
  for (let i = 0; i < segs; i++) {
    const len = h / segs;
    const ra = r0 * (1 - i / segs * 0.55), rb = r0 * (1 - (i + 1) / segs * 0.55);
    const bend = gnarled ? 0.35 : 0.14;
    dir = dir.clone().add(new THREE.Vector3((rnd() - 0.5) * bend, 0, (rnd() - 0.5) * bend)).normalize();
    const g = new THREE.CylinderGeometry(rb, ra, len, 8, 1);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    g.translate(p.x, p.y, p.z);
    parts.push(g);
    p = p.clone().addScaledVector(dir, len);
  }
  return { parts, top: p };
}

function branch(from, to, r) {
  const d = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(r * 0.55, r, d.length(), 6, 1);
  g.translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function build(ctx) {
  const { L, mat } = ctx;
  const F = L.FARM;
  const root = new THREE.Group();
  root.name = 'farm-trees';
  ctx.add(root);

  const M = {
    soil: mat.toon('#8f6b50', { paint: 0.07 }),
    stake: mat.toon('#c9c48a', { paint: 0.04 }),
    tie: mat.toon('#d9463b', { paint: 0.02 }),
    stem: mat.toon('#7aa35c', { paint: 0.04 }),
    bark: (c) => mat.toon(c, { paint: 0.07 }),
    fruit: (c) => mat.toon(c, { paint: 0.03 }),
    tag: (c) => mat.toon(c, { paint: 0.02 }),
  };

  /** Build the plant for one plot. seed varies the shape per plot. */
  function plant(p, seed) {
    const g = new THREE.Group();
    const k = ctx.kit(g);
    const look = LOOK[p.species];
    const sp = p.species;
    if (p.stage === STAGE.SEED) {
      // a soil mound with a bamboo marker and a seed-packet tag in the species colour
      const mound = k.sphere(0.36, M.soil, [0, 0.0, 0], 14);
      mound.scale.set(0.95, 0.24, 0.95);
      k.boxB(0.04, 0.5, 0.04, M.stake, [0.3, 0, 0.1]);
      k.box(0.2, 0.26, 0.02, M.tag(tagColor(sp)), [0.3, 0.42, 0.13]);
      return g;
    }
    if (p.stage === STAGE.SPROUT) {
      // a seedling on its mound: two seed leaves low, two true leaves at the tip
      const mound = k.sphere(0.3, M.soil, [0, 0.0, 0], 14);
      mound.scale.set(0.9, 0.18, 0.9);
      k.boxB(0.028, 0.34, 0.028, M.stem, [0, 0, 0]);
      const leaf = (x, y, r, rot, s2) => {
        const l = makeShrub(ctx, { r, h: r * 0.45, seed: seed + s2, colors: look.young, lumps: 0.05, puffAmp: 0, spacing: 0.03 });
        l.position.set(x, y, 0);
        l.rotation.set(0, s2 * 1.3, rot);
        g.add(l);
      };
      leaf(-0.1, 0.16, 0.11, 0.45, 1);
      leaf(0.1, 0.16, 0.11, -0.45, 2);
      leaf(-0.06, 0.32, 0.08, 0.3, 3);
      leaf(0.07, 0.34, 0.08, -0.3, 4);
      return g;
    }
    if (sp === 'matsu') {
      // cloud-pruned pine: pads grow in number with the stage
      const s = { [STAGE.SAPLING]: 0.45, [STAGE.YOUNG]: 0.75, [STAGE.MATURE]: 1 }[p.stage];
      const pads = p.stage === STAGE.MATURE
        ? [[0.1, 0.95, 0, 1.0], [0.62, 0.66, 0.1, 0.78], [-0.58, 0.55, -0.12, 0.72], [0.2, 0.38, 0.35, 0.56], [-0.1, 0.75, -0.4, 0.5]]
        : p.pruned || p.stage === STAGE.SAPLING
          ? [[0.1, 0.92, 0, 1.0], [0.55, 0.6, 0.1, 0.7], [-0.5, 0.5, -0.1, 0.66]]
          : [[0.05, 0.9, 0, 1.25], [0.45, 0.62, 0.1, 1.05], [-0.4, 0.55, -0.1, 1.0]]; // unpruned: shaggy, overgrown pads
      const t = makeCloudTree(ctx, { h: look.h * s, r: look.r * s * 1.25, seed: seed + 5, kind: 'pine', lean: 0.18, pads, trunkColor: look.bark });
      g.add(t);
      if (p.stage === STAGE.SAPLING) addStake(k, 1.0);
      return g;
    }
    const s = { [STAGE.SAPLING]: 0.34, [STAGE.YOUNG]: 0.62, [STAGE.MATURE]: 1 }[p.stage];
    const h = look.h * s, r = look.r * s;
    const bark = M.bark(look.bark);
    const tr = trunkGeometry(h * look.stem, look.trunk * Math.max(0.35, s), seed, look.gnarled);
    const parts = tr.parts;
    const mature = p.stage === STAGE.MATURE;
    const colors = mature || sp === 'momiji' ? look.colors : look.young;
    // young trees carry the first few lumps; saplings just the top one
    const lumps = look.crown.slice(0, mature ? look.crown.length : p.stage === STAGE.YOUNG ? 4 : 1);
    const rnd = mulberry(seed * 13 + 7);
    const canopies = [];
    lumps.forEach(([az, reach, hy, sc], i) => {
      const cr = r * sc;
      const a = (az * Math.PI) / 180 + rnd() * 0.4;
      const c = new THREE.Vector3(tr.top.x + Math.cos(a) * reach * r, h * hy, tr.top.z + Math.sin(a) * reach * r);
      // a branch from the trunk top (or a bit below) out to the lump's underside
      if (reach > 0.05) parts.push(branch(tr.top.clone().setY(tr.top.y - 0.1 * h), c.clone().setY(c.y - cr * look.flat * 0.35), look.trunk * s * 0.6));
      else parts.push(branch(tr.top, c.clone().setY(c.y - cr * look.flat * 0.3), look.trunk * s * 0.75));
      const flowers = mature && look.flowers ? { ...look.flowers, density: look.flowers.density * (p.produce > 0 ? 1.6 : 1) } : null;
      const m = makeShrub(ctx, {
        r: cr, h: cr * look.flat * 1.6, sx: 1.05, sz: 0.95, seed: seed + i * 11,
        colors, lumps: 0.2, freq: 2.4, puffAmp: 0.38, spacing: mature ? 0.1 : 0.075, flowers,
      });
      m.position.set(c.x, c.y - cr * look.flat * 0.8, c.z);
      m.rotation.y = rnd() * Math.PI * 2;
      g.add(m);
      canopies.push(m);
    });
    const trunkMesh = new THREE.Mesh(ctx.geo.mergeGeometries(parts, false), bark);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    g.add(trunkMesh);
    if (p.stage === STAGE.SAPLING) addStake(k, h + 0.1);
    // fruit: small spheres sampled on the real crown surface (upper / outward vertices); more when ripe
    if (mature && look.fruit) {
      const n = look.fruit.base + (p.produce > 0 ? 10 * p.produce : 0);
      const geo = new THREE.SphereGeometry(look.fruit.r, 10, 8);
      const inst = new THREE.InstancedMesh(geo, M.fruit(look.fruit.color), n);
      const m4 = new THREE.Matrix4();
      const v = new THREE.Vector3(), nn = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const cm = canopies[i % canopies.length];
        cm.updateMatrix();
        const pos = cm.geometry.attributes.position, nor = cm.geometry.attributes.normal;
        for (let tries = 0; tries < 20; tries++) {
          const vi = Math.floor(rnd() * pos.count);
          if (nor.getY(vi) < -0.35) continue;
          v.fromBufferAttribute(pos, vi).applyMatrix4(cm.matrix);
          nn.fromBufferAttribute(nor, vi).transformDirection(cm.matrix);
          v.addScaledVector(nn, look.fruit.r * 0.35);
          break;
        }
        m4.makeTranslation(v.x, v.y, v.z);
        inst.setMatrixAt(i, m4);
      }
      inst.castShadow = true;
      g.add(inst);
    }
    return g;
  }

  function addStake(k, h) {
    k.boxB(0.05, h, 0.05, M.stake, [0.2, 0, 0.06]);
    k.box(0.24, 0.04, 0.07, M.tie, [0.1, h * 0.55, 0.06]);
  }

  const tagColor = (sp) => ({ sakura: '#f2b5c8', ume: '#f6f1f2', momiji: '#d9485a', kaki: '#f29a5c', mikan: '#f2c230', matsu: '#5f8a58' })[sp] ?? '#ffffff';

  // ------------------------------------------------------------------ one slot per plot, rebuilt on change
  const slots = F.plots.map((p) => {
    const g = new THREE.Group();
    g.position.set(p.x, F.soilY, p.z);
    g.name = 'plot-tree-' + p.i;
    root.add(g);
    return { g, key: '', sway: null, phase: p.i * 1.7 };
  });
  const fallback = newGame();
  let seen = -1;
  function refresh() {
    const game = ctx.services.game;
    const state = game?.state ?? fallback;
    state.plots.forEach((p, i) => {
      const slot = slots[i];
      const key = p.stage >= STAGE.SEED ? `${p.species}|${p.stage}|${p.produce > 0 ? 1 : 0}|${p.species === 'matsu' ? +p.pruned : 0}` : '';
      if (key === slot.key) return;
      slot.key = key;
      for (const c of [...slot.g.children]) slot.g.remove(c);
      slot.sway = null;
      if (!key) return;
      const t = plant(p, 101 + i * 37);
      t.rotation.y = (i * 2.399) % (Math.PI * 2);
      slot.g.add(t);
      slot.sway = t;
    });
    seen = game?.version ?? 0;
  }
  refresh();
  ctx.onUpdate((dt, t) => {
    const game = ctx.services.game;
    if (game && game.version !== seen) refresh();
    // gentle sway, a pure function of t (none under reduced motion)
    const calm = ctx.services.game?.reducedMotion ? 0 : 1;
    for (const s of slots) if (s.sway) s.sway.rotation.z = calm * 0.012 * Math.sin(t * 0.9 + s.phase) * (1 + 0.5 * (ctx.shared.uGust?.value ?? 0.5));
  });
  ctx.services.trees = { refresh };
}
