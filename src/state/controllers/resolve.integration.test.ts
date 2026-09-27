import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardEvent } from '@/core/board/events';
import { previewMove } from '@/core/board/preview';
import { COMMISSION_BY_ID } from '@/core/config/commissions';
import { applyMove } from '@/core/run/run';
import { pickMove, scenarioRun } from '@/core/testkit/scenario';
import { MemoryAdapter } from '@/platform/storage';
import { useAppStore } from '@/state/appStore';
import { bus, type BusChannels } from '@/state/bus';
import { gameCfg } from '@/state/config';
import { persistence } from '@/state/persistence';
import { usePresentationStore } from '@/state/presentationStore';
import { useRunStore } from '@/state/runStore';
import { useUiStore } from '@/state/uiStore';
import { gameController } from './gameController';
import { previewMismatch, runController } from './runController';

/** A choreographer that holds every log until the test says it finished playing. */
let played: BusChannels['boardEvents'][] = [];
const guided = COMMISSION_BY_ID.T1!.guidedMoves!.map((g) => ({ a: { x: g.a[0], y: g.a[1] }, b: { x: g.b[0], y: g.b[1] } }));

beforeEach(() => {
  vi.useFakeTimers();
  persistence.use(new MemoryAdapter(), 'test');
  useAppStore.setState({ app: 'boot', home: null, settlement: null, notices: [] });
  useRunStore.setState({ run: null, phase: 'ended', paused: false, selected: null, preview: null, guide: null });
  useUiStore.setState({ tips: [], hint: null, rush: false });
  bus.clear();
  played = [];
  bus.on('boardEvents', (p) => played.push(p));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function startT1(): void {
  gameController.boot();
  gameController.newGame(42);
  gameController.arrived();
  expect(useRunStore.getState().phase).toBe('idle');
}

describe('input while a move resolves (P1-14, 02 §4.4)', () => {
  it('ignores commits while resolving; a tap or swipe fast-forwards instead; done restores 1×', () => {
    startT1();
    runController.intent({ t: 'commit', ...guided[0]! });
    expect(useRunStore.getState().phase).toBe('resolving');
    const run = useRunStore.getState().run!;
    expect(played).toHaveLength(1);
    expect(usePresentationStore.getState().timeScale).toBe(1);

    // a direct commit is dropped without touching the run or the timeline
    runController.commit(guided[1]!);
    expect(useRunStore.getState().run).toBe(run);
    expect(played).toHaveLength(1);
    expect(usePresentationStore.getState().timeScale).toBe(1);

    // a swipe during resolve fast-forwards and is not committed
    runController.intent({ t: 'commit', ...guided[1]! });
    expect(useRunStore.getState().run).toBe(run);
    expect(played).toHaveLength(1);
    expect(usePresentationStore.getState().timeScale).toBe(gameCfg().anim.fastForwardScale);

    runController.timelineDone();
    expect(useRunStore.getState().phase).toBe('idle');
    expect(usePresentationStore.getState().timeScale).toBe(1);

    // a plain tap (select) also fast-forwards
    runController.intent({ t: 'commit', ...guided[1]! });
    expect(useRunStore.getState().phase).toBe('resolving');
    runController.intent({ t: 'select', a: { x: 0, y: 0 } });
    expect(useRunStore.getState().selected).toBeNull();
    expect(usePresentationStore.getState().timeScale).toBe(gameCfg().anim.fastForwardScale);
    expect(played).toHaveLength(2);
  });

  it('previews are ignored while resolving (no overlay over a playing move)', () => {
    startT1();
    runController.intent({ t: 'commit', ...guided[0]! });
    runController.intent({ t: 'preview', ...guided[1]! });
    expect(useRunStore.getState().preview).toBeNull();
  });
});

describe('DEV preview assertion: preview == actual first segment (P1-16 #1)', () => {
  const opts = [{}, { specials: 6 }, { specials: 5, bees: 3 }];

  it('stays silent across many seeded boards, comparing harvest, growth, created, triggered and pollinated', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let checked = 0;
    let rich = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const run = scenarioRun(seed, gameCfg(), opts[seed % 3]);
      const move = pickMove(run.board, seed * 7);
      if (!move) continue;
      useRunStore.setState({ run, phase: 'idle', paused: false, selected: null, preview: null, guide: null });
      runController.intent({ t: 'preview', ...move });
      const shown = useRunStore.getState().preview?.result;
      expect(shown?.valid).toBe(true);
      if (shown!.growth.length + shown!.created.length + shown!.triggered.length > 0) rich++;
      runController.intent({ t: 'commit', ...move });
      expect(useRunStore.getState().phase).toBe('resolving');
      const events = played.at(-1)!.events;
      expect(previewMismatch(shown!, events)).toEqual([]);
      checked++;
    }
    expect(err).not.toHaveBeenCalled();
    expect(checked).toBeGreaterThan(140);
    // the sample must actually exercise the non-harvest fields
    expect(rich).toBeGreaterThan(20);
  });

  it('reports each field that diverges', () => {
    const run = scenarioRun(3, gameCfg(), { specials: 6 });
    const move = pickMove(run.board, 1)!;
    const shown = previewMove(run, move, gameCfg());
    const r = applyMove(run, move, gameCfg());
    if (!r.ok) throw new Error('legal move expected');
    expect(previewMismatch(shown, r.events)).toEqual([]);
    const fake = { pos: { x: 6, y: 6 }, uid: 99_999, from: 0 as const, to: 1 as const, cause: 'neighbor' as const };
    const bad = { ...shown, harvest: shown.harvest.slice(1), growth: [...shown.growth, fake], created: [...shown.created, { pos: { x: 0, y: 0 }, kind: 'bee' as const }] };
    expect(previewMismatch(bad, r.events).map((m) => m.field)).toEqual(['harvest', 'growth', 'created']);
    const noTrigger: BoardEvent[] = r.events.filter((e) => e.t !== 'specialTriggered');
    const hadTrigger = shown.triggered.length > 0;
    expect(previewMismatch(shown, noTrigger).some((m) => m.field === 'triggered')).toBe(hadTrigger);
  });

  it('logs a console error in DEV when the shown preview diverges from the commit', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = scenarioRun(5, gameCfg(), {});
    const move = pickMove(run.board, 0)!;
    useRunStore.setState({ run, phase: 'idle', paused: false, selected: null, preview: null, guide: null });
    runController.intent({ t: 'preview', ...move });
    const p = useRunStore.getState().preview!;
    useRunStore.setState({ preview: { ...p, result: { ...p.result, harvest: [] } } });
    runController.intent({ t: 'commit', ...move });
    expect(err).toHaveBeenCalled();
    expect(String(err.mock.calls[0]![0])).toContain('harvest');
  });
});
