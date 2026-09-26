/** 03 §7.2 run phase machine (the logic run itself lives in core/run). */
export type RunPhase = 'intro' | 'idle' | 'rejecting' | 'resolving' | 'rush' | 'ended';

export type RunPhaseEvent =
  | { type: 'INTRO_DONE' }
  | { type: 'COMMIT_OK' }
  | { type: 'COMMIT_REJECTED' }
  | { type: 'TIMELINE_DONE'; status: 'playing' | 'won' | 'lost'; needsRush: boolean }
  | { type: 'ABANDON' };

export function runPhaseTransition(phase: RunPhase, e: RunPhaseEvent): { phase: RunPhase; ignored?: true } {
  switch (phase) {
    case 'intro':
      if (e.type === 'INTRO_DONE') return { phase: 'idle' };
      break;
    case 'idle':
      if (e.type === 'COMMIT_OK') return { phase: 'resolving' };
      if (e.type === 'COMMIT_REJECTED') return { phase: 'rejecting' };
      if (e.type === 'ABANDON') return { phase: 'ended' };
      break;
    case 'rejecting':
      if (e.type === 'TIMELINE_DONE') return { phase: 'idle' };
      break;
    case 'resolving':
      if (e.type === 'TIMELINE_DONE')
        return { phase: e.status === 'playing' ? 'idle' : e.needsRush ? 'rush' : 'ended' };
      break;
    case 'rush':
      if (e.type === 'TIMELINE_DONE') return { phase: 'ended' };
      break;
    default:
      break;
  }
  return { phase, ignored: true };
}
