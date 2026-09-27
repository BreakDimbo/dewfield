// 桜ヶ丘ふれあい農園 (sakura-farm, docs/DESIGN.md §7) — the farm in the old N2W row between alley R6 and the
// levee: lawn, gravel walk, eight raised beds (the soil surface follows the game state), bamboo fence,
// the tool shed (sleep), the seed stall (match-3), the entrance sign and a scarecrow.
//
// Publishes ctx.services.farm = { plots: [{ i, x, z, size, topY }], shed: { x, z, door }, stall: { x, z, front },
//   refresh() }  — interaction and trees read it. Soil follows ctx.services.game (polled by version).
import * as THREE from 'three';
import { newGame } from '../game/state.js';
import { STAGE } from '../game/data.js';

export function build(ctx) {
  const { L, mat, tex, physics } = ctx;
  const F = L.FARM;
  const root = new THREE.Group();
  root.name = 'farm';
  const k = ctx.kit(root);

  // ------------------------------------------------------------------ textures
  const grassTex = tex.draw(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const rr = ctx.rng('farm-grass');
    for (let i = 0; i < 900; i++) {
      const x = rr() * w, y = rr() * h, l = 4 + rr() * 9;
      g.strokeStyle = rr() < 0.5 ? 'rgba(90,130,70,0.18)' : 'rgba(210,235,170,0.22)';
      g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rr() - 0.5) * 3, y - l); g.stroke();
    }
  }, { key: 'farm-grass', repeat: [1, 1] });
  const soilTex = tex.draw(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    // furrows (畝): soft darker valleys across the bed, lighter ridges, a few clods
    for (let i = 0; i < 8; i++) {
      const y = (i + 0.5) * h / 8;
      const grd = g.createLinearGradient(0, y - h / 16, 0, y + h / 16);
      grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(70,45,30,0.28)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, y - h / 16, w, h / 8);
    }
    const rr = ctx.rng('farm-soil');
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rr() < 0.5 ? 'rgba(60,40,28,0.25)' : 'rgba(255,240,220,0.22)';
      g.beginPath(); g.arc(rr() * w, rr() * h, 1 + rr() * 2.5, 0, Math.PI * 2); g.fill();
    }
  }, { key: 'farm-soil', repeat: [1, 1] });
  const gravelTex = tex.draw(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const rr = ctx.rng('farm-gravel');
    for (let i = 0; i < 1400; i++) {
      const c = 150 + rr() * 90 | 0;
      g.fillStyle = `rgba(${c},${c - 6},${c - 14},0.55)`;
      g.beginPath(); g.ellipse(rr() * w, rr() * h, 1.2 + rr() * 2.2, 1 + rr() * 1.6, rr() * 3, 0, Math.PI * 2); g.fill();
    }
  }, { key: 'farm-gravel', repeat: [12, 1] });
  const plankTex = tex.draw(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = 'rgba(80,55,35,0.25)'; g.fillRect(i * w / 8, 0, 2, h);
      const rr = ctx.rng('plank' + i);
      for (let j = 0; j < 5; j++) { g.strokeStyle = 'rgba(90,60,40,0.12)'; g.beginPath(); const x = i * w / 8 + 4 + rr() * (w / 8 - 8); g.moveTo(x, 0); g.bezierCurveTo(x + 3, h * 0.3, x - 3, h * 0.7, x + 1, h); g.stroke(); }
    }
  }, { key: 'farm-plank' });

  // ------------------------------------------------------------------ materials
  const M = {
    lawn: mat.toon('#a6c985', { map: grassTex, paint: 0.08 }),
    gravel: mat.toon('#d9d2c3', { map: gravelTex, paint: 0.05 }),
    board: mat.toon('#b48a62', { map: plankTex, paint: 0.06 }),
    boardDark: mat.toon('#8a6446', { map: plankTex, paint: 0.06 }),
    post: mat.toon('#7a5a42', { paint: 0.05 }),
    bamboo: mat.toon('#c9c48a', { paint: 0.05 }),
    bambooDark: mat.toon('#9fa06a', { paint: 0.05 }),
    rope: mat.toon('#5c4a3a', { paint: 0.02 }),
    roof: mat.toon('#6f7d86', { paint: 0.06 }),
    roofEdge: mat.toon('#56636b', { paint: 0.04 }),
    wall: mat.toon('#c7a57c', { map: plankTex, paint: 0.07 }),
    trim: mat.toon('#5e4636', { paint: 0.04 }),
    dark: mat.toon('#4a4052', { paint: 0.02 }),
    concrete: mat.toon('#bdbcb5', { paint: 0.06 }),
    metal: mat.toon('#9aa1a8', { paint: 0.04 }),
    can: mat.toon('#7fb2c7', { paint: 0.04 }),
    sack: mat.toon('#e3d4b8', { paint: 0.08 }),
    straw: mat.toon('#e0c27a', { paint: 0.08 }),
    cloth: mat.toon('#5f7fa8', { paint: 0.05 }),
    red: mat.toon('#d9463b', { paint: 0.04 }),
    lampWarm: mat.emissive('#ffd9a0', 1.3),
    // soil states (dynamic — never batched)
    soilGrass: mat.toon('#c7b48a', { map: grassTex, paint: 0.1 }), // fallow: pale earth with stray grass
    soilDry: mat.toon('#b58e6c', { map: soilTex, paint: 0.07 }),
    soilWet: mat.toon('#7b5c47', { map: soilTex, paint: 0.05 }),
  };

  // ------------------------------------------------------------------ ground: lawn over the whole farm, gravel walk
  const W = F.x1 - F.x0, D = F.z1 - F.z0, cx = (F.x0 + F.x1) / 2, cz = (F.z0 + F.z1) / 2;
  const lawn = k.plane(W, D, M.lawn, [cx, 0.012, cz], [-Math.PI / 2, 0, 0]);
  lawn.receiveShadow = true;
  const pathD = F.path.z1 - F.path.z0;
  k.plane(W - 0.6, pathD, M.gravel, [cx, 0.02, (F.path.z0 + F.path.z1) / 2], [-Math.PI / 2, 0, 0]).receiveShadow = true;
  // stepping stones from the alley to the stall and the shed
  for (let i = 0; i < 5; i++) {
    const s = k.cyl(0.32, 0.34, 0.05, M.concrete, [-19.2 - i * 0.05, 0.03, -72.9 - i * 0.85], null, 10);
    s.scale.z = 0.8;
  }

  // ------------------------------------------------------------------ raised beds
  const plots = [];
  const soilMeshes = [];
  const soilGeo = new THREE.BoxGeometry(F.plot - 0.24, 0.1, F.plot - 0.24);
  const numerals = ['一', '二', '三', '四', '五', '六', '七', '八'];
  const dyn = new THREE.Group();
  dyn.name = 'farm-soil';
  for (const p of F.plots) {
    const s = F.plot, h = F.bedH, t = 0.1;
    // frame: four boards with corner posts
    k.boxB(s, h, t, M.board, [p.x, 0, p.z + s / 2 - t / 2]);
    k.boxB(s, h, t, M.board, [p.x, 0, p.z - s / 2 + t / 2]);
    k.boxB(t, h, s - 2 * t, M.board, [p.x - s / 2 + t / 2, 0, p.z]);
    k.boxB(t, h, s - 2 * t, M.board, [p.x + s / 2 - t / 2, 0, p.z]);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) k.boxB(0.14, h + 0.06, 0.14, M.boardDark, [p.x + dx * (s / 2 - 0.07), 0, p.z + dz * (s / 2 - 0.07)]);
    // numbered stake at the front-left corner
    const stake = k.group([p.x - s / 2 + 0.35, 0, p.z + s / 2 + 0.28]);
    const sk = ctx.kit(stake);
    sk.boxB(0.06, 0.62, 0.06, M.post, [0, 0, 0]);
    const plate = mat.toon('#ffffff', { map: tex.sign({ w: 128, h: 128, bg: '#efe6d2', fg: '#5a4032', text: numerals[p.i], font: tex.FONTS.brush, size: 88, radius: 10, border: 6, borderColor: '#8a6446', key: 'farm-plate-' + p.i }), paint: 0.02 });
    sk.box(0.26, 0.26, 0.03, plate, [0, 0.55, 0.035]);
    // soil surface (dynamic material swap)
    const soil = new THREE.Mesh(soilGeo, M.soilGrass);
    soil.position.set(p.x, F.soilY - 0.05, p.z);
    soil.receiveShadow = true;
    soil.userData.plot = p.i;
    dyn.add(soil);
    soilMeshes.push(soil);
    physics.addWalkBox(p.x, p.z, s, s, 0, F.soilY);
    plots.push({ i: p.i, x: p.x, z: p.z, size: s, topY: F.soilY });
  }
  ctx.add(dyn);

  // ------------------------------------------------------------------ bamboo fence (四つ目垣) along the back and the west end
  const fenceRun = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), rot = Math.atan2(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / 1.8));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      k.cyl(0.045, 0.05, 1.1, M.bambooDark, [x, 0.55, z], null, 8);
    }
    for (const y of [0.35, 0.72, 1.0]) {
      const m = k.cyl(0.028, 0.028, len, M.bamboo, [(ax + bx) / 2, y, (az + bz) / 2], null, 6);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, 0, bz - az).normalize());
    }
    physics.addBox((ax + bx) / 2, (az + bz) / 2, 0.12, len, rot, 0, 1.1);
  };
  fenceRun(-84.6, -83.2, -16.2, -83.2);
  fenceRun(-84.6, -83.2, -84.6, -73.4);

  // ------------------------------------------------------------------ tool shed (農具小屋)
  {
    const S = F.shed;
    const g = k.group([S.x, 0, S.z], S.rotY);
    const sk = ctx.kit(g);
    const w = S.w, d = S.d, hWall = 2.3;
    sk.boxB(w + 0.3, 0.14, d + 0.3, M.concrete, [0, 0, 0]);
    // walls (front has a door opening at x ∈ [-0.9, 0.9])
    sk.boxB(w, hWall, 0.12, M.wall, [0, 0.14, -d / 2 + 0.06]);
    sk.boxB(0.12, hWall, d, M.wall, [-w / 2 + 0.06, 0.14, 0]);
    sk.boxB(0.12, hWall, d, M.wall, [w / 2 - 0.06, 0.14, 0]);
    sk.boxB((w - 1.8) / 2, hWall, 0.12, M.wall, [-(w / 2 + 0.9) / 2 - 0.0, 0.14, d / 2 - 0.06]);
    sk.boxB((w - 1.8) / 2, hWall, 0.12, M.wall, [(w / 2 + 0.9) / 2, 0.14, d / 2 - 0.06]);
    sk.boxB(1.8, hWall - 2.0, 0.12, M.wall, [0, 2.14, d / 2 - 0.06]);
    // dark interior + a warm hanging lamp behind the open sliding door
    sk.box(1.76, 1.98, 0.02, M.dark, [0, 1.13, d / 2 - 0.2]);
    sk.box(0.9, 1.98, 0.08, M.boardDark, [-0.55, 1.13, d / 2 + 0.03]); // sliding door, half open
    for (const x of [-w / 2, w / 2]) sk.boxB(0.14, hWall, 0.14, M.trim, [x, 0.14, d / 2]);
    sk.box(w + 0.1, 0.12, 0.14, M.trim, [0, 0.14 + hWall, d / 2]);
    // mono-pitch corrugated roof, lower at the back
    const roof = sk.box(w + 0.8, 0.08, d + 0.9, M.roof, [0, 0.14 + hWall + 0.32, 0.1], [-0.16, 0, 0]);
    roof.name = 'shed-roof';
    sk.box(w + 0.8, 0.1, 0.06, M.roofEdge, [0, 0.14 + hWall + 0.55, d / 2 + 0.52]);
    // signboard 農具小屋
    const signTex = tex.sign({ w: 512, h: 160, bg: '#f1e6cf', fg: '#4a3526', text: '農具小屋', sub: 'NŌGU-GOYA · おやすみはこちら', font: tex.FONTS.brush, radius: 16, border: 10, borderColor: '#6a4c36', key: 'farm-shed-sign' });
    sk.box(1.6, 0.5, 0.05, mat.toon('#ffffff', { map: signTex, paint: 0.02 }), [0, 2.05 + 0.14, d / 2 + 0.1]);
    // lantern by the door (glows at night: lampWarm is emissive; the lighting module dims it by day)
    const lamp = sk.box(0.22, 0.3, 0.22, M.lampWarm, [1.2, 2.0, d / 2 + 0.25]);
    lamp.name = 'shed-lamp';
    sk.box(0.3, 0.05, 0.3, M.trim, [1.2, 2.18, d / 2 + 0.25]);
    // tools leaning on the wall: hoe, shovel, broom; watering cans; seed sacks; a crate
    const lean = (x, len, blade) => {
      const t = sk.group([x, 0.14, d / 2 + 0.12]);
      t.rotation.x = 0.18;
      const tk = ctx.kit(t);
      tk.boxB(0.05, len, 0.05, M.post, [0, 0, 0]);
      if (blade === 'hoe') tk.box(0.26, 0.05, 0.16, M.metal, [0, len - 0.02, 0.08]);
      if (blade === 'shovel') tk.box(0.22, 0.3, 0.03, M.metal, [0, 0.15, 0]);
      if (blade === 'broom') tk.cyl(0.14, 0.05, 0.4, M.straw, [0, 0.2, 0], null, 8);
    };
    lean(1.55, 1.5, 'hoe'); lean(1.85, 1.4, 'shovel'); lean(-1.6, 1.45, 'broom');
    for (const [x, c] of [[-1.05, M.can], [-0.7, mat.toon('#e9a23b', { paint: 0.04 })]]) {
      sk.cyl(0.13, 0.15, 0.26, c, [x, 0.27, d / 2 + 0.35], null, 12);
      sk.cyl(0.02, 0.03, 0.34, c, [x + 0.2, 0.36, d / 2 + 0.35], [0, 0, -0.9], 6);
    }
    for (let i = 0; i < 3; i++) sk.rbox(0.5, 0.42, 0.34, 0.08, M.sack, [-w / 2 + 0.45 + i * 0.05, 0.14 + 0.21 + (i === 2 ? 0.4 : 0), d / 2 + 0.35 + (i === 1 ? 0.35 : 0)]);
    physics.addBox(S.x, S.z, w + 0.2, d + 0.2, S.rotY, 0, 2.6);
  }

  // ------------------------------------------------------------------ seed stall (種の屋台) — the match-3 counter
  {
    const S = F.stall;
    const g = k.group([S.x, 0, S.z], S.rotY);
    const sk = ctx.kit(g);
    sk.boxB(S.w, 0.9, S.d, M.board, [0, 0, 0]);
    sk.box(S.w + 0.12, 0.06, S.d + 0.12, M.boardDark, [0, 0.93, 0]);
    for (const x of [-S.w / 2 + 0.06, S.w / 2 - 0.06]) for (const z of [-S.d / 2 + 0.06, S.d / 2 - 0.06]) sk.boxB(0.08, 2.25, 0.08, M.post, [x, 0, z]);
    sk.box(S.w + 0.5, 0.06, S.d + 0.7, M.roof, [0, 2.3, 0.1], [-0.12, 0, 0]);
    // noren: four panels, 「種の屋台」 in brush script
    const noren = tex.draw(512, 256, (gg, w, h) => {
      gg.fillStyle = '#3f5f8f'; gg.fillRect(0, 0, w, h);
      gg.fillStyle = '#f4efe4';
      gg.textAlign = 'center'; gg.textBaseline = 'middle';
      tex.fitText(gg, '種の屋台', w / 2, h * 0.46, w * 0.86, 130, tex.FONTS.brush, 700);
      gg.font = `500 26px ${tex.FONTS.en}`; gg.globalAlpha = 0.85; gg.fillText('TANE NO YATAI · 1日3回', w / 2, h * 0.85); gg.globalAlpha = 1;
      gg.fillStyle = '#2f4a73'; for (let i = 1; i < 4; i++) gg.fillRect(i * w / 4 - 3, 0, 6, h);
    }, { key: 'farm-noren' });
    sk.plane(S.w - 0.1, 0.55, mat.toon('#ffffff', { map: noren, side: 'double', paint: 0.02 }), [0, 1.95, S.d / 2 + 0.02]);
    // seed packets on the counter: little colourful boxes in two rows
    const packetCols = ['#f2b5c8', '#f6f1f2', '#d9485a', '#f29a5c', '#f2c230', '#5f8a58'];
    packetCols.forEach((c, i) => {
      const m = mat.toon(c, { paint: 0.03 });
      for (let j = 0; j < 2; j++) sk.box(0.22, 0.28, 0.04, m, [-0.95 + i * 0.38, 1.1, -0.1 - j * 0.26], [-0.25, 0, 0]);
    });
    // a small match-3 board sign (the minigame) standing on the counter
    const board = tex.draw(256, 256, (gg, w, h) => {
      gg.fillStyle = '#efe6d2'; gg.fillRect(0, 0, w, h);
      const cols = packetCols;
      const rr = ctx.rng('stall-board');
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { gg.fillStyle = cols[rr() * cols.length | 0]; gg.beginPath(); gg.arc(28 + x * 50, 28 + y * 50, 18, 0, Math.PI * 2); gg.fill(); }
      gg.strokeStyle = '#8a6446'; gg.lineWidth = 12; gg.strokeRect(6, 6, w - 12, h - 12);
    }, { key: 'farm-stall-board' });
    sk.box(0.5, 0.5, 0.04, mat.toon('#ffffff', { map: board, paint: 0.02 }), [0.85, 1.22, 0.25], [-0.3, 0, 0]);
    const lamp = sk.box(0.2, 0.28, 0.2, M.lampWarm, [-S.w / 2 + 0.2, 2.0, S.d / 2 + 0.05]);
    lamp.name = 'stall-lamp';
    physics.addBox(S.x, S.z, S.w, S.d, S.rotY, 0, 1.0);
  }

  // ------------------------------------------------------------------ entrance sign
  {
    const G = F.gate;
    const g = k.group([G.x, 0, G.z], Math.PI * 0.08);
    const sk = ctx.kit(g);
    for (const x of [-1.05, 1.05]) sk.boxB(0.12, 2.0, 0.12, M.post, [x, 0, 0]);
    const t = tex.sign({ w: 1024, h: 256, bg: '#f4ecd8', fg: '#3f2f24', text: '桜ヶ丘ふれあい農園', sub: 'SAKURAGAOKA COMMUNITY FARM', font: tex.FONTS.serif, radius: 20, border: 14, borderColor: '#7a5a42', key: 'farm-gate' });
    sk.box(2.3, 0.58, 0.06, mat.toon('#ffffff', { map: t, paint: 0.02 }), [0, 1.62, 0.05]);
    sk.box(2.5, 0.08, 0.2, M.trim, [0, 1.95, 0.02]);
    physics.addCylinder(G.x - 1.05, G.z, 0.1, 0, 2); physics.addCylinder(G.x + 1.05, G.z, 0.1, 0, 2);
  }

  // ------------------------------------------------------------------ scarecrow (かかし) and a rain barrel
  {
    const g = k.group([-55.3, 0, -82.5], 0.1);
    const sk = ctx.kit(g);
    sk.boxB(0.07, 1.7, 0.07, M.post, [0, 0, 0]);
    sk.box(1.3, 0.06, 0.06, M.post, [0, 1.3, 0]);
    sk.box(0.62, 0.55, 0.22, M.cloth, [0, 1.15, 0]);
    sk.sphere(0.17, M.sack, [0, 1.62, 0], 12);
    sk.cyl(0.36, 0.4, 0.06, M.straw, [0, 1.74, 0], null, 16);
    sk.cyl(0.14, 0.18, 0.14, M.straw, [0, 1.82, 0], null, 12);
    sk.box(0.1, 0.03, 0.02, M.red, [0, 1.6, 0.17]);
    physics.addCylinder(-55.3, -82.5, 0.12, 0, 1.8);
    const b = k.group([-23.8, 0, -82.1]);
    const bk = ctx.kit(b);
    bk.cyl(0.36, 0.33, 0.85, M.boardDark, [0, 0.425, 0], null, 14);
    for (const y of [0.18, 0.66]) bk.cyl(0.37, 0.37, 0.05, M.rope, [0, y, 0], null, 14);
    bk.cyl(0.34, 0.34, 0.02, mat.toon('#7fa8bf', { paint: 0.02 }), [0, 0.84, 0], null, 14);
    physics.addCylinder(-23.8, -82.1, 0.37, 0, 0.9);
  }

  ctx.addStatic(root);

  // ------------------------------------------------------------------ soil follows the game state
  const fallback = newGame();
  let seen = -1;
  function refresh() {
    const game = ctx.services.game;
    const state = game?.state ?? fallback;
    state.plots.forEach((p, i) => {
      const m = soilMeshes[i];
      m.material = p.stage === STAGE.EMPTY ? M.soilGrass : p.watered ? M.soilWet : M.soilDry;
    });
    seen = game?.version ?? 0;
  }
  refresh();
  ctx.onUpdate(() => {
    const game = ctx.services.game;
    if (game && game.version !== seen) refresh();
  });

  ctx.services.farm = {
    plots,
    shed: { x: F.shed.x, z: F.shed.z, door: { x: F.shed.x, z: F.shed.z + F.shed.d / 2 + 0.6 } },
    stall: { x: F.stall.x, z: F.stall.z, front: { x: F.stall.x, z: F.stall.z + F.stall.d / 2 + 0.7 } },
    refresh,
  };
}
