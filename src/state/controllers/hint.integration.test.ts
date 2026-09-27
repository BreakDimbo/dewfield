import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMISSION_BY_ID } from '@/core/config/commissions';
import { pickHint } from '@/core/board/hint';
import { MemoryAdapter } from '@/platform/storage';
import { useAppStore } from '@/state/appStore';
import { bus } from '@/state/bus';
import { gameCfg } from '@/state/config';
import { persistence } from '@/state/persistence';
import { usePresentationStore } from '@/state/presentationStore';
import { useRunStore } from '@/state/runStore';
import { useUiStore } from '@/state/uiStore';
import { gameController } from './gameController';
import { runController } from './runController';

/** 04 P2-18 / 02 §4.3: the idle hint appears after `hint.idleMs`, any input restarts the countdown. */
const idle = () => gameCfg().hint.idleMs;
const flush = () => vi.advanceTimersByTimeAsync(0);
const hint = () => useUiStore.getState().hint;

function instantChoreo() {
  bus.clear();
  bus.on('boardEvents', (p) => {
    if (p.kind === 'move' || p.kind === 'reject') queueMicrotask(() => runController.timelineDone());
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  persistence.use(new MemoryAdapter(), 'test');
  useAppStore.setState({ app: 'boot', home: null, settlement: null, notices: [] });
  useRunStore.setState({ run: null, phase: 'ended', paused: false, selected: null, preview: null, guide: null });
  useUiStore.setState({ tips: [], hint: null });
  instantChoreo();
});
afterEach(() => {
  vi.useRealTimers();
});

/** New game → T1 (guided); returns once T1's first guided step is idle. */
function startT1(): void {
  gameController.boot();
  gameController.newGame(42);
  gameController.arrived();
  expect(useRunStore.getState().phase).toBe('idle');
}

/** Finish T1, then enter T2 — a free-input run. */
async function startT2(): Promise<void> {
  startT1();
  for (const g of COMMISSION_BY_ID.T1!.guidedMoves!) {
    runController.commit({ a: { x: g.a[0], y: g.a[1] }, b: { x: g.b[0], y: g.b[1] } });
    await flush();
  }
  gameController.closeSettlement();
  gameController.arrived();
  gameController.openBrief();
  gameController.startRun();
  gameController.arrived();
  const run = useRunStore.getState().run!;
  expect(run.commission.id).toBe('T2');
  expect(useRunStore.getState().phase).toBe('idle');
  expect(useRunStore.getState().guide).toBeNull();
}

describe('auto hint (P2-18, 02 §4.3)', () => {
  it('never appears during T1 guided steps, even after input', async () => {
    startT1();
    await vi.advanceTimersByTimeAsync(idle() * 2);
    expect(hint()).toBeNull();
    const g = useRunStore.getState().guide!;
    runController.intent({ t: 'select', a: g.a });
    await vi.advanceTimersByTimeAsync(idle() * 2);
    expect(hint()).toBeNull();
  });

  it('shows after idleMs; input clears it and it comes back after another idleMs', async () => {
    await startT2();
    await vi.advanceTimersByTimeAsync(idle() - 1);
    expect(hint()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    const best = pickHint(useRunStore.getState().run!, gameCfg())!.move;
    expect(hint()).toEqual(best);

    runController.intent({ t: 'select', a: best.a });
    expect(hint()).toBeNull();
    await vi.advanceTimersByTimeAsync(idle() - 1);
    expect(hint()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(hint()).toEqual(best);

    // Hover preview and clearing it are input too: each restarts the countdown.
    runController.intent({ t: 'preview', a: best.a, b: best.b });
    expect(hint()).toBeNull();
    await vi.advanceTimersByTimeAsync(idle() / 2);
    runController.intent({ t: 'clearPreview' });
    await vi.advanceTimersByTimeAsync(idle() - 1);
    expect(hint()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(hint()).toEqual(best);
  });

  it('is absent while paused and re-arms on resume', async () => {
    await startT2();
    runController.setPaused(true);
    await vi.advanceTimersByTimeAsync(idle() * 2);
    expect(hint()).toBeNull();
    runController.setPaused(false);
    await vi.advanceTimersByTimeAsync(idle());
    expect(hint()).not.toBeNull();
  });

  it('is absent while the board is resolving or presentation is busy', async () => {
    await startT2();
    bus.clear(); // the choreographer "plays" until timelineDone is called by hand
    runController.commit(pickHint(useRunStore.getState().run!, gameCfg())!.move);
    expect(useRunStore.getState().phase).toBe('resolving');
    await vi.advanceTimersByTimeAsync(idle() * 2);
    expect(hint()).toBeNull();
    runController.timelineDone();
    expect(useRunStore.getState().phase).toBe('idle');
    await vi.advanceTimersByTimeAsync(idle());
    expect(hint()).not.toBeNull();

    usePresentationStore.setState({ busy: true });
    runController.intent({ t: 'deselect' });
    await vi.advanceTimersByTimeAsync(idle() * 2);
    expect(hint()).toBeNull();
    usePresentationStore.setState({ busy: false });
  });
});
