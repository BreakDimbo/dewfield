import {
  AdditiveBlending,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  TorusGeometry,
  Vector3,
  type Material,
  MeshStandardMaterial,
} from 'three';
import type { HarvestItem } from '@/core/board/events';
import type { Pos, SpecialKind } from '@/core/board/model';
import { CROP_BY_ID } from '@/core/config/crops';
import type { ComboKind, VfxAdapter } from '@/render/choreo/builder';
import { bandTexture, beeGeometry, glowTexture, sparkTexture } from '@/render/assets/greybox';
import { PAL } from '@/render/assets/palette';
import { cellX, cellZ } from '@/render/field/layout';

interface Particle {
  p: Vector3;
  v: Vector3;
  life: number;
  max: number;
  size: number;
  color: Color;
  drag: number;
  grav: number;
}

const TELE_COLOR: Record<SpecialKind, Color> = {
  sickleH: new Color('#FFE2A8'),
  sickleV: new Color('#FFE2A8'),
  dewOrb: new Color('#BFE6F5'),
  bee: new Color('#FFD77A'),
};

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpP = new Vector3();
const tmpC = new Color();
const flatQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const UP = new Vector3(0, 1, 0);

/** Deterministic-enough jitter for cosmetics; presentation never feeds back into rules. */
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** Particles, telegraphs, sweeps, bursts and bees — the choreographer's `vfx` adapter. */
export class VfxSystem implements VfxAdapter {
  readonly group = new Group();
  shakeAmount = 0;
  /** P2-21 quality tier: 0.5 halves every burst. */
  particleScale = 1;
  private particles: Particle[] = [];
  private readonly sparks: InstancedMesh;
  private readonly tiles: InstancedMesh;
  private readonly rings: InstancedMesh;
  private readonly beeMesh: InstancedMesh;
  private readonly blades: InstancedMesh;
  private tele = new Map<number, { cells: readonly Pos[]; kind: SpecialKind; alpha: number }>();
  private sweeps = new Map<string, { pos: Pos; dir: 'h' | 'v'; t: number; level: number; lastEmit: number }>();
  private dews = new Map<string, { pos: Pos; radius: number; t: number }>();
  private flights = new Map<string, { from: Pos; cells: readonly Pos[]; t: number }>();
  private flashes: { pos: Pos; t: number; color: Color }[] = [];
  private readonly beamMesh: InstancedMesh;
  private beams = new Map<string, { lines: { axis: 'row' | 'col'; at: number }[]; color: Color; alpha: number }>();
  private combos = new Set<string>();

  constructor(
    private readonly maxParticles: number,
    litMaterial: MeshStandardMaterial,
  ) {
    const additive = (map = sparkTexture()) =>
      new MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide });
    const inst = (geo: ConstructorParameters<typeof InstancedMesh>[0], mat: Material, cap: number, order: number) => {
      const m = new InstancedMesh(geo, mat, cap);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = order;
      this.group.add(m);
      return m;
    };
    this.tiles = inst(new PlaneGeometry(0.96, 0.96), additive(glowTexture()), 49 * 3, 2);
    this.tiles.setColorAt(0, tmpC.set(0));
    this.rings = inst(
      new RingGeometry(0.86, 1, 64),
      new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide }),
      24,
      4,
    );
    this.rings.setColorAt(0, tmpC.set(0));
    this.sparks = inst(new PlaneGeometry(1, 1), additive(), maxParticles, 5);
    this.sparks.setColorAt(0, tmpC.set(0));
    this.beeMesh = inst(beeGeometry(), litMaterial, 64, 0);
    this.blades = inst(
      new TorusGeometry(0.42, 0.05, 6, 24, Math.PI * 1.2),
      new MeshStandardMaterial({ color: '#EEF2F2', metalness: 0.55, roughness: 0.22, emissive: '#7A6A3E', emissiveIntensity: 0.45 }),
      16,
      0,
    );
    this.beamMesh = inst(new PlaneGeometry(1, 1), additive(bandTexture()), 12, 3);
    this.beamMesh.setColorAt(0, tmpC.set(0));
  }

  telegraph(key: number, cells: readonly Pos[], kind: SpecialKind, alpha: number): void {
    if (alpha <= 0.01) this.tele.delete(key);
    else this.tele.set(key, { cells, kind, alpha });
  }

  sickle(pos: Pos, dir: 'h' | 'v', t01: number, level: number): void {
    const k = `${pos.x},${pos.y},${dir}`;
    if (t01 >= 1) {
      this.sweeps.delete(k);
      return;
    }
    const s = this.sweeps.get(k) ?? { pos, dir, t: 0, level, lastEmit: -1 };
    s.t = t01;
    this.sweeps.set(k, s);
  }

  dew(pos: Pos, radius: number, t01: number): void {
    const k = `${pos.x},${pos.y}`;
    if (t01 >= 1) this.dews.delete(k);
    else {
      if (!this.dews.has(k)) this.emitBurst(pos, new Color(PAL.dew), 16, 2.6, 0.5, 0.12);
      this.dews.set(k, { pos, radius, t: t01 });
    }
  }

  bees(from: Pos, cells: readonly Pos[], t01: number): void {
    const k = `${from.x},${from.y}`;
    if (t01 >= 1) this.flights.delete(k);
    else this.flights.set(k, { from, cells, t: t01 });
  }

  /** P1-17: one signature effect per combo family, centred on b. */
  combo(kind: ComboKind, pos: Pos, t01: number): void {
    const key = `${kind}:${pos.x},${pos.y}`;
    const first = !this.combos.has(key);
    if (t01 >= 1) {
      this.combos.delete(key);
      this.beams.delete(key);
    } else this.combos.add(key);
    const gold = new Color('#FFE3A0');
    const mist = new Color('#BFE8F6');
    const fade = Math.max(0, 1 - t01) * (t01 < 0.15 ? t01 / 0.15 : 1);
    if (kind === 'sickleSickle') {
      this.sickle(pos, 'h', t01, 0);
      this.sickle(pos, 'v', t01, 0);
      if (t01 < 1) this.beams.set(key, { lines: [{ axis: 'row', at: pos.y }, { axis: 'col', at: pos.x }], color: gold, alpha: fade });
      if (first) this.emitBurst(pos, gold, 24, 3.6, 0.9, 0.16);
    } else if (kind === 'sickleDew') {
      const lines: { axis: 'row' | 'col'; at: number }[] = [];
      for (const o of [-1, 0, 1]) {
        if (pos.y + o >= 0 && pos.y + o < 7) {
          this.sickle({ x: pos.x, y: pos.y + o }, 'h', t01, 0);
          lines.push({ axis: 'row', at: pos.y + o });
        }
        if (pos.x + o >= 0 && pos.x + o < 7) {
          this.sickle({ x: pos.x + o, y: pos.y }, 'v', t01, 0);
          lines.push({ axis: 'col', at: pos.x + o });
        }
      }
      if (t01 < 1) this.beams.set(key, { lines, color: gold.clone().lerp(mist, 0.5), alpha: fade * 0.8 });
      if (first) {
        this.emitBurst(pos, mist, 20, 3.2, 0.9, 0.14);
        this.emitBurst(pos, gold, 20, 3.8, 0.9, 0.12);
      }
    } else if (kind === 'dewDew') {
      this.dew(pos, 2.6, t01);
      this.dew({ x: pos.x + 0.001, y: pos.y }, 1.2, Math.min(1, t01 * 1.35));
      if (first) for (let k = 0; k < 3; k++) this.emitBurst(pos, mist, 18, 2.6 + k, 1.1, 0.14);
      if (t01 < 1 && Math.floor(t01 * 40) % 3 === 0) this.rain({ x: pos.x + Math.round((rnd() - 0.5) * 4), y: pos.y + Math.round((rnd() - 0.5) * 4) });
    } else if (kind === 'beeBee') {
      if (t01 < 1)
        for (let k = 0; k < 3; k++)
          this.spawn(cellX(rnd() * 6), 0.4 + rnd(), cellZ(rnd() * 6), (rnd() - 0.5) * 2, 1 + rnd(), (rnd() - 0.5) * 2, 0.7, 0.13, new Color(PAL.honey), 1, 1.5);
      if (first) this.emitBurst(pos, new Color(PAL.honey), 30, 4, 1, 0.14);
    } else if (first) {
      this.flashes.push({ pos, t: 0, color: new Color(PAL.honey) });
      this.emitBurst(pos, new Color(PAL.honey), 18, 3, 0.8, 0.12);
    }
  }

  harvestBurst(item: HarvestItem, depth: number): void {
    const boost = Math.min(2.2, 1 + 0.18 * (depth - 1));
    if (item.crop === null) return this.emitBurst(item.pos, new Color(PAL.honey), 6, 1.6, 0.5, 0.1);
    if (item.yield === 'crop') {
      this.emitBurst(item.pos, new Color(CROP_BY_ID[item.crop].color).lerp(new Color('#FFFFFF'), 0.15), Math.round(8 * boost), 2.4 * boost, 0.7, 0.13);
      this.emitBurst(item.pos, new Color(PAL.gold).lerp(new Color('#FFF6DA'), 0.4), Math.round(4 * boost), 3.2 * boost, 0.9, 0.08);
    } else if (item.yield === 'dewdrop') this.emitBurst(item.pos, new Color(PAL.dew), 6, 2, 0.6, 0.1);
    else this.emitBurst(item.pos, new Color(PAL.leafLight), 5, 1.4, 0.5, 0.09);
  }

  growSpark(pos: Pos): void {
    for (let i = 0; i < 3; i++)
      this.spawn(cellX(pos.x) + (rnd() - 0.5) * 0.4, 0.35, cellZ(pos.y) + (rnd() - 0.5) * 0.4, 0, 0.9 + rnd() * 0.5, 0, 0.7, 0.09, new Color('#CFF0B8'), 0, 1.5);
  }

  /** P2-11: dawn motes rising over one column of the field; leaves headroom under the particle cap. */
  morningShimmer(column: number, calm: boolean): void {
    const n = calm ? 3 : 9;
    const warm = new Color('#FFF1C4');
    const dew = new Color(PAL.dew).lerp(new Color('#FFFFFF'), 0.35);
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= this.maxParticles * 0.6) return;
      const lift = calm ? 0 : 0.25 + rnd() * 0.35;
      this.spawn(
        cellX(column) + (rnd() - 0.5) * 0.9,
        0.25 + rnd() * 0.5,
        cellZ(rnd() * 6),
        calm ? 0 : (rnd() - 0.5) * 0.15,
        lift,
        0,
        calm ? 0.9 : 1.1 + rnd() * 0.5,
        0.07 + rnd() * 0.05,
        rnd() < 0.5 ? warm : dew,
        0,
        calm ? 0 : 0.6,
      );
    }
  }

  /** P2-13 terrace level-up: a ring of gold motes around the terrace edge; still and sparser under reduced motion. */
  terraceSparkle(calm: boolean): void {
    const n = calm ? 12 : 36;
    const gold = new Color(PAL.gold).lerp(new Color('#FFF6DA'), 0.45);
    const leaf = new Color(PAL.leafLight).lerp(new Color('#FFFFFF'), 0.3);
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= this.maxParticles * 0.75) return;
      const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
      const r = 6.2 + rnd() * 0.9;
      const up = calm ? 0 : 1.2 + rnd() * 1.4;
      this.spawn(Math.cos(a) * r, 0.3 + rnd() * 0.8, Math.sin(a) * r, 0, up, 0, calm ? 0.8 : 0.9 + rnd() * 0.5, 0.1 + rnd() * 0.06, i % 3 ? gold : leaf, calm ? 0 : 1.2, calm ? 0 : 1.4);
    }
  }

  rain(pos: Pos): void {
    for (let i = 0; i < 7; i++)
      this.spawn(cellX(pos.x) + (rnd() - 0.5) * 0.7, 1.6 + rnd() * 0.6, cellZ(pos.y) + (rnd() - 0.5) * 0.7, 0, -2.5, 0, 0.55, 0.1, new Color(PAL.dew), 6, 0.2);
  }

  createdFlash(pos: Pos, kind: SpecialKind): void {
    const c = kind === 'dewOrb' ? new Color('#D5F0FA') : new Color('#FFE9B0');
    this.flashes.push({ pos, t: 0, color: c });
    this.emitBurst(pos, c, 14, 2.8, 0.8, 0.12);
  }

  shake(strength: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, strength);
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: Color, grav = 5, drag = 2.5) {
    if (this.particleScale < 1 && rnd() > this.particleScale) return;
    if (this.particles.length >= this.maxParticles) this.particles.shift();
    this.particles.push({ p: new Vector3(x, y, z), v: new Vector3(vx, vy, vz), life, max: life, size, color, grav, drag });
  }

  private emitBurst(pos: Pos, color: Color, n: number, speed: number, life: number, size: number) {
    const x = cellX(pos.x);
    const z = cellZ(pos.y);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const s = speed * (0.45 + rnd() * 0.55);
      this.spawn(x, 0.35 + rnd() * 0.2, z, Math.cos(a) * s * 0.55, s * (0.6 + rnd() * 0.6), Math.sin(a) * s * 0.55, life * (0.7 + rnd() * 0.5), size * (0.7 + rnd() * 0.6), color);
    }
  }

  update(dt: number, time: number, camQ: Quaternion): void {
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.8);

    let n = 0;
    for (const { cells, kind, alpha } of this.tele.values())
      for (const c of cells) {
        if (n >= 49 * 3) break;
        tmpM.compose(tmpP.set(cellX(c.x), 0.085, cellZ(c.y)), flatQ, tmpS.set(1, 1, 1));
        this.tiles.setMatrixAt(n, tmpM);
        this.tiles.setColorAt(n++, tmpC.copy(TELE_COLOR[kind]).multiplyScalar(0.55 * alpha));
      }
    this.tiles.count = n;
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;

    let nb = 0;
    for (const s of this.sweeps.values()) {
      const e = s.t < 0.5 ? 2 * s.t * s.t : 1 - (-2 * s.t + 2) ** 2 / 2;
      for (const sign of [-1, 1]) {
        const along = sign * (0.3 + e * 4.2);
        const x = s.dir === 'h' ? cellX(s.pos.x) + along : cellX(s.pos.x);
        const z = s.dir === 'v' ? cellZ(s.pos.y) + along : cellZ(s.pos.y);
        const inside = Math.abs(s.dir === 'h' ? x : z) < 3.7;
        if (!inside) continue;
        const yaw = s.dir === 'h' ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? -Math.PI / 2 : Math.PI / 2;
        tmpQ.setFromAxisAngle(UP, yaw).multiply(flatQ);
        tmpM.compose(tmpP.set(x, 0.42, z), tmpQ, tmpS.set(1, 1, 1));
        if (nb < 16) this.blades.setMatrixAt(nb++, tmpM);
        if (time - s.lastEmit > 0.016) {
          this.spawn(x, 0.4, z, (rnd() - 0.5) * 0.6, 0.8 + rnd(), (rnd() - 0.5) * 0.6, 0.45, 0.12, new Color('#FFF1CF'), 2, 3);
          this.spawn(x, 0.2, z, (rnd() - 0.5) * 1.2, 1.2 + rnd(), (rnd() - 0.5) * 1.2, 0.5, 0.08, new Color(PAL.leafLight), 5, 2);
        }
      }
      s.lastEmit = time;
    }
    this.blades.count = nb;
    this.blades.instanceMatrix.needsUpdate = true;

    let nbeam = 0;
    for (const b of this.beams.values())
      for (const l of b.lines) {
        if (nbeam >= 12) break;
        const pulse = 1 + 0.08 * Math.sin(time * 30);
        if (l.axis === 'row') tmpM.compose(tmpP.set(0, 0.13, cellZ(l.at)), flatQ, tmpS.set(7.6, 0.9 * pulse, 1));
        else tmpM.compose(tmpP.set(cellX(l.at), 0.13, 0), tmpQ.setFromAxisAngle(UP, Math.PI / 2).multiply(flatQ), tmpS.set(7.6, 0.9 * pulse, 1));
        this.beamMesh.setMatrixAt(nbeam, tmpM);
        this.beamMesh.setColorAt(nbeam++, tmpC.copy(b.color).multiplyScalar(b.alpha));
      }
    this.beamMesh.count = nbeam;
    this.beamMesh.instanceMatrix.needsUpdate = true;
    if (this.beamMesh.instanceColor) this.beamMesh.instanceColor.needsUpdate = true;

    let nr = 0;
    for (const d of this.dews.values()) {
      const r = 0.2 + d.t * (1.2 + d.radius);
      tmpM.compose(tmpP.set(cellX(d.pos.x), 0.12, cellZ(d.pos.y)), flatQ, tmpS.set(r, r, r));
      this.rings.setMatrixAt(nr, tmpM);
      this.rings.setColorAt(nr++, tmpC.set('#8FCBE4').multiplyScalar(0.9 * (1 - d.t)));
    }
    this.flashes = this.flashes.filter((f) => (f.t += dt / 0.45) < 1);
    for (const f of this.flashes) {
      if (nr >= 24) break;
      const r = 0.3 + f.t * 0.6;
      tmpM.compose(tmpP.set(cellX(f.pos.x), 0.1, cellZ(f.pos.y)), flatQ, tmpS.set(r, r, r));
      this.rings.setMatrixAt(nr, tmpM);
      this.rings.setColorAt(nr++, tmpC.copy(f.color).multiplyScalar(1 - f.t));
    }
    this.rings.count = nr;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;

    let nbee = 0;
    for (const f of this.flights.values()) {
      const targets = f.cells.slice(0, 20);
      targets.forEach((c, i) => {
        if (nbee >= 64) return;
        const t = Math.min(1, Math.max(0, f.t * 1.3 - i * 0.012));
        const sx = cellX(f.from.x);
        const sz = cellZ(f.from.y);
        const ex = cellX(c.x);
        const ez = cellZ(c.y);
        const h = 0.4 + 1.2 * Math.sin(Math.PI * t);
        const wob = 0.15 * Math.sin(time * 18 + i);
        tmpQ.setFromAxisAngle(UP, Math.atan2(ex - sx, ez - sz));
        tmpM.compose(tmpP.set(sx + (ex - sx) * t + wob, h, sz + (ez - sz) * t), tmpQ, tmpS.set(0.45, 0.45, 0.45));
        this.beeMesh.setMatrixAt(nbee++, tmpM);
      });
    }
    this.beeMesh.count = nbee;
    this.beeMesh.instanceMatrix.needsUpdate = true;

    let np = 0;
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.v.y -= p.grav * dt;
      p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.08) {
        p.p.y = 0.08;
        p.v.y *= -0.3;
      }
      keep.push(p);
      const k = p.life / p.max;
      const s = p.size * (0.4 + 0.6 * k);
      tmpM.compose(p.p, camQ, tmpS.set(s, s, s));
      this.sparks.setMatrixAt(np, tmpM);
      this.sparks.setColorAt(np++, tmpC.copy(p.color).multiplyScalar(Math.min(1, k * 1.6)));
    }
    this.particles = keep;
    this.sparks.count = np;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
  }

  get particleCount(): number {
    return this.particles.length;
  }

  clear(): void {
    this.beams.clear();
    this.combos.clear();
    this.tele.clear();
    this.sweeps.clear();
    this.dews.clear();
    this.flights.clear();
  }
}

