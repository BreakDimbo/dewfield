import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import type { Board, CropSpecial, SpecialKind, Stage, Tile } from '@/core/board/model';
import type { CropId } from '@/core/config/crops';
import type { TileAdapter } from '@/render/choreo/builder';
import { blobShadowTexture, glowTexture } from '@/render/assets/greybox';
import { geometryOf, manifest } from '@/render/assets/manifest';
import { cellX, cellZ } from './layout';

/** RD-2 scale channel. */
export const STAGE_SCALE: Record<Stage, number> = { 0: 0.55, 1: 0.8, 2: 1 };
const SOIL = 0.065;

interface Slot {
  mesh: Mesh;
  uid: number;
  tile: Tile | null;
  cx: number;
  cy: number;
  lift: number;
  pop: number;
  squash: number;
  glow: number;
  phase: number;
}

export interface Highlight {
  selected: { x: number; y: number } | null;
  guide: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
  nudge: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
  hint: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
  idle: boolean;
}

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpP = new Vector3();
const tmpC = new Color();
const flatQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const markerQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.55);
const UP = new Vector3(0, 1, 0);
const FWD = new Vector3(0, 0, 1);
const WARM = new Color('#FFE7B8');
const COOL = new Color('#CDEBFF');

/** 03 §8.2 — pooled tiles updated imperatively; React renders this once. */
export class TilePool implements TileAdapter {
  readonly group = new Group();
  readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0, envMapIntensity: 0.95 });
  private readonly slots: Slot[] = [];
  private readonly free: Slot[] = [];
  private readonly byUid = new Map<number, Slot>();
  private readonly rims: InstancedMesh;
  private readonly markers: Record<CropSpecial, InstancedMesh>;
  private readonly glow: InstancedMesh;
  private readonly shadows: InstancedMesh;

  constructor(capacity = 112) {
    const inst = (geo: BufferGeometry, mat: MeshStandardMaterial | MeshBasicMaterial, order = 0) => {
      const m = new InstancedMesh(geo, mat, capacity);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = order;
      this.group.add(m);
      return m;
    };
    this.shadows = inst(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, toneMapped: false }),
      1,
    );
    this.rims = inst(geometryOf(manifest.rimRipe()), this.material);
    this.markers = {
      sickleH: inst(geometryOf(manifest.marker('sickleH')), this.material),
      sickleV: inst(geometryOf(manifest.marker('sickleV')), this.material),
      dewOrb: inst(geometryOf(manifest.marker('dewOrb')), this.material),
    };
    const glowMat = new MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    this.glow = inst(new PlaneGeometry(1, 1), glowMat, 3);
    this.glow.setColorAt(0, tmpC.set(0));
    for (let i = 0; i < capacity; i++) {
      const mesh = new Mesh(geometryOf(manifest.crop('carrot', 2)), this.material);
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      const slot: Slot = { mesh, uid: -1, tile: null, cx: 0, cy: 0, lift: 0, pop: 1, squash: 0, glow: 0, phase: 0 };
      this.slots.push(slot);
      this.free.push(slot);
    }
  }

  private previewGrowth = 0;

  private geometryFor(t: Tile): BufferGeometry {
    if (t.kind === 'bee') return geometryOf(manifest.bee());
    const stage = Math.min(2, t.stage + this.previewGrowth) as Stage;
    return geometryOf(manifest.crop(t.crop, stage));
  }

  /** P2-19: show every crop `n` stages ahead (0 = real). Purely visual. */
  setPreviewGrowth(n: number): void {
    if (n === this.previewGrowth) return;
    this.previewGrowth = n;
    for (const s of this.byUid.values()) if (s.tile) s.mesh.geometry = this.geometryFor(s.tile);
  }

  acquire(tile: Tile, x: number, y: number): void {
    if (this.byUid.has(tile.uid)) this.release(tile.uid);
    const s = this.free.pop();
    if (!s) throw new Error('TilePool exhausted');
    Object.assign(s, { uid: tile.uid, tile, cx: x, cy: y, lift: 0, pop: 1, squash: 0, glow: 0, phase: (tile.uid * 2.399) % 6.283 });
    s.mesh.geometry = this.geometryFor(tile);
    s.mesh.visible = true;
    this.byUid.set(tile.uid, s);
  }

  release(uid: number): void {
    const s = this.byUid.get(uid);
    if (!s) return;
    s.mesh.visible = false;
    s.tile = null;
    s.uid = -1;
    this.byUid.delete(uid);
    this.free.push(s);
  }

  setCell(uid: number, x: number, y: number, lift = 0): void {
    const s = this.byUid.get(uid);
    if (!s) return;
    s.cx = x;
    s.cy = y;
    s.lift = lift;
  }
  setPop(uid: number, scale: number, squash = 0): void {
    const s = this.byUid.get(uid);
    if (!s) return;
    s.pop = scale;
    s.squash = squash;
  }
  setGlow(uid: number, v: number): void {
    const s = this.byUid.get(uid);
    if (s) s.glow = v;
  }
  private retile(uid: number, f: (t: Tile & { kind: 'crop' }) => Tile) {
    const s = this.byUid.get(uid);
    if (!s || !s.tile || s.tile.kind !== 'crop') return;
    s.tile = f(s.tile);
    s.mesh.geometry = this.geometryFor(s.tile);
  }
  setStage(uid: number, stage: Stage): void {
    this.retile(uid, (t) => ({ ...t, stage }));
  }
  setSpecial(uid: number, kind: SpecialKind | null): void {
    this.retile(uid, (t) => ({ ...t, special: kind === 'bee' ? t.special : kind }));
  }
  setCrop(uid: number, crop: CropId): void {
    this.retile(uid, (t) => ({ ...t, crop }));
  }

  snap(board: Board | null): void {
    for (const uid of [...this.byUid.keys()]) this.release(uid);
    board?.cells.forEach((t, i) => this.acquire(t, i % 7, Math.floor(i / 7)));
  }

  /** What the player currently sees — compared against the logical board after each timeline (03 §9.6). */
  snapshot(): { uid: number; x: number; y: number; tile: Tile }[] {
    const out: { uid: number; x: number; y: number; tile: Tile }[] = [];
    for (const s of this.byUid.values()) if (s.tile) out.push({ uid: s.uid, x: Math.round(s.cx), y: Math.round(s.cy), tile: s.tile });
    return out;
  }

  mismatches(board: Board): number {
    let bad = 0;
    const seen = this.snapshot();
    if (seen.length !== 49) bad += Math.abs(49 - seen.length);
    for (const v of seen) {
      const t = board.cells[v.y * 7 + v.x];
      if (!t || t.uid !== v.uid || JSON.stringify(t) !== JSON.stringify(v.tile)) bad++;
    }
    return bad;
  }

  update(time: number, camQ: Quaternion, hl: Highlight): void {
    let nRim = 0;
    let nGlow = 0;
    let nShadow = 0;
    const nM: Record<CropSpecial, number> = { sickleH: 0, sickleV: 0, dewOrb: 0 };
    const breathe = 0.5 + 0.5 * Math.sin(time * 3.2);
    for (const s of this.byUid.values()) {
      const t = s.tile!;
      const rx = Math.round(s.cx);
      const ry = Math.round(s.cy);
      const settled = Math.abs(s.cx - rx) < 0.01 && Math.abs(s.cy - ry) < 0.01;
      const isSel = !!hl.selected && settled && hl.selected.x === rx && hl.selected.y === ry;
      const isGuide =
        !!hl.guide && settled && ((hl.guide.a.x === rx && hl.guide.a.y === ry) || (hl.guide.b.x === rx && hl.guide.b.y === ry));
      let nx = 0;
      let ny = 0;
      if (hl.nudge && settled) {
        const { a, b } = hl.nudge;
        if (a.x === rx && a.y === ry) {
          nx = (b.x - a.x) * 0.22;
          ny = (b.y - a.y) * 0.22;
        } else if (b.x === rx && b.y === ry) {
          nx = (a.x - b.x) * 0.12;
          ny = (a.y - b.y) * 0.12;
        }
      }
      const isHint =
        !!hl.hint && settled && ((hl.hint.a.x === rx && hl.hint.a.y === ry) || (hl.hint.b.x === rx && hl.hint.b.y === ry));
      const stage = t.kind === 'crop' ? (Math.min(2, t.stage + this.previewGrowth) as Stage) : 2;
      const base = t.kind === 'bee' ? 1.4 : STAGE_SCALE[stage];
      const sc = base * s.pop * (isSel ? 1.08 : 1);
      const ripeBob = hl.idle && t.kind === 'crop' && stage === 2 ? 0.014 * Math.sin(time * 2.1 + s.phase) : 0;
      const beeHover = t.kind === 'bee' ? 0.08 + 0.04 * Math.sin(time * 5 + s.phase) : 0;
      const wiggle = isHint ? Math.sin(time * 16) * 0.22 * Math.max(0, Math.sin(time * 2.2)) : 0;
      const lift = s.lift + ripeBob + beeHover + (isSel ? 0.16 + 0.03 * breathe : 0) + (isHint ? 0.06 * Math.abs(wiggle) : 0);
      const X = cellX(s.cx + nx);
      const Z = cellZ(s.cy + ny);
      const sq = s.squash;
      tmpP.set(X, SOIL + lift, Z);
      tmpS.set(sc * (1 - sq * 0.5), sc * (1 + sq), sc * (1 - sq * 0.5));
      tmpQ.identity();
      if (t.kind === 'bee') tmpQ.setFromAxisAngle(UP, Math.sin(time * 1.3 + s.phase) * 0.6);
      else if (wiggle) tmpQ.setFromAxisAngle(FWD, wiggle);
      s.mesh.matrix.compose(tmpP, tmpQ, tmpS);
      s.mesh.matrixWorldNeedsUpdate = true;

      if (s.pop > 0.05) {
        const shadowS = (t.kind === 'bee' ? 0.55 : 0.74) * base * Math.min(1.2, s.pop) * (1 - Math.min(0.5, lift * 0.8));
        tmpM.compose(tmpP.set(X, SOIL + 0.004, Z), flatQ, tmpS.set(shadowS, shadowS, 1));
        this.shadows.setMatrixAt(nShadow++, tmpM);
      }
      if (t.kind === 'crop' && stage === 2 && s.pop > 0.25) {
        const r = Math.min(1, s.pop);
        tmpM.compose(tmpP.set(X, 0, Z), tmpQ.identity(), tmpS.set(r, 1, r));
        this.rims.setMatrixAt(nRim++, tmpM);
      }
      if (t.kind === 'crop' && t.special) {
        const h = SOIL + lift + 0.84 * sc + 0.22 + 0.03 * Math.sin(time * 2.4 + s.phase);
        const ms = 1.2 * Math.min(1.1, s.pop);
        const spin = t.special === 'dewOrb' ? tmpQ.setFromAxisAngle(UP, time * 0.8) : tmpQ.copy(markerQ);
        tmpM.compose(tmpP.set(X, h, Z), spin, tmpS.set(ms, ms, ms));
        this.markers[t.special].setMatrixAt(nM[t.special]++, tmpM);
      }
      const g = Math.max(s.glow, isSel ? 0.55 + 0.25 * breathe : 0, isGuide ? 0.25 + 0.45 * breathe : 0);
      if (g > 0.01) {
        const gs = 1.0 + 0.3 * g;
        tmpM.compose(tmpP.set(X, SOIL + lift + 0.4 * sc, Z), camQ, tmpS.set(gs, gs, gs));
        this.glow.setMatrixAt(nGlow, tmpM);
        this.glow.setColorAt(nGlow++, tmpC.copy(isGuide && s.glow < 0.01 ? COOL : WARM).multiplyScalar(Math.min(1, g) * 0.6));
      }
    }
    this.shadows.count = nShadow;
    this.rims.count = nRim;
    this.glow.count = nGlow;
    for (const k of Object.keys(nM) as CropSpecial[]) {
      this.markers[k].count = nM[k];
      this.markers[k].instanceMatrix.needsUpdate = true;
    }
    this.shadows.instanceMatrix.needsUpdate = true;
    this.rims.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
    if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
  }
}
