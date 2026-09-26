import { tileFromToken } from '@/core/board/ascii';
import type { BoardEvent, HarvestItem } from '@/core/board/events';
import { idx, type Pos, type SpecialKind, type Stage, type Tile } from '@/core/board/model';
import { applyEventToGrid } from '@/core/board/replay';
import type { CropId } from '@/core/config/crops';
import type { Tunables } from '@/core/config/tunables';
import type { Cue } from '@/state/bus';
import { clamp01, easeInOutCubic, easeInQuad, easeOutBack, easeOutCubic, hump, springOut } from './easing';
import { Timeline } from './timeline';

/** Imperative surfaces the choreographer drives (TilePool, VFX, HUD). Faked in tests. */
export interface ChoreoAdapters {
  tiles: {
    acquire(tile: Tile, x: number, y: number): void;
    release(uid: number): void;
    /** Cell-space position (fractional while moving) and lift above the soil. */
    setCell(uid: number, x: number, y: number, lift?: number): void;
    setPop(uid: number, scale: number, squash?: number): void;
    setGlow(uid: number, v: number): void;
    setStage(uid: number, stage: Stage): void;
    setSpecial(uid: number, kind: SpecialKind | null): void;
    setCrop(uid: number, crop: CropId): void;
  };
  vfx: {
    telegraph(key: number, cells: readonly Pos[], kind: SpecialKind, alpha: number): void;
    sickle(pos: Pos, dir: 'h' | 'v', t01: number, level: number): void;
    dew(pos: Pos, radius: number, t01: number): void;
    bees(from: Pos, cells: readonly Pos[], t01: number): void;
    harvestBurst(item: HarvestItem, depth: number): void;
    growSpark(pos: Pos): void;
    rain(pos: Pos): void;
    createdFlash(pos: Pos, kind: SpecialKind): void;
    shake(strength: number): void;
    combo(kind: ComboKind, pos: Pos, t01: number): void;
  };
  hud: {
    moveSpent(): void;
    delivered(crop: CropId, pos: Pos): void;
    dewdrops(n: number): void;
    cascade(depth: number): void;
    banner(text: string, tone: 'cascade' | 'order' | 'special'): void;
    rush(on: boolean): void;
  };
  sfx(cue: Cue): void;
}

export interface BuildOpts {
  /** Remaining order need at the start of the move, to announce the moment it completes. */
  remaining?: Partial<Record<CropId, number>>;
  reducedMotion?: boolean;
  unripeDewdrop?: number;
}

type Anim = Tunables['anim'];

/** 02 §3.5 combo families, each with its own演出 (P1-17). */
export type ComboKind = 'sickleSickle' | 'sickleDew' | 'dewDew' | 'beeBee' | 'beeSpecial';

export const COMBO_LABEL: Record<ComboKind, string> = {
  sickleSickle: '组合 · 十字镰',
  sickleDew: '组合 · 三垄收割',
  dewDew: '组合 · 晨露潮',
  beeBee: '组合 · 蜂群狂欢',
  beeSpecial: '组合 · 蜂群点化',
};

export const COMBO_MS: Record<ComboKind, number> = {
  sickleSickle: 460,
  sickleDew: 560,
  dewDew: 620,
  beeBee: 700,
  beeSpecial: 420,
};

/** Classify a combo from its level-0 triggers (planCombo emits [b, a]). */
export function comboKindOf(trig: readonly { kind: SpecialKind; via: string; level: number }[]): ComboKind | null {
  const pre = trig.filter((t) => t.via === 'combo' && t.level === 0);
  if (pre.length === 1 && pre[0]!.kind === 'bee') return 'beeSpecial';
  if (pre.length !== 2) return null;
  const fam = pre.map((t) => (t.kind === 'bee' ? 'b' : t.kind === 'dewOrb' ? 'd' : 's')).sort().join('');
  return fam === 'ss' ? 'sickleSickle' : fam === 'ds' ? 'sickleDew' : fam === 'dd' ? 'dewDew' : 'beeBee';
}
type Ev<T extends BoardEvent['t']> = Extract<BoardEvent, { t: T }>;

const SPECIAL_LABEL: Record<SpecialKind, string> = { sickleH: '镰刀', sickleV: '镰刀', dewOrb: '晨露珠', bee: '蜂群' };

/**
 * 03 §9.3 — events → timeline. A cursor walks the log; blocking blocks advance it, parallel ones share it.
 * `initial` is the presented grid before the first event (used to resolve uids by position).
 */
export function buildTimeline(
  events: readonly BoardEvent[],
  initial: readonly (Tile | null)[],
  ad: ChoreoAdapters,
  anim: Anim,
  opts: BuildOpts = {},
): Timeline {
  const tl = new Timeline();
  const grid = initial.slice();
  const rm = !!opts.reducedMotion;
  const remaining = { ...(opts.remaining ?? {}) };
  let orderAnnounced = Object.values(remaining).every((v) => !v);
  let cur = 0;
  let depth = 1;
  let key = 0;
  let pending: { trig: Ev<'specialTriggered'>[]; pollen: Pos[] } = { trig: [], pollen: [] };
  const tween = (start: number, duration: number, update: (t: number) => void, extra: { onStart?(): void; onEnd?(): void } = {}) =>
    tl.add({ start, duration, update, ...extra });
  const uidAt = (p: Pos) => grid[idx(p)]?.uid ?? -1;

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    switch (e.t) {
      case 'swap': {
        tl.cue(cur, () => {
          ad.hud.moveSpent();
          ad.sfx({ t: 'swap' });
        });
        tween(cur, anim.swap, (t) => {
          const k = easeInOutCubic(t);
          ad.tiles.setCell(e.uidA, e.a.x + (e.b.x - e.a.x) * k, e.a.y + (e.b.y - e.a.y) * k, rm ? 0 : 0.22 * hump(t));
          ad.tiles.setCell(e.uidB, e.b.x + (e.a.x - e.b.x) * k, e.b.y + (e.a.y - e.b.y) * k, 0);
        });
        cur += anim.swap;
        break;
      }
      case 'swapRejected': {
        const ua = uidAt(e.a);
        const ub = uidAt(e.b);
        tl.cue(cur, () => ad.sfx({ t: 'reject' }));
        tween(cur, anim.swapRejected, (t) => {
          const k = 0.38 * hump(t);
          ad.tiles.setCell(ua, e.a.x + (e.b.x - e.a.x) * k, e.a.y + (e.b.y - e.a.y) * k, rm ? 0 : 0.12 * hump(t));
          ad.tiles.setCell(ub, e.b.x + (e.a.x - e.b.x) * k, e.b.y + (e.a.y - e.b.y) * k, 0);
          ad.tiles.setGlow(ua, 0.35 * hump(t));
        });
        cur += anim.swapRejected;
        break;
      }
      case 'cascadeStep': {
        depth = e.depth;
        if (e.depth > 1) {
          const d = e.depth;
          tl.cue(cur, () => {
            ad.hud.cascade(d);
            if (d >= 3 && !rm) ad.vfx.shake(Math.min(0.8, 0.12 * d));
          });
          cur += anim.cascadeGap;
        }
        break;
      }
      case 'match': {
        const uids = e.groups.flatMap((g) => g.cells.map(uidAt));
        const size = uids.length;
        const d = depth;
        tl.cue(cur, () => ad.sfx({ t: 'match', depth: d, size }));
        tween(cur, anim.matchFlash, (t) => {
          for (const u of uids) {
            ad.tiles.setGlow(u, easeOutCubic(t));
            ad.tiles.setPop(u, 1 + 0.06 * easeOutCubic(t));
          }
        });
        cur += anim.matchFlash;
        break;
      }
      case 'specialTriggered':
        pending.trig.push(e);
        break;
      case 'pollinate':
        pending.pollen = e.cells;
        break;
      case 'harvest': {
        cur = playSpecials(tl, pending, cur, ad, anim, () => key++, rm);
        pending = { trig: [], pollen: [] };
        const d = anim.harvestPop;
        const n = e.items.length;
        const stagger = n > 1 ? Math.min(8, 72 / n) : 0;
        const dd = depth;
        e.items.forEach((it, k) => {
          tween(
            cur + k * stagger,
            d,
            (t) => {
              const s = t < 0.35 ? 1 + 0.26 * easeOutCubic(t / 0.35) : 1.26 * (1 - easeInQuad((t - 0.35) / 0.65));
              ad.tiles.setPop(it.uid, Math.max(0, s));
              ad.tiles.setGlow(it.uid, 1 - 0.5 * t);
              ad.tiles.setCell(it.uid, it.pos.x, it.pos.y, rm ? 0 : 0.3 * easeOutCubic(t));
            },
            {
              onEnd: () => {
                ad.tiles.release(it.uid);
                ad.vfx.harvestBurst(it, dd);
                ad.sfx({ t: 'harvest', stage: it.stage, delivered: it.delivered, depth: dd });
                if (it.delivered && it.crop) {
                  ad.hud.delivered(it.crop, it.pos);
                  remaining[it.crop] = (remaining[it.crop] ?? 0) - 1;
                  if (!orderAnnounced && Object.values(remaining).every((v) => !v || v <= 0)) {
                    orderAnnounced = true;
                    ad.hud.banner('订单完成', 'order');
                    ad.sfx({ t: 'orderDone' });
                  }
                } else if (it.yield === 'dewdrop') ad.hud.dewdrops(opts.unripeDewdrop ?? 1);
              },
            },
          );
        });
        cur += d + stagger * Math.max(0, n - 1);
        break;
      }
      case 'specialCreated': {
        const d = anim.spawnPop;
        const tile: Tile =
          e.kind === 'bee'
            ? { uid: e.uid, kind: 'bee' }
            : { uid: e.uid, kind: 'crop', crop: e.crop!, stage: e.stage!, special: e.kind };
        tween(
          cur,
          d * 1.8,
          (t) => {
            ad.tiles.setPop(e.uid, rm ? 1 : springOut(t));
            ad.tiles.setGlow(e.uid, 1 - t);
          },
          {
            onStart: () => {
              ad.tiles.acquire(tile, e.pos.x, e.pos.y);
              ad.vfx.createdFlash(e.pos, e.kind);
              ad.sfx({ t: 'created', kind: e.kind });
              ad.hud.banner(`生成${SPECIAL_LABEL[e.kind]}`, 'special');
            },
          },
        );
        break;
      }
      case 'grow': {
        const hub = e.cause === 'water' || e.cause === 'overnight';
        const d = anim.grow * (hub ? 1.8 : 1);
        const overnight = e.cause === 'overnight';
        const offset = (p: Pos, k: number) => (overnight ? p.x * 260 + p.y * 30 : e.cause === 'water' ? p.x * 60 : k * anim.growStagger);
        const n = e.items.length;
        tl.cue(cur, () => ad.sfx({ t: 'grow', count: n }));
        if (e.cause === 'water') for (const it of e.items) tl.cue(cur + it.pos.x * 60 - 120, () => ad.vfx.rain(it.pos));
        let span = 0;
        e.items.forEach((it, k) => {
          let switched = false;
          const s0 = cur + offset(it.pos, k);
          span = Math.max(span, s0 + d - cur);
          tween(s0, d, (t) => {
            if (!switched && t >= 0.45) {
              switched = true;
              ad.tiles.setStage(it.uid, it.to);
              ad.vfx.growSpark(it.pos);
            }
            const s = t < 0.45 ? 1 - 0.16 * easeOutCubic(t / 0.45) : 0.84 + 0.16 * (rm ? (t - 0.45) / 0.55 : springOut((t - 0.45) / 0.55));
            ad.tiles.setPop(it.uid, s, rm ? 0 : 0.14 * hump(t));
            ad.tiles.setGlow(it.uid, 0.45 * hump(t));
          });
        });
        cur += span;
        break;
      }
      case 'fall':
      case 'spawn': {
        const fall = e.t === 'fall' ? e : null;
        let spawn: Ev<'spawn'> | null = e.t === 'spawn' ? e : null;
        const next = events[i + 1];
        if (fall && next?.t === 'spawn') {
          spawn = next;
          applyEventToGrid(grid, e);
          i++;
        }
        cur = playFallAndSpawn(tween, fall, spawn, cur, ad, anim, rm);
        if (spawn) applyEventToGrid(grid, spawn);
        else applyEventToGrid(grid, e);
        continue;
      }
      case 'shuffle': {
        tl.cue(cur, () => ad.hud.banner('田里重新排了排', 'cascade'));
        for (const it of e.items)
          tween(cur, 520, (t) => {
            const k = easeInOutCubic(t);
            ad.tiles.setCell(it.uid, it.from.x + (it.to.x - it.from.x) * k, it.from.y + (it.to.y - it.from.y) * k, rm ? 0 : 0.9 * hump(t));
          });
        cur += 520;
        break;
      }
      case 'recolor':
        for (const it of e.items)
          tween(cur, 240, (t) => {
            if (t >= 0.5) ad.tiles.setCrop(it.uid, it.crop);
            ad.tiles.setGlow(it.uid, hump(t));
          });
        cur += 240;
        break;
      case 'convert':
        e.items.forEach((it, k) =>
          tween(cur + k * anim.rushConvertStagger, 220, (t) => {
            if (t >= 0.3) ad.tiles.setSpecial(it.uid, it.kind);
            ad.tiles.setGlow(it.uid, hump(t));
            ad.tiles.setPop(it.uid, 1 + 0.2 * hump(t));
          }),
        );
        cur += e.items.length * anim.rushConvertStagger + 220;
        break;
      case 'beePlaced': {
        const tile: Tile = { uid: e.uid, kind: 'bee' };
        tween(
          cur,
          anim.harvestPop,
          (t) => ad.tiles.setPop(e.replacedUid, 1 - easeInQuad(t)),
          { onEnd: () => ad.tiles.release(e.replacedUid) },
        );
        tween(
          cur + anim.harvestPop * 0.6,
          anim.beeFlight,
          (t) => {
            ad.tiles.setCell(e.uid, e.pos.x, e.pos.y, rm ? 0 : 1.6 * (1 - easeOutCubic(t)));
            ad.tiles.setPop(e.uid, rm ? 1 : springOut(t));
          },
          {
            onStart: () => {
              ad.tiles.acquire(tile, e.pos.x, e.pos.y);
              ad.sfx({ t: 'special', kind: 'bee', level: 0 });
            },
            onEnd: () => ad.vfx.createdFlash(e.pos, 'bee'),
          },
        );
        cur += anim.harvestPop * 0.6 + anim.beeFlight;
        break;
      }
      case 'rushStart': {
        tl.cue(cur, () => {
          ad.hud.rush(true);
          ad.hud.banner('丰收时刻', 'order');
          ad.sfx({ t: 'orderDone' });
        });
        cur += 600;
        break;
      }
      case 'rushEnd':
        tl.cue(cur, () => ad.hud.rush(false));
        cur += 200;
        break;
      case 'runEnded': {
        const result = e.result;
        tl.cue(cur + 120, () => ad.sfx({ t: 'runEnded', result }));
        cur += 360;
        break;
      }
      default:
        break;
    }
    applyEventToGrid(grid, e);
  }
  return tl;
}

function playFallAndSpawn(
  tween: (s: number, d: number, u: (t: number) => void, x?: { onStart?(): void; onEnd?(): void }) => void,
  fall: Ev<'fall'> | null,
  spawn: Ev<'spawn'> | null,
  cur: number,
  ad: ChoreoAdapters,
  anim: Anim,
  rm: boolean,
): number {
  let end = cur;
  let landed = false;
  for (const it of fall?.items ?? []) {
    const dist = it.to.y - it.from.y;
    const d = anim.fallPerCell * dist + 70;
    const s0 = cur + it.to.x * anim.fallColumnStagger;
    end = Math.max(end, s0 + d);
    tween(
      s0,
      d,
      (t) => {
        const k = clamp01(t / 0.8);
        ad.tiles.setCell(it.uid, it.to.x, it.from.y + dist * easeInQuad(k), 0);
        ad.tiles.setPop(it.uid, 1, t > 0.8 && !rm ? -0.16 * hump((t - 0.8) / 0.2) : 0);
      },
      {
        onEnd: () => {
          if (!landed) ad.sfx({ t: 'land' });
          landed = true;
        },
      },
    );
  }
  for (const it of spawn?.items ?? []) {
    const tile = tileFromToken(it.token, it.uid);
    const fromY = it.pos.y - it.entryOffset - 0.4;
    const dist = it.pos.y - fromY;
    const d = anim.fallPerCell * dist + anim.spawnPop;
    const s0 = cur + it.pos.x * anim.fallColumnStagger + 20;
    end = Math.max(end, s0 + d);
    tween(
      s0,
      d,
      (t) => {
        const k = clamp01(t / 0.78);
        ad.tiles.setCell(it.uid, it.pos.x, fromY + dist * easeInQuad(k), rm ? 0 : 0.6 * (1 - easeOutCubic(k)));
        const grow = rm ? 1 : Math.min(1.08, easeOutBack(clamp01(t * 1.25), 1.6));
        ad.tiles.setPop(it.uid, grow, t > 0.78 && !rm ? -0.14 * hump((t - 0.78) / 0.22) : 0);
      },
      { onStart: () => ad.tiles.acquire(tile, it.pos.x, fromY) },
    );
  }
  return end;
}

/** Specials fire between the match flash and the harvest pop, staggered by BFS level (02 §3.4, 01 RD-7). */
function playSpecials(
  tl: Timeline,
  pending: { trig: Ev<'specialTriggered'>[]; pollen: Pos[] },
  cur: number,
  ad: ChoreoAdapters,
  anim: Anim,
  nextKey: () => number,
  rm: boolean,
): number {
  let end = cur;
  const combo = comboKindOf(pending.trig);
  let rest = pending.trig;
  if (combo) {
    const pre = pending.trig.filter((t) => t.via === 'combo' && t.level === 0);
    rest = pending.trig.filter((t) => !pre.includes(t));
    const center = pre[0]!;
    const other = pre[1];
    const key = nextKey();
    const tele = Math.round(anim.specialTelegraph * 1.5);
    const fx = COMBO_MS[combo];
    const area = center.area;
    tl.cue(cur, () => ad.hud.banner(COMBO_LABEL[combo], 'special'));
    tl.add({
      start: cur,
      duration: tele,
      update: (t) => {
        ad.vfx.telegraph(key, area, center.kind, easeOutCubic(t));
        if (other) {
          const k = easeInQuad(t);
          ad.tiles.setCell(other.uid, other.pos.x + (center.pos.x - other.pos.x) * k, other.pos.y + (center.pos.y - other.pos.y) * k, rm ? 0 : 0.35 * hump(t));
          ad.tiles.setPop(other.uid, 1 - 0.6 * k);
        }
        ad.tiles.setGlow(center.uid, t);
        ad.tiles.setPop(center.uid, 1 + (rm ? 0 : 0.35 * easeOutCubic(t)));
      },
    });
    tl.cue(cur + tele, () => {
      ad.sfx({ t: 'special', kind: center.kind, level: 0 });
      ad.sfx({ t: 'created', kind: 'combo' });
      if (!rm) ad.vfx.shake(0.9);
    });
    tl.add({
      start: cur + tele,
      duration: fx,
      update: (t) => {
        ad.vfx.telegraph(key, area, center.kind, 1 - easeInQuad(t));
        ad.vfx.combo(combo, center.pos, t);
      },
    });
    cur += tele + Math.round(fx * 0.6);
    end = cur;
  }
  for (const s of rest) {
    const key = nextKey();
    const start = cur + s.level * anim.chainDelay;
    const tele = anim.specialTelegraph;
    const fx = s.kind === 'dewOrb' ? anim.dewBurst : s.kind === 'bee' ? anim.beeFlight : anim.sickleSweep;
    tl.add({ start, duration: tele, update: (t) => ad.vfx.telegraph(key, s.area, s.kind, easeOutCubic(t)) });
    tl.cue(start + tele, () => {
      ad.sfx({ t: 'special', kind: s.kind, level: s.level });
      if (!rm) ad.vfx.shake(s.kind === 'bee' ? 0.5 : 0.3 + 0.1 * Math.min(4, s.level));
    });
    tl.add({
      start: start + tele,
      duration: fx,
      update: (t) => {
        ad.vfx.telegraph(key, s.area, s.kind, 1 - easeInQuad(t));
        if (s.kind === 'sickleH' || s.kind === 'sickleV') ad.vfx.sickle(s.pos, s.kind === 'sickleH' ? 'h' : 'v', t, s.level);
        else if (s.kind === 'dewOrb') ad.vfx.dew(s.pos, s.via === 'combo' ? 2 : 1, t);
        else ad.vfx.bees(s.pos, pending.pollen.length ? pending.pollen : s.area, t);
      },
    });
    end = Math.max(end, start + tele + fx * 0.72);
  }
  return end;
}

export type TileAdapter = ChoreoAdapters['tiles'];
export type VfxAdapter = ChoreoAdapters['vfx'];
