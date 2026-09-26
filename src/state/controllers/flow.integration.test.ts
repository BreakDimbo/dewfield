import { beforeEach, describe, expect, it } from 'vitest';
import { COMMISSION_BY_ID } from '@/core/config/commissions';
import { MemoryAdapter } from '@/platform/storage';
import { useAppStore } from '@/state/appStore';
import { bus } from '@/state/bus';
import { KEYS, persistence } from '@/state/persistence';
import { useRunStore } from '@/state/runStore';
import { gameController } from './gameController';
import { runController } from './runController';

/** Instant choreographer: every committed log is "played" immediately (03 §15 controller integration). */
function instantChoreo() {
  bus.clear();
  bus.on('boardEvents', (p) => {
    if (p.kind === 'move' || p.kind === 'reject') queueMicrotask(() => runController.timelineDone());
    if (p.kind === 'overnight') queueMicrotask(() => gameController.morningDone());
  });
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  persistence.use(new MemoryAdapter(), 'test');
  useAppStore.setState({ app: 'boot', home: null, settlement: null, notices: [] });
  useRunStore.setState({ run: null, phase: 'ended', paused: false, selected: null, preview: null, guide: null });
  instantChoreo();
});

async function playT1() {
  gameController.boot();
  gameController.newGame(42);
  expect(useAppStore.getState().app).toBe('toMatch');
  gameController.arrived();
  expect(useRunStore.getState().phase).toBe('idle');
  for (const g of COMMISSION_BY_ID.T1!.guidedMoves!) {
    expect(useRunStore.getState().guide).toEqual({ a: { x: g.a[0], y: g.a[1] }, b: { x: g.b[0], y: g.b[1] } });
    runController.commit({ a: { x: g.a[0], y: g.a[1] }, b: { x: g.b[0], y: g.b[1] } });
    await flush();
  }
}

describe('game flow with MemoryAdapter (P1-13, 03 §15)', () => {
  it('new game → T1 → settlement → hub, saving at each safe point and never mid-move', async () => {
    let writesDuringMove = 0;
    bus.on('boardEvents', () => {
      writesDuringMove = persistence.writeCount;
    });
    await playT1();
    expect(useAppStore.getState().app).toBe('settlement');
    expect(useAppStore.getState().settlement?.result).toBe('won');
    expect(writesDuringMove).toBe(1);
    expect(persistence.writeCount).toBe(2);
    gameController.closeSettlement();
    gameController.arrived();
    expect(useAppStore.getState().app).toBe('hub');
    const saved = persistence.load();
    expect(saved.kind).toBe('loaded');
    if (saved.kind === 'loaded') {
      const { tutorial: _t, ...rest } = useAppStore.getState().home!;
      expect(saved.home).toMatchObject(rest);
    }
  });

  it('care and sleep save before any animation; continue restores the same terrace', async () => {
    await playT1();
    gameController.closeSettlement();
    gameController.arrived();
    const h = useAppStore.getState().home!;
    useAppStore.setState({ home: { ...h, tutorial: { ...h.tutorial, done: true } } });
    const before = persistence.writeCount;
    expect(gameController.waterRow(2)).toBe(true);
    expect(persistence.writeCount).toBe(before + 1);
    expect(gameController.waterRow(2)).toBe(false);
    gameController.sleep();
    expect(useAppStore.getState().app).toBe('night');
    expect(persistence.writeCount).toBe(before + 2);
    const home = useAppStore.getState().home!;
    expect(home.day).toBe(2);
    gameController.revealMorning();
    await flush();
    expect(useAppStore.getState().app).toBe('hub');

    useAppStore.setState({ app: 'title', home: null });
    expect(gameController.hasSave()).toBe(true);
    expect(gameController.continueGame()).toBe(true);
    expect(useAppStore.getState().app).toBe('hub');
    expect(useAppStore.getState().home).toEqual(home);
  });

  it('T1 guided steps ignore every other input (P1-23 hard lock)', async () => {
    gameController.boot();
    gameController.newGame(5);
    gameController.arrived();
    const events: string[] = [];
    bus.on('boardEvents', (p) => events.push(p.kind));
    const before = useRunStore.getState().run!;
    runController.intent({ t: 'select', a: { x: 0, y: 0 } });
    expect(useRunStore.getState().selected).toBeNull();
    runController.intent({ t: 'preview', a: { x: 0, y: 3 }, b: { x: 0, y: 4 } });
    expect(useRunStore.getState().preview).toBeNull();
    runController.commit({ a: { x: 3, y: 2 }, b: { x: 2, y: 2 } });
    runController.commit({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    await flush();
    expect(useRunStore.getState().run).toBe(before);
    expect(events).toEqual([]);
    runController.intent({ t: 'select', a: { x: 6, y: 6 } });
    expect(useRunStore.getState().selected).toEqual({ x: 6, y: 6 });
    runController.intent({ t: 'commit', a: { x: 6, y: 6 }, b: { x: 6, y: 5 } });
    await flush();
    expect(useRunStore.getState().run!.delivered.carrot).toBe(3);
    expect(events).toEqual(['move']);
  });

  it('abandon settles as a failure and keeps partial delivery', async () => {
    gameController.boot();
    gameController.newGame(7);
    gameController.arrived();
    runController.commit({ a: { x: 6, y: 5 }, b: { x: 6, y: 6 } });
    await flush();
    runController.abandon();
    const s = useAppStore.getState();
    expect(s.app).toBe('settlement');
    expect(s.settlement?.result).toBe('abandoned');
    expect(s.home?.commissions.active?.delivered.carrot).toBe(3);
    expect(s.home?.commissions.active?.attempts).toBe(1);
  });

  it('corrupt main falls back to backup; both corrupt keeps the raw text', () => {
    const mem = new MemoryAdapter();
    persistence.use(mem, 'test');
    gameController.boot();
    gameController.newGame(1);
    gameController.arrived();
    runController.undo();
    persistence.save(useAppStore.getState().home!);
    mem.set(KEYS.main, '{broken');
    expect(persistence.load().kind === 'loaded' && (persistence.load() as { from: string }).from).toBe('backup');
    mem.set(KEYS.backup, 'also broken');
    const out = persistence.load();
    expect(out.kind).toBe('corrupt');
    if (out.kind === 'corrupt') expect(mem.get(out.corruptKey)).toBe('{broken');
    expect(persistence.load().kind).toBe('none');
  });

  it('quota failure falls back to memory storage', () => {
    persistence.use(new MemoryAdapter(10), 'test');
    gameController.boot();
    gameController.newGame(1);
    expect(persistence.usingMemory).toBe(true);
    expect(useAppStore.getState().notices.some((n) => n.text.includes('无法保存'))).toBe(true);
  });
});
