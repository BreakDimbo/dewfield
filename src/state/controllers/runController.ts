import type { BoardEvent } from '@/core/board/events';
import { pickHint } from '@/core/board/hint';
import { isSpecial, neighborIdx, type Move } from '@/core/board/model';
import { previewMove } from '@/core/board/preview';
import { filterGuided, guidedMove, guidedSelectable } from '@/core/flow/tutorial';
import type { Intent } from '@/core/flow/gesture';
import { runPhaseTransition, type RunPhaseEvent } from '@/core/flow/runFsm';
import { startRun } from '@/core/homestead/homestead';
import type { HomesteadState } from '@/core/homestead/state';
import { applyMove, canUndo, undo } from '@/core/run/run';
import type { RunState } from '@/core/run/state';
import { now } from '@/platform/clock';
import { bus } from '@/state/bus';
import { gameCfg } from '@/state/config';
import { hudFromRun, usePresentationStore } from '@/state/presentationStore';
import { useRunStore } from '@/state/runStore';
import { telemetry } from '@/state/telemetryLogger';
import { useUiStore } from '@/state/uiStore';
import { showTip } from './tips';

function phaseEvent(e: RunPhaseEvent): boolean {
  const { phase } = useRunStore.getState();
  const next = runPhaseTransition(phase, e);
  if (next.ignored) return false;
  useRunStore.setState({ phase: next.phase });
  return true;
}

const guideFor = guidedMove;

let onEnded: ((run: RunState, abandoned: boolean) => void) | null = null;
let runStartedAt = 0;
let firstInputAt: number | null = null;
let previewSince: { key: string; at: number } | null = null;
let hintTimer: ReturnType<typeof setTimeout> | null = null;

const moveKey = (m: Move) => `${m.a.x},${m.a.y}>${m.b.x},${m.b.y}`;

function markInput(): void {
  if (firstInputAt === null) {
    firstInputAt = now();
    telemetry.log('first_input', { msSinceRunStart: firstInputAt - runStartedAt });
  }
  // 02 §4.3: any input clears the hint and restarts the idle countdown.
  armHint();
}

function clearHint(): void {
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = null;
  if (useUiStore.getState().hint) useUiStore.setState({ hint: null });
}

/** Idle, free-input play: the only state in which the hint may count down or show. */
function hintAllowed(): boolean {
  const { run, phase, paused } = useRunStore.getState();
  return !!run && phase === 'idle' && !paused && run.status === 'playing' && !guideFor(run) && !usePresentationStore.getState().busy;
}

/** 02 §4.3: after `hint.idleMs` of idle, wiggle the best move (never during guided steps). */
function armHint(): void {
  clearHint();
  if (!hintAllowed()) return;
  hintTimer = setTimeout(() => {
    hintTimer = null;
    const s = useRunStore.getState();
    if (!s.run || !hintAllowed()) return;
    const h = pickHint(s.run, gameCfg());
    if (!h) return;
    useUiStore.setState({ hint: h.move });
    telemetry.log('hint_shown', { moveIndex: s.run.moveIndex });
  }, gameCfg().hint.idleMs);
}

/** Telemetry + contextual tips derived from one committed move's event log (02 §13.2, §16.5). */
function afterMoveEvents(run: RunState, events: readonly BoardEvent[], previewMs: number): void {
  let depth = 0;
  const created: string[] = [];
  let harvested = 0;
  let ripe = 0;
  let unripe = 0;
  let sprout = 0;
  let inRush = false;
  for (const e of events) {
    if (e.t === 'rushStart') {
      inRush = true;
      showTip('rush');
    }
    if (e.t === 'cascadeStep') depth = Math.max(depth, e.depth);
    if (e.t === 'harvest' && !inRush)
      for (const it of e.items) {
        harvested++;
        if (it.stage === 2) ripe++;
        else if (it.stage === 1) unripe++;
        else if (it.stage === 0) {
          sprout++;
          showTip('sproutHarvest');
        }
      }
    if (e.t === 'specialCreated') {
      created.push(e.kind);
      telemetry.log('special_created', { kind: e.kind, moveIndex: run.moveIndex, msSinceFirstInput: now() - (firstInputAt ?? now()) });
      if (e.kind === 'dewOrb') showTip('dewOrb');
      if (e.kind === 'bee') showTip('bee');
    }
    if (e.t === 'specialTriggered') telemetry.log('special_activated', { kind: e.kind, via: e.via });
    if (e.t === 'grow' && e.cause === 'neighbor') showTip('neighborRipen');
    if (e.t === 'shuffle') {
      telemetry.log('shuffle', { moveIndex: run.moveIndex });
      showTip('shuffle');
    }
  }
  const combo = events.filter((e) => e.t === 'specialTriggered' && e.via === 'combo' && e.level === 0) as Extract<BoardEvent, { t: 'specialTriggered' }>[];
  if (combo.length) telemetry.log('combo', { a: combo[0]!.kind, b: combo[1]?.kind ?? combo[0]!.kind });
  telemetry.log('move', { i: run.moveIndex, harvested, ripe, unripe, sprout, depth, created: created.join(','), previewMs });
  if (run.status === 'playing') {
    const cells = run.board.cells;
    const adjacent = cells.some((t, i) => isSpecial(t) && neighborIdx(i).some((j) => isSpecial(cells[j])));
    if (adjacent) showTip('combo');
  }
}

export const runController = {
  /** Called once by gameController so the run can report its end without a circular import. */
  bindEnded(fn: (run: RunState, abandoned: boolean) => void): void {
    onEnded = fn;
  },

  start(home: HomesteadState): HomesteadState {
    const { home: next, run, legalizeFixes } = startRun(home, gameCfg());
    if (legalizeFixes > 0) telemetry.log('legalize_fix', { count: legalizeFixes });
    runStartedAt = now();
    firstInputAt = null;
    const cells = run.board.cells;
    telemetry.log('run_start', {
      commissionId: run.commission.id,
      attempt: run.commission.attempts,
      day: home.day,
      runSeed: run.rng[3],
      fieldRipe: cells.filter((t) => t.kind === 'crop' && t.stage === 2).length,
      fieldUnripe: cells.filter((t) => t.kind === 'crop' && t.stage === 1).length,
    });
    useRunStore.setState({ run, phase: 'intro', paused: false, selected: null, preview: null, guide: guideFor(run) });
    usePresentationStore.setState({ hud: hudFromRun(run), busy: false, timeScale: 1, banner: null, cascadeDepth: 0 });
    useUiStore.setState({ hint: null, rush: false });
    bus.emit('boardSnap', { run });
    return next;
  },

  runElapsed(): number {
    return now() - runStartedAt;
  },

  introDone(): void {
    phaseEvent({ type: 'INTRO_DONE' });
    armHint();
  },

  intent(i: Intent): void {
    const s = useRunStore.getState();
    if (!s.run || s.paused) return;
    if (s.phase !== 'idle') {
      if (i.t === 'commit' || i.t === 'select') runController.fastForward();
      return;
    }
    markInput();
    switch (i.t) {
      case 'select':
        if (!guidedSelectable(s.run, i.a)) {
          useRunStore.setState({ selected: null, preview: null });
          return;
        }
        useRunStore.setState({ selected: i.a, preview: null });
        return;
      case 'deselect':
        useRunStore.setState({ selected: null, preview: null });
        return;
      case 'clearPreview':
        useRunStore.setState({ preview: null });
        previewSince = null;
        return;
      case 'preview': {
        const v = filterGuided(s.run, i);
        if (v.t === 'ignore') {
          useRunStore.setState({ preview: null });
          return;
        }
        const move = v.t === 'accept' ? v.move : i;
        if (previewSince?.key !== moveKey(move)) previewSince = { key: moveKey(move), at: now() };
        useRunStore.setState({ preview: { move: i, result: previewMove(s.run, move, gameCfg()) } });
        return;
      }
      case 'commit':
        runController.commit(i);
        return;
    }
  },

  commit(input: Move): void {
    const s = useRunStore.getState();
    if (!s.run || s.phase !== 'idle') return;
    markInput();
    const v = filterGuided(s.run, input);
    if (v.t === 'ignore') {
      useRunStore.setState({ selected: null, preview: null });
      bus.emit('cue', { t: 'ui', name: 'tap' });
      return;
    }
    const move = v.t === 'accept' ? v.move : input;
    const previewMs = previewSince?.key === moveKey(move) ? now() - previewSince.at : 0;
    previewSince = null;
    const shown = s.preview?.result.valid && moveKey(s.preview.move) === moveKey(input) ? s.preview.result : null;
    const r = applyMove(s.run, move, gameCfg());
    useRunStore.setState({ selected: null, preview: null });
    if (!r.ok) {
      if (r.reason !== 'noMatch') return;
      telemetry.log('swap_rejected', { i: s.run.moveIndex });
      phaseEvent({ type: 'COMMIT_REJECTED' });
      usePresentationStore.setState({ busy: true });
      bus.emit('boardEvents', { events: r.events, run: s.run, kind: 'reject' });
      return;
    }
    if (import.meta.env.DEV && shown) assertPreviewMatches(shown, r.events);
    useRunStore.setState({ run: r.run, guide: null });
    phaseEvent({ type: 'COMMIT_OK' });
    usePresentationStore.setState({ busy: true });
    afterMoveEvents(r.run, r.events, previewMs);
    bus.emit('boardEvents', { events: r.events, run: r.run, kind: 'move' });
  },

  /** The choreographer finished playing the committed events. */
  timelineDone(): void {
    const { run, phase } = useRunStore.getState();
    if (!run) return;
    usePresentationStore.setState({ busy: false, timeScale: 1, hud: hudFromRun(run) });
    useUiStore.setState({ rush: false });
    if (phase === 'rejecting' || phase === 'resolving')
      phaseEvent({ type: 'TIMELINE_DONE', status: run.status, needsRush: false });
    if (useRunStore.getState().phase === 'ended') onEnded?.(run, false);
    else {
      useRunStore.setState({ guide: guideFor(run) });
      armHint();
    }
  },

  fastForward(): void {
    const { phase } = useRunStore.getState();
    if (phase === 'resolving') usePresentationStore.setState({ timeScale: gameCfg().anim.fastForwardScale });
  },

  canUndo(): boolean {
    const { run, phase } = useRunStore.getState();
    return !!run && phase === 'idle' && canUndo(run);
  },

  undo(): void {
    if (!runController.canUndo()) return;
    const back = undo(useRunStore.getState().run!)!;
    telemetry.log('undo', { moveIndex: back.moveIndex });
    useRunStore.setState({ run: back, selected: null, preview: null, guide: guideFor(back) });
    usePresentationStore.setState({ hud: hudFromRun(back) });
    bus.emit('boardSnap', { run: back });
    armHint();
  },

  setPaused(paused: boolean): void {
    useRunStore.setState({ paused });
    if (paused) clearHint();
    else armHint();
  },

  abandon(): void {
    const { run } = useRunStore.getState();
    if (!run) return;
    clearHint();
    useRunStore.setState({ phase: 'ended', paused: false });
    onEnded?.(run, true);
  },
};

/** 04 P1-16 #1 dev assertion: what the overlay showed equals the first segment that actually happened. */
function assertPreviewMatches(shown: ReturnType<typeof previewMove>, events: readonly BoardEvent[]): void {
  const end = events.findIndex((e) => e.t === 'fall' || e.t === 'spawn');
  const seg = end < 0 ? events : events.slice(0, end);
  const harvest = seg.find((e) => e.t === 'harvest') as Extract<BoardEvent, { t: 'harvest' }> | undefined;
  const a = shown.harvest.map((h) => h.uid).join(',');
  const b = (harvest?.items ?? []).map((h) => h.uid).join(',');
  if (a !== b) console.error('[preview] shown harvest differs from actual first segment', { shown: a, actual: b });
}
