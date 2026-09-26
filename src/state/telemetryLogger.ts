import { pushRing, type TelemetryEvent } from '@/core/telemetry/events';
import { now } from '@/platform/clock';
import { persistence } from '@/state/persistence';

const KEY = 'dewfield:telemetry';
type Payload<E extends TelemetryEvent['e']> = Omit<Extract<TelemetryEvent, { e: E }>, 'e' | 't' | 'sid'>;

let buffer: TelemetryEvent[] | null = null;
let started = 0;
let sid = '';
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function load(): TelemetryEvent[] {
  if (buffer) return buffer;
  try {
    const raw = persistence.adapter.get(KEY);
    buffer = raw ? (JSON.parse(raw) as TelemetryEvent[]) : [];
  } catch {
    buffer = [];
  }
  return buffer;
}

function flush(): void {
  flushTimer = null;
  persistence.adapter.set(KEY, JSON.stringify(load()));
}

/** 02 §13 — local ring buffer (5000). Never leaves the device unless exported from the debug panel. */
export const telemetry = {
  start(meta: Payload<'session_start'>): void {
    started = now();
    sid = `${started.toString(36)}-${Math.floor((started % 9973) * 7.3).toString(36)}`;
    telemetry.log('session_start', meta);
  },
  log<E extends TelemetryEvent['e']>(e: E, fields: Payload<E>): void {
    if (!sid) {
      started = now();
      sid = `s${started.toString(36)}`;
    }
    const ev = { e, t: now() - started, sid, ...fields } as unknown as TelemetryEvent;
    buffer = pushRing(load(), ev, 5000);
    if (!flushTimer) flushTimer = setTimeout(flush, 500);
  },
  all(): readonly TelemetryEvent[] {
    return load();
  },
  exportJson(): string {
    return JSON.stringify(load(), null, 0);
  },
  reset(): void {
    buffer = [];
    sid = '';
    flush();
  },
  sinceStart(): number {
    return now() - started;
  },
};
