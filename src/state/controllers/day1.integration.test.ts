import { beforeEach, describe, expect, it } from 'vitest';
import { COMMISSION_BY_ID } from '@/core/config/commissions';
import { currentGate, tutorialGate } from '@/core/flow/gates';
import { pickHint } from '@/core/board/hint';
import { MemoryAdapter } from '@/platform/storage';
import { useAppStore } from '@/state/appStore';
import { bus } from '@/state/bus';
import { gameCfg } from '@/state/config';
import { persistence } from '@/state/persistence';
import { telemetry } from '@/state/telemetryLogger';
import { useRunStore } from '@/state/runStore';
import { useUiStore } from '@/state/uiStore';
import { gameController } from './gameController';
import { runController } from './runController';
import { dismissTip } from './tips';

const flush = () => new Promise((r) => setTimeout(r, 0));
/** Tips shown after the last safe-point write of a run that was then reloaded (see refreshMidMatch). */
let lostTips: string[] = [];

beforeEach(() => {
  persistence.use(new MemoryAdapter(), 'test');
  useAppStore.setState({ app: 'boot', home: null, settlement: null, notices: [] });
  useRunStore.setState({ run: null, phase: 'ended', paused: false, selected: null, preview: null, guide: null });
  useUiStore.setState({ tips: [], careMode: 'none', guideRow: null, panel: 'none', briefReadOnly: false });
  telemetry.reset();
  lostTips = [];
  bus.clear();
  bus.on('boardEvents', (p) => {
    if (p.kind === 'move' || p.kind === 'reject') queueMicrotask(() => runController.timelineDone());
    if (p.kind === 'overnight') queueMicrotask(() => gameController.morningDone());
  });
});

const gate = () => currentGate(useAppStore.getState().home!);
const allow = () => tutorialGate(useAppStore.getState().home!).allow;
const tipIds = () => useAppStore.getState().home!.tutorial.seenTips;

/** Refresh the page: reload the save into a blank app and continue — must land on the same gate. */
function refreshKeepsGate(): void {
  const before = gate();
  const home = useAppStore.getState().home!;
  persistence.save(home);
  useAppStore.setState({ app: 'title', home: null });
  expect(gameController.continueGame()).toBe(true);
  expect(gate()).toBe(before);
  if (useAppStore.getState().app === 'brief') gameController.closeBrief();
}

/**
 * Refresh in the middle of a match. Runs are never saved (02 §12.4), so the reload returns to the last safe
 * point — the save written when the run started — on the same gate, with the attempt not counted.
 */
async function refreshMidMatch(): Promise<void> {
  gameController.arrived();
  const run = useRunStore.getState().run!;
  const { id, attempts } = run.commission;
  const g = COMMISSION_BY_ID[id]?.guidedMoves?.[0];
  runController.commit(g && attempts === 0 ? { a: { x: g.a[0], y: g.a[1] }, b: { x: g.b[0], y: g.b[1] } } : pickHint(run, gameCfg())!.move);
  await flush();
  expect(useAppStore.getState().app).toBe('match');
  const before = gate();
  const log = telemetry.all();
  const since = log.map((e) => e.e).lastIndexOf('run_start');
  for (const e of log.slice(since)) if (e.e === 'tip_shown') lostTips.push(e.tip);
  useRunStore.setState({ run: null, phase: 'ended', selected: null, preview: null, guide: null });
  useAppStore.setState({ app: 'title', home: null, settlement: null });
  expect(gameController.continueGame()).toBe(true);
  expect(gate()).toBe(before);
  const active = useAppStore.getState().home!.commissions.active!;
  expect(active.id).toBe(id);
  expect(active.attempts).toBe(attempts);
  if (before === 'G0') {
    // No hub actions at G0: the reload drops straight back into a fresh, guided T1.
    expect(useAppStore.getState().app).toBe('toMatch');
    expect(useRunStore.getState().run!.moveIndex).toBe(0);
    expect(useRunStore.getState().guide).not.toBeNull();
  } else {
    expect(useAppStore.getState().app).toBe('hub');
    expect(allow()).toContain('openCommission');
    gameController.openBrief();
    gameController.startRun();
    expect(useRunStore.getState().run!.commission.id).toBe(id);
  }
}

async function playOut(win: boolean): Promise<void> {
  gameController.arrived();
  for (let guard = 0; guard < 60 && useAppStore.getState().app === 'match'; guard++) {
    const run = useRunStore.getState().run!;
    if (!win) {
      runController.abandon();
      break;
    }
    const g = COMMISSION_BY_ID[run.commission.id]?.guidedMoves?.[run.moveIndex];
    const move = g && run.commission.attempts === 0 ? { a: { x: g.a[0], y: g.a[1] }, b: { x: g.b[0], y: g.b[1] } } : pickHint(run, gameCfg())!.move;
    runController.commit(move);
    await flush();
  }
  expect(useAppStore.getState().app).toBe('settlement');
  gameController.closeSettlement();
  gameController.arrived();
}

describe('day 1 flow and gates (P1-27, 02 §11.1)', () => {
  it('new game → T1 → T2 → guided water → C01 → shop/sleep → day 2, with the right actions per gate', async () => {
    gameController.boot();
    gameController.newGame(8);
    expect(gate()).toBe('G0');
    expect(allow()).toEqual([]);
    await refreshMidMatch();
    await playOut(true);

    expect(gate()).toBe('G1');
    expect(allow()).toEqual(['openCommission']);
    expect(tipIds()).toContain('fieldMemory');
    gameController.sleep();
    expect(useAppStore.getState().app).toBe('hub');
    gameController.setCareMode('water');
    expect(useUiStore.getState().careMode).toBe('none');
    refreshKeepsGate();

    gameController.openBrief();
    expect(tipIds()).toContain('onlyRipe');
    gameController.startRun();
    expect(gate()).toBe('G2');
    await refreshMidMatch();
    await playOut(true);

    expect(gate()).toBe('G3');
    expect(useAppStore.getState().app).toBe('brief');
    expect(useUiStore.getState().briefReadOnly).toBe(true);
    gameController.closeBrief();
    expect(useUiStore.getState().careMode).toBe('water');
    const row = useUiStore.getState().guideRow!;
    expect(tipIds()).toContain('care');
    gameController.openBrief();
    expect(useAppStore.getState().app).toBe('hub');
    expect(gameController.waterRow((row + 1) % 7)).toBe(false);
    refreshKeepsGate();
    gameController.startGuidedWatering();
    expect(gameController.waterRow(useUiStore.getState().guideRow!)).toBe(true);

    expect(gate()).toBe('G4');
    expect(allow()).toEqual(['openCommission', 'water', 'bee']);
    refreshKeepsGate();
    gameController.openBrief();
    gameController.startRun();
    await refreshMidMatch();
    await playOut(true);

    expect(gate()).toBe('G5');
    expect(useAppStore.getState().home!.phase).toBe('dusk');
    expect(allow()).toEqual(['shop', 'sleep', 'water', 'bee']);
    expect(tipIds()).toContain('shop');
    while (useUiStore.getState().tips.length) dismissTip();
    expect(tipIds()).toContain('sleep');
    refreshKeepsGate();
    expect(gameController.purchase('windChime')).toBe(true);
    gameController.sleep();
    expect(useAppStore.getState().app).toBe('night');
    gameController.revealMorning();
    await flush();
    expect(useAppStore.getState().app).toBe('hub');
    expect(gate()).toBe('done');
    expect(useAppStore.getState().home!.day).toBe(2);
    expect(useAppStore.getState().home!.commissions.active?.id).toBe('C02');
    expect(tipIds()).toContain('morning');

    // P2-15 #1: the telemetry trail has every gate, in order. Each tip is logged once, except that a tip first
    // shown mid-run is re-shown once after a mid-run reload: seenTips ride on the next safe-point write (02 §11.5).
    const log = telemetry.all();
    expect(log.filter((e) => e.e === 'tutorial_step').map((e) => e.step)).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'done']);
    const tips = log.flatMap((e) => (e.e === 'tip_shown' ? [e.tip] : []));
    const repeated = tips.filter((t, i) => tips.indexOf(t) !== i);
    expect(new Set(repeated).size).toBe(repeated.length);
    for (const t of repeated) expect(lostTips).toContain(t);
    expect(tips).toEqual(expect.arrayContaining(['fieldMemory', 'onlyRipe', 'preview', 'care', 'shop', 'sleep', 'morning']));
    expect([...tipIds()].sort()).toEqual([...new Set(tips)].sort());
  });

  it('T2 abandoned twice auto-completes; C01 failed twice unlocks sleep with the first-fail tip', async () => {
    gameController.boot();
    gameController.newGame(3);
    await playOut(true);
    for (let k = 0; k < 2; k++) {
      gameController.openBrief();
      gameController.startRun();
      await playOut(false);
    }
    expect(useAppStore.getState().settlement?.autoCompleted).toBe(true);
    expect(gate()).toBe('G3');
    expect(tipIds()).toContain('firstFail');
    gameController.closeBrief();
    gameController.waterRow(useUiStore.getState().guideRow!);
    expect(gameController.canSleep()).toBe(false);
    for (let k = 0; k < 2; k++) {
      gameController.openBrief();
      gameController.startRun();
      await playOut(false);
    }
    expect(gameController.canSleep()).toBe(true);
    gameController.sleep();
    gameController.revealMorning();
    await flush();
    expect(gate()).toBe('done');
    expect(useAppStore.getState().home!.commissions.active?.id).toBe('C01');
    // Four failed runs came back to the hub; firstFail was shown on the first only.
    expect(telemetry.all().filter((e) => e.e === 'tip_shown' && e.tip === 'firstFail')).toHaveLength(1);
  });

  it('care telemetry: guided watering is prompted, free watering is not (P1-24 #3)', async () => {
    gameController.boot();
    gameController.newGame(8);
    await playOut(true);
    gameController.openBrief();
    gameController.startRun();
    await playOut(true);
    gameController.closeBrief();
    const guided = useUiStore.getState().guideRow!;
    expect(gameController.waterRow(guided)).toBe(true);
    expect(gate()).toBe('G4');
    gameController.setCareMode('water');
    expect(gameController.waterRow((guided + 1) % 7)).toBe(true);
    const care = telemetry.all().filter((e) => e.e === 'care');
    expect(care.map((e) => [e.target, e.prompted])).toEqual([
      [String(guided), true],
      [String((guided + 1) % 7), false],
    ]);
  });

  it('each tip is shown once per save', async () => {
    gameController.boot();
    gameController.newGame(8);
    await playOut(true);
    const n = useUiStore.getState().tips.filter((t) => t.id === 'fieldMemory').length;
    gameController.closeSettlement();
    gameController.arrived();
    expect(useUiStore.getState().tips.filter((t) => t.id === 'fieldMemory').length).toBe(n);
    expect(new Set(tipIds()).size).toBe(tipIds().length);
  });
});
