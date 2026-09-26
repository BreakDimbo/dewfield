import { describe, expect, it } from 'vitest';
import { appTransition, boardInteractive, type AppEvent, type AppState } from './appFsm';
import { IDLE, dragTarget, gestureReduce, type GestureState } from './gesture';
import { runPhaseTransition } from './runFsm';

describe('appTransition (03 §7.1) — every edge', () => {
  const edges: [AppState, AppEvent, AppState, string[]][] = [
    ['boot', { type: 'BOOT_OK' }, 'title', ['loadSettingsAndSave']],
    ['title', { type: 'NEW_GAME' }, 'toMatch', ['newGame', 'startRun']],
    ['title', { type: 'CONTINUE', hasSave: true }, 'hub', []],
    ['hub', { type: 'OPEN_BRIEF', allowed: true }, 'brief', []],
    ['brief', { type: 'CLOSE_BRIEF' }, 'hub', []],
    ['brief', { type: 'START_RUN' }, 'toMatch', ['startRun']],
    ['toMatch', { type: 'ARRIVED' }, 'match', ['runIntro']],
    ['match', { type: 'RUN_ENDED' }, 'settlement', ['settleRun']],
    ['settlement', { type: 'SETTLEMENT_CLOSED' }, 'toHub', []],
    ['toHub', { type: 'ARRIVED' }, 'hub', ['recomputeGate']],
    ['hub', { type: 'SLEEP', allowed: true }, 'night', ['sleepAndSave']],
    ['night', { type: 'MORNING_DONE' }, 'hub', ['showBrief']],
    ['hub', { type: 'ENTER_PHOTO' }, 'photo', ['hideHud']],
    ['photo', { type: 'EXIT_PHOTO' }, 'hub', ['showHud']],
  ];
  it.each(edges)('%s --%o--> %s', (from, ev, to, effects) => {
    expect(appTransition(from, ev)).toEqual({ state: to, effects });
  });

  it.each([
    ['title', { type: 'CONTINUE', hasSave: false }],
    ['hub', { type: 'OPEN_BRIEF', allowed: false }],
    ['hub', { type: 'SLEEP', allowed: false }],
    ['match', { type: 'NEW_GAME' }],
    ['boot', { type: 'ARRIVED' }],
  ] as [AppState, AppEvent][])('%s ignores %o', (from, ev) => {
    expect(appTransition(from, ev)).toEqual({ state: from, effects: [], ignored: true });
  });

  it('only the match state takes board input', () => {
    expect(boardInteractive('match')).toBe(true);
    expect(boardInteractive('toMatch')).toBe(false);
  });
});

describe('runPhaseTransition (03 §7.2)', () => {
  it('walks the table', () => {
    expect(runPhaseTransition('intro', { type: 'INTRO_DONE' }).phase).toBe('idle');
    expect(runPhaseTransition('idle', { type: 'COMMIT_OK' }).phase).toBe('resolving');
    expect(runPhaseTransition('idle', { type: 'COMMIT_REJECTED' }).phase).toBe('rejecting');
    expect(runPhaseTransition('idle', { type: 'ABANDON' }).phase).toBe('ended');
    expect(runPhaseTransition('rejecting', { type: 'TIMELINE_DONE', status: 'playing', needsRush: false }).phase).toBe('idle');
    expect(runPhaseTransition('resolving', { type: 'TIMELINE_DONE', status: 'playing', needsRush: false }).phase).toBe('idle');
    expect(runPhaseTransition('resolving', { type: 'TIMELINE_DONE', status: 'won', needsRush: true }).phase).toBe('rush');
    expect(runPhaseTransition('resolving', { type: 'TIMELINE_DONE', status: 'lost', needsRush: false }).phase).toBe('ended');
    expect(runPhaseTransition('rush', { type: 'TIMELINE_DONE', status: 'won', needsRush: false }).phase).toBe('ended');
    expect(runPhaseTransition('ended', { type: 'COMMIT_OK' })).toEqual({ phase: 'ended', ignored: true });
    expect(runPhaseTransition('resolving', { type: 'COMMIT_OK' }).ignored).toBe(true);
    expect(runPhaseTransition('intro', { type: 'ABANDON' }).ignored).toBe(true);
    expect(runPhaseTransition('rejecting', { type: 'ABANDON' }).ignored).toBe(true);
    expect(runPhaseTransition('rush', { type: 'ABANDON' }).ignored).toBe(true);
  });
});

describe('gestureReduce (03 §7.3) — every row', () => {
  const cfg = { thresholdPx: 10, width: 7, height: 7 };
  const A = { x: 3, y: 3 };
  const p0 = { x: 100, y: 100 };
  const step = (s: GestureState, i: Parameters<typeof gestureReduce>[1]) => gestureReduce(s, i, cfg);

  it('idle + down(a) → pressing; down(null) stays idle', () => {
    expect(step(IDLE, { t: 'down', cell: A, px: p0 })).toEqual({ state: { t: 'pressing', a: A, p0 }, intents: [] });
    expect(step(IDLE, { t: 'down', cell: null, px: p0 }).state).toBe(IDLE);
    expect(step(IDLE, { t: 'up', cell: A, px: p0 }).state).toBe(IDLE);
  });

  it('pressing + move past threshold → dragging with preview along the major axis', () => {
    const r = step({ t: 'pressing', a: A, p0 }, { t: 'move', cell: null, px: { x: 115, y: 104 } });
    expect(r.state).toEqual({ t: 'dragging', a: A, b: { x: 4, y: 3 }, p0 });
    expect(r.intents).toEqual([{ t: 'preview', a: A, b: { x: 4, y: 3 } }]);
    const small = step({ t: 'pressing', a: A, p0 }, { t: 'move', cell: null, px: { x: 104, y: 100 } });
    expect(small.state.t).toBe('pressing');
  });

  it('dragging off the board edge has no target and no preview', () => {
    const edge = { x: 0, y: 0 };
    const r = step({ t: 'pressing', a: edge, p0 }, { t: 'move', cell: null, px: { x: 80, y: 100 } });
    expect(r).toEqual({ state: { t: 'dragging', a: edge, b: null, p0 }, intents: [] });
    expect(step(r.state, { t: 'up', cell: null, px: p0 })).toEqual({ state: IDLE, intents: [{ t: 'clearPreview' }] });
  });

  it('dragging + direction change → new preview; same direction → nothing; leaving board → clear', () => {
    const s: GestureState = { t: 'dragging', a: A, b: { x: 4, y: 3 }, p0 };
    expect(step(s, { t: 'move', cell: null, px: { x: 100, y: 130 } }).intents).toEqual([
      { t: 'preview', a: A, b: { x: 3, y: 4 } },
    ]);
    expect(step(s, { t: 'move', cell: null, px: { x: 140, y: 100 } }).intents).toEqual([]);
    const edge: GestureState = { t: 'dragging', a: { x: 6, y: 0 }, b: { x: 6, y: 1 }, p0 };
    expect(step(edge, { t: 'move', cell: null, px: { x: 140, y: 100 } }).intents).toEqual([{ t: 'clearPreview' }]);
  });

  it('dragging back within threshold → pressing + clearPreview', () => {
    const s: GestureState = { t: 'dragging', a: A, b: { x: 4, y: 3 }, p0 };
    expect(step(s, { t: 'move', cell: A, px: { x: 103, y: 101 } })).toEqual({
      state: { t: 'pressing', a: A, p0 },
      intents: [{ t: 'clearPreview' }],
    });
  });

  it('dragging + up with target → commit', () => {
    const s: GestureState = { t: 'dragging', a: A, b: { x: 3, y: 2 }, p0 };
    expect(step(s, { t: 'up', cell: null, px: p0 })).toEqual({ state: IDLE, intents: [{ t: 'commit', a: A, b: { x: 3, y: 2 } }] });
    expect(step(s, { t: 'down', cell: A, px: p0 }).state).toBe(s);
  });

  it('pressing + up → selected + select', () => {
    expect(step({ t: 'pressing', a: A, p0 }, { t: 'up', cell: A, px: p0 })).toEqual({
      state: { t: 'selected', a: A, hover: null },
      intents: [{ t: 'select', a: A }],
    });
  });

  it('selected + down on an adjacent cell → commit', () => {
    const s: GestureState = { t: 'selected', a: A, hover: null };
    expect(step(s, { t: 'down', cell: { x: 2, y: 3 }, px: p0 })).toEqual({
      state: IDLE,
      intents: [{ t: 'commit', a: A, b: { x: 2, y: 3 } }],
    });
  });

  it('selected + down on itself or outside → deselect', () => {
    const s: GestureState = { t: 'selected', a: A, hover: null };
    expect(step(s, { t: 'down', cell: A, px: p0 })).toEqual({ state: IDLE, intents: [{ t: 'deselect' }] });
    expect(step(s, { t: 'down', cell: null, px: p0 })).toEqual({ state: IDLE, intents: [{ t: 'deselect' }] });
  });

  it('selected + down on a far cell → select it (and it can be dragged)', () => {
    const s: GestureState = { t: 'selected', a: A, hover: null };
    const c = { x: 0, y: 6 };
    expect(step(s, { t: 'down', cell: c, px: p0 })).toEqual({ state: { t: 'pressing', a: c, p0 }, intents: [{ t: 'select', a: c }] });
    expect(step(s, { t: 'up', cell: c, px: p0 }).state).toBe(s);
  });

  it('selected + hover over a neighbour previews; moving away clears (desktop tap mode)', () => {
    const s: GestureState = { t: 'selected', a: A, hover: null };
    const r = step(s, { t: 'move', cell: { x: 3, y: 4 }, px: p0 });
    expect(r.intents).toEqual([{ t: 'preview', a: A, b: { x: 3, y: 4 } }]);
    expect(step(r.state, { t: 'move', cell: { x: 3, y: 4 }, px: p0 }).intents).toEqual([]);
    expect(step(r.state, { t: 'move', cell: { x: 6, y: 6 }, px: p0 }).intents).toEqual([{ t: 'clearPreview' }]);
  });

  it('cancel from anywhere → idle (+ clearPreview unless already idle)', () => {
    expect(step({ t: 'dragging', a: A, b: null, p0 }, { t: 'cancel' })).toEqual({ state: IDLE, intents: [{ t: 'clearPreview' }] });
    expect(step(IDLE, { t: 'cancel' })).toEqual({ state: IDLE, intents: [] });
  });

  it('dragTarget picks vertical when |dy| > |dx|', () => {
    expect(dragTarget(A, p0, { x: 101, y: 80 }, cfg)).toEqual({ x: 3, y: 2 });
  });
});
