/** 02 §13.2 local-only telemetry. `t` is ms since the session started (passed in by the platform clock). */
export type TelemetryEvent =
  | { e: 'session_start'; t: number; sid: string; build: string; ua: string; dpr: number; quality: string; w: number; h: number }
  | { e: 'tutorial_step'; t: number; sid: string; step: string }
  | { e: 'tip_shown'; t: number; sid: string; tip: string }
  | { e: 'run_start'; t: number; sid: string; commissionId: string; attempt: number; day: number; runSeed: number; fieldRipe: number; fieldUnripe: number }
  | { e: 'first_input'; t: number; sid: string; msSinceRunStart: number }
  | { e: 'move'; t: number; sid: string; i: number; harvested: number; ripe: number; unripe: number; sprout: number; depth: number; created: string; previewMs: number }
  | { e: 'swap_rejected'; t: number; sid: string; i: number }
  | { e: 'special_created'; t: number; sid: string; kind: string; moveIndex: number; msSinceFirstInput: number }
  | { e: 'special_activated'; t: number; sid: string; kind: string; via: string }
  | { e: 'combo'; t: number; sid: string; a: string; b: string }
  | { e: 'undo'; t: number; sid: string; moveIndex: number }
  | { e: 'hint_shown'; t: number; sid: string; moveIndex: number }
  | { e: 'shuffle'; t: number; sid: string; moveIndex: number }
  | { e: 'run_end'; t: number; sid: string; commissionId: string; result: 'won' | 'lost' | 'abandoned'; movesLeft: number; stars: number; deliveredTotal: number; surplusTotal: number; dewdrops: number; durationMs: number }
  | { e: 'care'; t: number; sid: string; verb: 'water' | 'bee'; target: string; day: number; phase: string; prompted: boolean }
  | { e: 'hub_inspect'; t: number; sid: string; kind: 'tile' | 'tomorrow' }
  | { e: 'sleep'; t: number; sid: string; day: number; careUnused: number }
  | { e: 'purchase'; t: number; sid: string; decorId: string; price: number; day: number }
  | { e: 'photo'; t: number; sid: string; pose: string }
  | { e: 'settings_change'; t: number; sid: string; key: string; value: string }
  | { e: 'legalize_fix'; t: number; sid: string; count: number }
  | { e: 'choreo_mismatch'; t: number; sid: string; moveIndex: number; count: number }
  | { e: 'bench_result'; t: number; sid: string; avgMs: number; p95Ms: number; dpr: number; quality: string };

export type TelemetryName = TelemetryEvent['e'];

/** Ring buffer semantics (02 §12.1): keep the newest `cap` events. */
export function pushRing<T>(buf: readonly T[], item: T, cap = 5000): T[] {
  const out = buf.length >= cap ? buf.slice(buf.length - cap + 1) : buf.slice();
  out.push(item);
  return out;
}
