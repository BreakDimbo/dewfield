import type { HomesteadState } from '@/core/homestead/state';

/** 02 §11.1 / §11.5 hub actions a gate can allow. */
export type HubAction = 'openCommission' | 'water' | 'bee' | 'shop' | 'sleep' | 'photo';
export type GateId = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'done';

const ORDER: GateId[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'];
const ALL: HubAction[] = ['openCommission', 'water', 'bee', 'shop', 'sleep', 'photo'];
export const C01_FAIL_FLAG = 'C01:fail2';

export function currentGate(home: Pick<HomesteadState, 'tutorial'>): GateId {
  if (home.tutorial.done) return 'done';
  return ORDER.find((g) => !home.tutorial.completedSteps.includes(g)) ?? 'done';
}

/** 02 §11.1 allowed hub actions per gate. */
export function tutorialGate(home: Pick<HomesteadState, 'tutorial'>): { step: GateId; allow: HubAction[] } {
  const step = currentGate(home);
  switch (step) {
    case 'G0':
      return { step, allow: [] };
    case 'G1':
    case 'G2':
      return { step, allow: ['openCommission'] };
    case 'G3':
      return { step, allow: ['water'] };
    case 'G4': {
      const allow: HubAction[] = ['openCommission', 'water', 'bee'];
      if (home.tutorial.completedSteps.includes(C01_FAIL_FLAG)) allow.push('sleep');
      return { step, allow };
    }
    case 'G5':
      return { step, allow: ['shop', 'sleep', 'water', 'bee'] };
    default:
      return { step, allow: ALL };
  }
}

export type TutorialEvent =
  | { t: 'runStarted'; id: string }
  | { t: 'runWon'; id: string }
  | { t: 'runLost'; id: string; attempts: number }
  | { t: 'watered' }
  | { t: 'slept' };

const complete = (home: HomesteadState, ...steps: string[]): HomesteadState => ({
  ...home,
  tutorial: { ...home.tutorial, completedSteps: [...home.tutorial.completedSteps, ...steps.filter((s) => !home.tutorial.completedSteps.includes(s))] },
});

/** 02 §11.1 gate transitions. Pure; returns the same reference when nothing changes. */
export function tutorialOnEvent(home: HomesteadState, e: TutorialEvent, autoCompleteAfterFails: number): HomesteadState {
  const g = currentGate(home);
  switch (g) {
    case 'G0':
      return e.t === 'runWon' && e.id === 'T1' ? complete(home, 'G0') : home;
    case 'G1':
      return e.t === 'runStarted' && e.id === 'T2' ? complete(home, 'G1') : home;
    case 'G2':
      if (e.t === 'runWon' && e.id === 'T2') return complete(home, 'G2');
      if (e.t === 'runLost' && e.id === 'T2' && e.attempts >= autoCompleteAfterFails) return complete(home, 'G2');
      return home;
    case 'G3':
      return e.t === 'watered' ? complete(home, 'G3') : home;
    case 'G4':
      if (e.t === 'runWon' && e.id === 'C01') return complete(home, 'G4');
      if (e.t === 'runLost' && e.id === 'C01' && e.attempts >= autoCompleteAfterFails) return complete(home, C01_FAIL_FLAG);
      if (e.t === 'slept' && home.tutorial.completedSteps.includes(C01_FAIL_FLAG)) {
        const h = complete(home, 'G4', 'G5');
        return { ...h, tutorial: { ...h.tutorial, done: true } };
      }
      return home;
    case 'G5':
      if (e.t === 'slept') {
        const h = complete(home, 'G5');
        return { ...h, tutorial: { ...h.tutorial, done: true } };
      }
      return home;
    default:
      return home;
  }
}
