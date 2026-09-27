import { describe, expect, it } from 'vitest';
import type { BoardEvent } from '@/core/board/events';
import { COMMISSION_BY_ID } from '@/core/config/commissions';
import { VS_TUNABLES } from '@/core/config/tunables';
import { applyMove, createRun } from '@/core/run/run';
import { checker } from '@/core/testkit/checker';
import { mv, sandboxCommission, t1Run } from '@/core/testkit/runs';
import { buildTimeline, COMBO_LABEL, comboKindOf, type ChoreoAdapters, type ComboKind } from './builder';

function fakeAdapters() {
  const log: { t: number; what: string }[] = [];
  const clock = { now: 0 };
  const rec = (what: string) => log.push({ t: clock.now, what });
  const positions = new Map<number, [number, number]>();
  const hud = { delivered: 0, moves: 0, dew: 0 };
  const ad: ChoreoAdapters = {
    tiles: {
      acquire: (tile, x, y) => {
        positions.set(tile.uid, [x, y]);
        rec(`acquire:${tile.uid}`);
      },
      release: (uid) => {
        positions.delete(uid);
        rec(`release:${uid}`);
      },
      setCell: (uid, x, y) => positions.set(uid, [x, y]),
      setPop: () => {},
      setGlow: () => {},
      setStage: (uid, s) => rec(`stage:${uid}:${s}`),
      setSpecial: () => {},
      setCrop: () => {},
    },
    vfx: {
      telegraph: () => {},
      sickle: () => {},
      dew: () => {},
      bees: () => {},
      harvestBurst: () => {},
      growSpark: () => {},
      morningShimmer: (x, calm) => rec(`shimmer:${x}:${calm}`),
      rain: () => {},
      createdFlash: () => rec('createdFlash'),
      shake: () => {},
      combo: (k) => rec(`combo:${k}`),
    },
    hud: {
      moveSpent: () => {
        hud.moves++;
        rec('hud:move');
      },
      delivered: (_c, _p) => {
        hud.delivered++;
        rec('hud:delivered');
      },
      dewdrops: (n) => (hud.dew += n),
      cascade: (d) => rec(`hud:cascade:${d}`),
      banner: (text) => rec(`banner:${text}`),
      rush: (on) => rec(`rush:${on}`),
    },
    sfx: (c) => rec(`sfx:${c.t}`),
  };
  return { ad, log, clock, positions, hud };
}

const anim = VS_TUNABLES.anim;
const guided = COMMISSION_BY_ID.T1!.guidedMoves!.map((g) => mv(g.a[0], g.a[1], g.b[0], g.b[1]));

function play(events: BoardEvent[], initial: Parameters<typeof buildTimeline>[1], remaining = {}, reducedMotion = false) {
  const f = fakeAdapters();
  initial.forEach((t, i) => t && f.positions.set(t.uid, [i % 7, Math.floor(i / 7)]));
  const tl = buildTimeline(events, initial, f.ad, anim, { remaining, reducedMotion });
  while (!tl.done) {
    f.clock.now = tl.time;
    tl.advance(4);
  }
  return { ...f, tl };
}

describe('buildTimeline (03 §9.3)', () => {
  it('T1 step 1: swap → match flash → harvest pop → fall + spawn, on the documented clock', () => {
    const run = t1Run(VS_TUNABLES);
    const r = applyMove(run, guided[0]!, VS_TUNABLES);
    if (!r.ok) throw new Error();
    const { log, positions, hud, tl } = play(r.events, run.board.cells, { carrot: 10 });
    const first = (what: string) => log.find((l) => l.what === what)!.t;
    expect(first('sfx:swap')).toBe(0);
    expect(first('sfx:match')).toBeGreaterThanOrEqual(anim.swap - 4);
    const firstRelease = log.find((l) => l.what.startsWith('release'))!.t;
    expect(firstRelease).toBeGreaterThanOrEqual(anim.swap + anim.matchFlash + anim.harvestPop - 8);
    expect(log.findIndex((l) => l.what.startsWith('acquire'))).toBeGreaterThan(log.findIndex((l) => l.what.startsWith('release')));
    expect(hud).toMatchObject({ delivered: 3, moves: 1 });
    expect(positions.size).toBe(49);
    for (const [uid, [x, y]] of positions) {
      const i = r.run.board.cells.findIndex((t) => t.uid === uid);
      expect([x, y]).toEqual([i % 7, Math.floor(i / 7)]);
    }
    expect(tl.duration).toBeLessThan(1200);
  });

  it('HUD numbers only move on cues, never at commit time', () => {
    const run = t1Run(VS_TUNABLES);
    const r = applyMove(run, guided[0]!, VS_TUNABLES);
    if (!r.ok) throw new Error();
    const f = fakeAdapters();
    const tl = buildTimeline(r.events, run.board.cells, f.ad, anim, { remaining: { carrot: 10 } });
    expect(f.hud).toEqual({ delivered: 0, moves: 0, dew: 0 });
    tl.advance(anim.swap + anim.matchFlash);
    expect(f.hud.delivered).toBe(0);
    tl.skipToEnd();
    expect(f.hud.delivered).toBe(3);
  });

  it('T1 step 3: special telegraph precedes its sweep; cascades announce depth; order completion bannered', () => {
    let run = t1Run(VS_TUNABLES);
    for (const m of guided.slice(0, 2)) {
      const r = applyMove(run, m, VS_TUNABLES);
      if (!r.ok) throw new Error();
      run = r.run;
    }
    const r = applyMove(run, guided[2]!, VS_TUNABLES);
    if (!r.ok) throw new Error();
    const { log } = play(r.events, run.board.cells, { carrot: 3 });
    const t = (w: string) => log.find((l) => l.what === w)?.t ?? -1;
    expect(t('sfx:special')).toBeGreaterThanOrEqual(anim.swap + anim.matchFlash + anim.specialTelegraph - 8);
    expect(t('hud:cascade:2')).toBeGreaterThan(t('sfx:special'));
    expect(log.filter((l) => l.what === 'banner:订单完成')).toHaveLength(1);
    expect(t('sfx:runEnded')).toBeGreaterThan(t('banner:订单完成'));
  });

  it('special creation pops in after the harvest', () => {
    let run = t1Run(VS_TUNABLES);
    const r1 = applyMove(run, guided[0]!, VS_TUNABLES);
    if (!r1.ok) throw new Error();
    run = r1.run;
    const r = applyMove(run, guided[1]!, VS_TUNABLES);
    if (!r.ok) throw new Error();
    const { log } = play(r.events, run.board.cells, { carrot: 7 });
    const created = log.find((l) => l.what === 'createdFlash')!.t;
    const lastRelease = Math.max(...log.filter((l) => l.what.startsWith('release')).map((l) => l.t));
    expect(created).toBeGreaterThanOrEqual(lastRelease - 60);
    expect(log.some((l) => l.what === 'banner:生成镰刀')).toBe(true);
  });

  it('rejected swaps nudge and return without spending a move', () => {
    const run = t1Run(VS_TUNABLES);
    const { hud, log, tl } = play([{ t: 'swapRejected', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }], run.board.cells);
    expect(hud.moves).toBe(0);
    expect(log.map((l) => l.what)).toEqual(['sfx:reject']);
    expect(tl.duration).toBe(anim.swapRejected);
  });

  it('overnight growth sweeps left to right', () => {
    const run = t1Run(VS_TUNABLES);
    const young = run.board.cells.slice(0, 7);
    const events: BoardEvent[] = [
      { t: 'grow', cause: 'overnight', items: young.map((t, x) => ({ pos: { x, y: 0 }, uid: t.uid, from: 0, to: 1 })) },
    ];
    const { log } = play(events, run.board.cells);
    const stages = log.filter((l) => l.what.startsWith('stage'));
    expect(stages).toHaveLength(7);
    for (let k = 1; k < stages.length; k++) expect(stages[k]!.t).toBeGreaterThan(stages[k - 1]!.t);
  });

  it('overnight wave wakes the field with a column-by-column morning shimmer (P2-11); watering does not', () => {
    const run = t1Run(VS_TUNABLES);
    const row = run.board.cells.slice(0, 7);
    const grow = (cause: 'overnight' | 'water'): BoardEvent[] => [
      { t: 'grow', cause, items: row.map((t, x) => ({ pos: { x, y: 0 }, uid: t.uid, from: 0, to: 1 })) },
    ];
    const night = play(grow('overnight'), run.board.cells).log.filter((l) => l.what.startsWith('shimmer'));
    expect(night.map((l) => l.what)).toEqual([0, 1, 2, 3, 4, 5, 6].map((x) => `shimmer:${x}:false`));
    for (let k = 1; k < night.length; k++) expect(night[k]!.t).toBeGreaterThan(night[k - 1]!.t);
    const calm = play(grow('overnight'), run.board.cells, {}, true).log.filter((l) => l.what.startsWith('shimmer'));
    expect(calm.every((l) => l.what.endsWith(':true'))).toBe(true);
    expect(calm).toHaveLength(7);
    expect(play(grow('water'), run.board.cells).log.some((l) => l.what.startsWith('shimmer'))).toBe(false);
  });
});

describe('combo choreography (P1-17)', () => {
  const cases: [string, Record<string, string>, [number, number, number, number], string][] = [
    ['sickle + sickle', { '2,3': 'C2h', '3,3': 'E2v' }, [2, 3, 3, 3], 'sickleSickle'],
    ['sickle + dew', { '3,2': 'C2h', '3,3': 'B2d' }, [3, 2, 3, 3], 'sickleDew'],
    ['dew + dew', { '3,2': 'C2d', '3,3': 'B2d' }, [3, 2, 3, 3], 'dewDew'],
  ];
  it.each(cases)('%s plays its own signature effect once, with a banner, instead of two solo specials', (_n, overlay, m, kind) => {
    const board = checker(overlay);
    const run = createRun({ commission: sandboxCommission([{ crop: 'tomato', count: 99 }]), board, seed: 1, uidCounter: 500 }, VS_TUNABLES);
    const r = applyMove(run, mv(...m), VS_TUNABLES);
    if (!r.ok) throw new Error();
    const f = fakeAdapters();
    let sickles = 0;
    f.ad.vfx.sickle = () => sickles++;
    const tl = buildTimeline(r.events, board.cells, f.ad, anim);
    tl.skipToEnd();
    const combos = [...new Set(f.log.filter((l) => l.what.startsWith('combo:')).map((l) => l.what))];
    expect(combos).toEqual([`combo:${kind}`]);
    expect(f.log.some((l) => l.what === `banner:${COMBO_LABEL[kind as ComboKind]}`)).toBe(true);
    expect(sickles).toBe(0);
    const firstCombo = f.log.find((l) => l.what.startsWith('combo:'))!.t;
    expect(firstCombo).toBeGreaterThanOrEqual(0);
  });

  it('comboKindOf classifies triggers and ignores plain chains', () => {
    const t = (kind: 'sickleH' | 'dewOrb' | 'bee', via = 'combo', level = 0) => ({ kind, via, level });
    expect(comboKindOf([t('bee'), t('bee')])).toBe('beeBee');
    expect(comboKindOf([t('bee'), t('sickleH', 'combo', 1)])).toBe('beeSpecial');
    expect(comboKindOf([t('sickleH', 'match')])).toBeNull();
    expect(comboKindOf([t('dewOrb'), t('sickleH')])).toBe('sickleDew');
  });
});
