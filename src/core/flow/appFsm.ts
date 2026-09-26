/** 03 §7.1 App state machine: pure transition table; controllers run the effects. */
export type AppState =
  | 'boot'
  | 'title'
  | 'toMatch'
  | 'match'
  | 'settlement'
  | 'toHub'
  | 'hub'
  | 'brief'
  | 'night'
  | 'photo';

export type AppEvent =
  | { type: 'BOOT_OK' }
  | { type: 'NEW_GAME' }
  | { type: 'CONTINUE'; hasSave: boolean }
  | { type: 'OPEN_BRIEF'; allowed: boolean }
  | { type: 'CLOSE_BRIEF' }
  | { type: 'START_RUN' }
  | { type: 'ARRIVED' }
  | { type: 'RUN_ENDED' }
  | { type: 'SETTLEMENT_CLOSED' }
  | { type: 'SLEEP'; allowed: boolean }
  | { type: 'MORNING_DONE' }
  | { type: 'ENTER_PHOTO' }
  | { type: 'EXIT_PHOTO' };

export type AppEffect =
  | 'loadSettingsAndSave'
  | 'newGame'
  | 'startRun'
  | 'runIntro'
  | 'settleRun'
  | 'recomputeGate'
  | 'sleepAndSave'
  | 'showBrief'
  | 'hideHud'
  | 'showHud';

export interface AppTransition {
  state: AppState;
  effects: AppEffect[];
  ignored?: true;
}

type Rule = { to: AppState; effects: AppEffect[]; guard?: (e: AppEvent) => boolean };

const TABLE: Partial<Record<AppState, Partial<Record<AppEvent['type'], Rule>>>> = {
  boot: { BOOT_OK: { to: 'title', effects: ['loadSettingsAndSave'] } },
  title: {
    NEW_GAME: { to: 'toMatch', effects: ['newGame', 'startRun'] },
    CONTINUE: { to: 'hub', effects: [], guard: (e) => e.type === 'CONTINUE' && e.hasSave },
  },
  hub: {
    OPEN_BRIEF: { to: 'brief', effects: [], guard: (e) => e.type === 'OPEN_BRIEF' && e.allowed },
    SLEEP: { to: 'night', effects: ['sleepAndSave'], guard: (e) => e.type === 'SLEEP' && e.allowed },
    ENTER_PHOTO: { to: 'photo', effects: ['hideHud'] },
  },
  brief: {
    CLOSE_BRIEF: { to: 'hub', effects: [] },
    START_RUN: { to: 'toMatch', effects: ['startRun'] },
  },
  toMatch: { ARRIVED: { to: 'match', effects: ['runIntro'] } },
  match: { RUN_ENDED: { to: 'settlement', effects: ['settleRun'] } },
  settlement: { SETTLEMENT_CLOSED: { to: 'toHub', effects: [] } },
  toHub: { ARRIVED: { to: 'hub', effects: ['recomputeGate'] } },
  night: { MORNING_DONE: { to: 'hub', effects: ['showBrief'] } },
  photo: { EXIT_PHOTO: { to: 'hub', effects: ['showHud'] } },
};

export function appTransition(state: AppState, event: AppEvent): AppTransition {
  const rule = TABLE[state]?.[event.type];
  if (!rule || (rule.guard && !rule.guard(event))) return { state, effects: [], ignored: true };
  return { state: rule.to, effects: rule.effects };
}

/** States in which the board accepts gestures. */
export const boardInteractive = (s: AppState): boolean => s === 'match';
