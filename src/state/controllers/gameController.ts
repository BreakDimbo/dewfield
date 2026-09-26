import type { BoardEvent } from '@/core/board/events';
import { isCrop, type Pos } from '@/core/board/model';
import { CLIENTS } from '@/core/config/clients';
import { CROP_BY_ID } from '@/core/config/crops';
import type { DecorId } from '@/core/homestead/state';
import { appTransition, type AppEvent } from '@/core/flow/appFsm';
import { currentGate, tutorialGate, type HubAction } from '@/core/flow/gates';
import { carePlaceBee, effectiveModifiers, purchaseDecor } from '@/core/homestead/decor';
import { careWaterRow, fieldBoard, newHomestead, pickWaterRowHint, settleRun, sleep } from '@/core/homestead/homestead';
import type { HomesteadState } from '@/core/homestead/state';
import { createRun } from '@/core/run/run';
import type { SettingsV1 } from '@/core/save/settings';
import { bus } from '@/state/bus';
import { gameCfg } from '@/state/config';
import { pushNotice, useAppStore, type Settings } from '@/state/appStore';
import { persistence } from '@/state/persistence';
import { useRunStore } from '@/state/runStore';
import { telemetry } from '@/state/telemetryLogger';
import { useUiStore } from '@/state/uiStore';
import { runController } from './runController';
import { showTip, tipSeen } from './tips';

let warnedMemory = false;
let pendingSeed = 0;
let pendingMorning: BoardEvent[] | null = null;

/** 02 §12.4 safe points only — never mid-move. */
function persist(): void {
  const home = useAppStore.getState().home;
  if (!home) return;
  const r = persistence.save(home);
  if ((r.fellBack || persistence.usingMemory) && !warnedMemory) {
    warnedMemory = true;
    pushNotice('本次进度无法保存。', 'warn');
  }
}

/** Commit a new homestead; log tutorial gate changes (02 §13.2 tutorial_step). */
function setHome(next: HomesteadState): void {
  const prev = useAppStore.getState().home;
  useAppStore.setState({ home: next });
  if (prev && currentGate(prev) !== currentGate(next)) telemetry.log('tutorial_step', { step: currentGate(next) });
}

const allowed = (a: HubAction): boolean => {
  const home = useAppStore.getState().home;
  return !!home && tutorialGate(home).allow.includes(a);
};

function dispatch(ev: AppEvent): boolean {
  const from = useAppStore.getState().app;
  const tr = appTransition(from, ev);
  if (tr.ignored) return false;
  for (const fx of tr.effects) runEffect(fx);
  useAppStore.setState({ app: tr.state });
  bus.emit('appTransition', { from, to: tr.state });
  if (tr.state === 'hub') onHubArrival(from);
  return true;
}

function runEffect(fx: ReturnType<typeof appTransition>['effects'][number]): void {
  const s = useAppStore.getState();
  switch (fx) {
    case 'newGame':
      telemetry.log('tutorial_step', { step: 'G0' });
      useAppStore.setState({ home: newHomestead(pendingSeed, gameCfg()), settlement: null });
      return;
    case 'startRun': {
      const home = useAppStore.getState().home;
      if (home) setHome(runController.start(home));
      persist();
      return;
    }
    case 'runIntro':
      runController.introDone();
      if (useRunStore.getState().run?.commission.id === 'T2') showTip('preview');
      return;
    case 'sleepAndSave': {
      if (!s.home) return;
      const r = sleep(s.home, gameCfg());
      if (!r.ok) return;
      telemetry.log('sleep', { day: s.home.day, careUnused: s.home.care.pointsLeft });
      setHome(r.home);
      persist();
      pendingMorning = r.events;
      useUiStore.setState({ nightPhase: 'dark' });
      bus.emit('cue', { t: 'ui', name: 'night' });
      return;
    }
    default:
      return;
  }
}

/** Contextual hub beats of day 1 (02 §11.1, §16.5). */
function onHubArrival(from: string): void {
  const home = useAppStore.getState().home;
  if (!home) return;
  const gate = currentGate(home);
  if (from === 'toHub' && gate === 'G1') showTip('fieldMemory');
  if (from === 'toHub' && useAppStore.getState().settlement?.result !== 'won' && useAppStore.getState().settlement) showTip('firstFail');
  if (gate === 'G3' && home.commissions.active) {
    if (tipSeen('care')) gameController.startGuidedWatering();
    else {
      useUiStore.setState({ briefReadOnly: true });
      dispatch({ type: 'OPEN_BRIEF', allowed: true });
    }
    return;
  }
  if (home.phase === 'dusk' && home.day === 1) showTip('shop');
  if (from === 'night' && home.day === 2) showTip('morning');
}

/** A read-only RunState wrapper around the field, so the choreographer can land on the hub board too. */
function hubRun() {
  const home = useAppStore.getState().home!;
  const active = home.commissions.active ?? {
    id: '-',
    clientId: 'amai' as const,
    tier: 1 as const,
    items: [],
    moves: 0,
    isTutorial: false,
    dayExempt: false,
    text: '',
    delivered: {},
    attempts: 0,
  };
  return createRun({ commission: active, board: fieldBoard(home), seed: 0, uidCounter: home.uidCounter }, gameCfg());
}

runController.bindEnded((run, abandoned) => {
  const home = useAppStore.getState().home;
  if (!home) return;
  const out = settleRun(home, run, gameCfg(), abandoned);
  telemetry.log('run_end', {
    commissionId: run.commission.id,
    result: out.settlement.result,
    movesLeft: run.movesLeftAtWin ?? run.movesLeft,
    stars: out.settlement.stars ?? 0,
    deliveredTotal: out.settlement.items.reduce((s, i) => s + i.delivered, 0),
    surplusTotal: Object.values(run.surplus).reduce<number>((s, v) => s + (v ?? 0), 0),
    dewdrops: out.settlement.total,
    durationMs: runController.runElapsed(),
  });
  setHome(out.home);
  useAppStore.setState({ settlement: out.settlement });
  persist();
  dispatch({ type: 'RUN_ENDED' });
});

export const gameController = {
  dispatch,
  boot(): void {
    persistence.setBuild(__BUILD__);
    const s = persistence.loadSettings();
    useAppStore.setState({ settings: { reducedMotion: s.reducedMotion, volume: s.volume, quality: s.quality } });
    if (persistence.mainIsCorrupt()) {
      const out = persistence.load();
      if (out.kind === 'corrupt') pushNotice('存档无法读取，已开始新的露台（旧档已保留，可在设置中导出）', 'warn');
      else if (out.kind === 'loaded') pushNotice('主存档损坏，已从备份恢复。', 'warn');
    }
    dispatch({ type: 'BOOT_OK' });
  },
  newGame(seed: number): void {
    pendingSeed = seed >>> 0;
    dispatch({ type: 'NEW_GAME' });
  },
  hasSave(): boolean {
    return persistence.hasSave();
  },
  continueGame(): boolean {
    const out = persistence.load();
    if (out.kind === 'corrupt') pushNotice('存档无法读取，已开始新的露台（旧档已保留，可在设置中导出）', 'warn');
    if (out.kind !== 'loaded') return false;
    if (out.from === 'backup') pushNotice('主存档损坏，已从备份恢复。', 'warn');
    useAppStore.setState({ home: out.home, settlement: null });
    bus.emit('boardSnap', { run: hubRun() });
    return dispatch({ type: 'CONTINUE', hasSave: true });
  },
  openBrief(): void {
    const home = useAppStore.getState().home;
    const ok = !!home?.commissions.active && home.phase === 'morning' && allowed('openCommission');
    useUiStore.setState({ briefReadOnly: false, panel: 'none', careMode: 'none' });
    if (dispatch({ type: 'OPEN_BRIEF', allowed: ok }) && home?.commissions.active?.id === 'T2') showTip('onlyRipe');
  },
  closeBrief(): void {
    const readOnly = useUiStore.getState().briefReadOnly;
    useUiStore.setState({ briefReadOnly: false });
    if (readOnly) gameController.startGuidedWatering();
    dispatch({ type: 'CLOSE_BRIEF' });
  },
  /** G3: C01 card was shown read-only; now only watering the hinted row is possible. */
  startGuidedWatering(): void {
    const home = useAppStore.getState().home;
    const a = home?.commissions.active;
    if (!home || !a || currentGate(home) !== 'G3') return;
    const crop = a.items[0]!.crop;
    const row = pickWaterRowHint(fieldBoard(home), crop);
    useUiStore.setState({ careMode: 'water', guideRow: row, hoverRow: row });
    showTip('care', { client: CLIENTS[a.clientId].name, crop: CROP_BY_ID[crop].name });
  },
  startRun(): void {
    dispatch({ type: 'START_RUN' });
  },
  /** Camera finished its transition (or was skipped). */
  arrived(): void {
    dispatch({ type: 'ARRIVED' });
  },
  closeSettlement(): void {
    useRunStore.setState({ run: null, phase: 'ended' });
    bus.emit('boardSnap', { run: hubRun() });
    dispatch({ type: 'SETTLEMENT_CLOSED' });
  },
  canSleep(): boolean {
    return allowed('sleep');
  },
  sleep(): void {
    useUiStore.setState({ careMode: 'none', panel: 'none', guideRow: null });
    dispatch({ type: 'SLEEP', allowed: allowed('sleep') });
  },
  /** Night veil has fallen: play the overnight growth wave as the light comes back. */
  revealMorning(): void {
    if (useAppStore.getState().app !== 'night') return;
    useUiStore.setState({ nightPhase: 'dawn' });
    const events = pendingMorning ?? [];
    pendingMorning = null;
    if (events.length === 0) gameController.morningDone();
    else bus.emit('boardEvents', { events, run: hubRun(), kind: 'overnight' });
  },
  morningDone(): void {
    if (dispatch({ type: 'MORNING_DONE' })) useUiStore.setState({ nightPhase: null });
  },
  setCareMode(mode: 'none' | 'water' | 'bee'): void {
    if (useUiStore.getState().guideRow !== null && mode === 'none') return;
    if (mode === 'water' && !allowed('water')) return;
    if (mode === 'bee' && !allowed('bee')) return;
    useUiStore.setState({ careMode: mode, hoverRow: null, hoverCell: null, panel: 'none', tooltip: null });
  },
  waterRow(y: number): boolean {
    const home = useAppStore.getState().home;
    if (!home || !allowed('water')) return false;
    const guideRow = useUiStore.getState().guideRow;
    if (guideRow !== null && y !== guideRow) {
      pushNotice('先浇发光的那一行。');
      return false;
    }
    const r = careWaterRow(home, y, gameCfg());
    if (!r.ok) {
      pushNotice(r.reason === 'rowWatered' ? '这一行今天已经浇过了。' : '今天的照料点用完了。', 'warn');
      return false;
    }
    telemetry.log('care', { verb: 'water', target: String(y), day: home.day, phase: home.phase, prompted: guideRow !== null });
    if (r.allRipe) pushNotice('这一行都已经熟了。');
    setHome(r.home);
    persist();
    useUiStore.setState({ careMode: r.home.care.pointsLeft > 0 && guideRow === null ? 'water' : 'none', guideRow: null });
    bus.emit('boardEvents', { events: r.events, run: hubRun(), kind: 'care' });
    bus.emit('cue', { t: 'ui', name: 'water' });
    return true;
  },
  placeBee(pos: Pos): boolean {
    const home = useAppStore.getState().home;
    if (!home || !allowed('bee')) return false;
    const r = carePlaceBee(home, pos, gameCfg());
    if (!r.ok) {
      const msg = { locked: '购买蜂箱后解锁', noPoints: '今天的照料点用完了。', beeUsed: '今天已经放过蜂了。', badTarget: '要放在普通作物上。' };
      pushNotice(msg[r.reason], 'warn');
      return false;
    }
    telemetry.log('care', { verb: 'bee', target: `${pos.x},${pos.y}`, day: home.day, phase: home.phase, prompted: false });
    setHome(r.home);
    persist();
    useUiStore.setState({ careMode: 'none' });
    bus.emit('boardEvents', { events: r.events, run: hubRun(), kind: 'care' });
    showTip('bee');
    return true;
  },
  canPlaceBee(): boolean {
    const home = useAppStore.getState().home;
    return !!home && effectiveModifiers(home).careVerbs.includes('bee') && !home.care.beeUsed && home.care.pointsLeft > 0;
  },
  openPanel(panel: 'none' | 'shop' | 'settings'): void {
    if (panel === 'shop' && !allowed('shop')) return;
    useUiStore.setState({ panel, careMode: useUiStore.getState().guideRow !== null ? 'water' : 'none' });
  },
  purchase(id: DecorId): boolean {
    const home = useAppStore.getState().home;
    if (!home || !allowed('shop')) return false;
    const r = purchaseDecor(home, id, gameCfg());
    if (!r.ok) {
      pushNotice(r.reason === 'poor' ? '露珠还不够。' : r.reason === 'locked' ? '露台升级后才能买。' : '已经有了。', 'warn');
      return false;
    }
    telemetry.log('purchase', { decorId: id, price: r.events[0]!.t === 'decorPurchased' ? r.events[0]!.price : 0, day: home.day });
    setHome(r.home);
    persist();
    useUiStore.setState((s) => ({ lastPurchase: { id, n: (s.lastPurchase?.n ?? 0) + 1 } }));
    bus.emit('cue', { t: 'ui', name: 'confirm' });
    if (r.events.some((e) => e.t === 'terraceLevelUp')) {
      bus.emit('cue', { t: 'ui', name: 'levelUp' });
      showTip('levelUp');
    }
    return true;
  },
  enterPhoto(): void {
    useUiStore.setState({ panel: 'none', careMode: 'none', photoPose: 0 });
    dispatch({ type: 'ENTER_PHOTO' });
  },
  exitPhoto(): void {
    dispatch({ type: 'EXIT_PHOTO' });
  },
  setPhotoPose(p: 0 | 1 | 2): void {
    useUiStore.setState({ photoPose: p });
  },
  logPhoto(): void {
    telemetry.log('photo', { pose: String(useUiStore.getState().photoPose) });
  },
  setTomorrow(on: boolean): void {
    if (on === useUiStore.getState().tomorrow) return;
    useUiStore.setState({ tomorrow: on });
    if (on) telemetry.log('hub_inspect', { kind: 'tomorrow' });
  },
  inspectTile(pos: Pos, screen: { x: number; y: number }): void {
    const home = useAppStore.getState().home;
    if (!home) return;
    const t = fieldBoard(home).cells[pos.y * 7 + pos.x]!;
    const STAGE = ['芽', '青', '熟'];
    const NEXT = ['明早变青', '明早会熟', '已经熟了'];
    const text = isCrop(t) ? `${CROP_BY_ID[t.crop].name} · ${STAGE[t.stage]} · ${NEXT[t.stage]}` : '蜂群 · 与任意作物交换';
    useUiStore.setState({ tooltip: { x: screen.x, y: screen.y, text } });
    telemetry.log('hub_inspect', { kind: 'tile' });
  },
  updateSettings(patch: Partial<Settings>): void {
    const cur = useAppStore.getState().settings;
    const next = { ...cur, ...patch, volume: { ...cur.volume, ...(patch.volume ?? {}) } };
    useAppStore.setState({ settings: next });
    const v1: SettingsV1 = { schemaVersion: 1, volume: next.volume, reducedMotion: next.reducedMotion, quality: next.quality };
    persistence.saveSettings(v1);
    for (const [k, v] of Object.entries(patch)) telemetry.log('settings_change', { key: k, value: JSON.stringify(v) });
  },
  resetSave(): void {
    persistence.clear();
    useRunStore.setState({ run: null, phase: 'ended' });
    useUiStore.setState({ panel: 'none', careMode: 'none', tips: [], guideRow: null });
    useAppStore.setState({ home: null, settlement: null, app: 'title' });
    pushNotice('存档已重置，设置保留。');
  },
  lockedByOtherTab(): void {
    persistence.lock();
    useUiStore.setState({ locked: true });
  },
  extraMoves(): number {
    const home = useAppStore.getState().home;
    return home ? effectiveModifiers(home).extraMoves : 0;
  },
  hubRun,
};
