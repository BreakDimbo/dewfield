import { describe, expect, it } from 'vitest';
import a from '../../../tests/fixtures/telemetry/session-a.json';
import b from '../../../tests/fixtures/telemetry/session-b.json';
import { pushRing, type TelemetryEvent } from './events';
import { computeKpis, kpiMarkdown } from './kpi';

const events = [...a, ...b] as TelemetryEvent[];

describe('KPI (P1-24, 02 §13.3)', () => {
  const r = computeKpis(events);
  it('K1a/K1b: first special after first input, first attempt only', () => {
    expect(r.sessions).toBe(2);
    expect(r.k1a).toEqual([14000, null]);
    expect(r.k1b).toEqual([98000]);
  });
  it('K2 counts only unprompted care before C02', () => {
    expect(r.k2).toEqual({ sessions: 2, spontaneous: 1, share: 0.5 });
  });
  it('K3 median hub dwell before run_start', () => {
    expect(r.k3MedianMs).toBe(20000);
  });
  it('K4 win rate and attempts per commission', () => {
    expect(r.k4.T1).toEqual({ runs: 2, wins: 2, winRate: 1, meanAttempts: 1 });
    expect(r.k4.C01).toEqual({ runs: 1, wins: 0, winRate: 0, meanAttempts: 0 });
  });
  it('K5 care per day and unused points at sleep; K6 preview and undo usage', () => {
    expect(r.k5.careUnused).toEqual({ 2: 1 });
    expect(r.k5.carePerDay).toBeCloseTo(3 / 4);
    expect(r.k6.previewUse).toBe(0.5);
    expect(r.k6.undoPerRun).toBeCloseTo(1 / 5);
  });
  it('renders a markdown report', () => {
    const md = kpiMarkdown(r);
    expect(md).toContain('K1a');
    expect(md).toContain('| T1 | 2 | 100% | 1.00 |');
    expect(md).toContain('| C01 | 1 | 0% | — |');
    expect(md).toContain('| K5（入夜未用照料点：点数→次数） | 2→1 |');
    const empty = kpiMarkdown(computeKpis([]));
    expect(empty).toContain('会话数：0');
    expect(empty).toContain('| K5（入夜未用照料点：点数→次数） | — |');
  });
  it('groups page loads by tester id when present (a reload is not a second tester)', () => {
    // Session a split across two page loads of one tester: the reload logs session_start and t restarts at 0.
    const evs = a as TelemetryEvent[];
    const cut = evs.findIndex((e) => e.e === 'run_end') + 1;
    const first = evs.slice(0, cut).map((e) => ({ ...e, sid: 'a1', tid: 'x' }));
    const t0 = evs[cut - 1]!.t;
    const second = [{ ...evs[0]!, t: t0 }, ...evs.slice(cut)].map((e) => ({ ...e, sid: 'a2', tid: 'x', t: e.t - t0 }));
    const split = computeKpis([...first, ...second, ...(b as TelemetryEvent[])]);
    expect(split.sessions).toBe(2);
    expect(split.k1a).toEqual(r.k1a);
    expect(split.k2).toEqual(r.k2);
    expect(split.k3MedianMs).toBe(r.k3MedianMs);
    expect(split.k4).toEqual(r.k4);
    expect(split.k5).toEqual(r.k5);
    expect(computeKpis([...first, ...second]).sessions).toBe(1);
    expect(computeKpis([...first.map(({ tid: _t, ...e }) => e), ...second.map(({ tid: _t, ...e }) => e)] as TelemetryEvent[]).sessions).toBe(2);
  });
  it('ring buffer keeps the newest 5000', () => {
    let buf: number[] = [];
    for (let i = 0; i < 5003; i++) buf = pushRing(buf, i);
    expect(buf).toHaveLength(5000);
    expect(buf[0]).toBe(3);
    expect(pushRing([1, 2], 3, 2)).toEqual([2, 3]);
  });
});
