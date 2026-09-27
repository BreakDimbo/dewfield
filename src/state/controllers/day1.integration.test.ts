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

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  persistence.use(new MemoryAdapter(), 'test');
  useAppStore.setState({ app: 'boot', home: null, settlement: null, notices: [] });
  useRunStore.setState({ run: null, phase: 'ended', paused: false, selected: null, preview: null, guide: null });
  useUiStore.setState({ tips: [], careMode: 'none', guideRow: null, panel: 'none', briefReadOnly: false });
  telemetry.reset();
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
    gameController.openBrief();
    gameController.startRun();
    await playOut(true);

    expect(gate()).toBe('G5');
    expect(useAppStore.getState().home!.phase).toBe('dusk');
    expect(allow()).toEqual(['shop', 'sleep', 'water', 'bee']);
    expect(tipIds()).toContain('shop');
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
