import type { TelemetryEvent } from './events';

export interface KpiReport {
  sessions: number;
  k1a: (number | null)[];
  k1b: (number | null)[];
  k2: { sessions: number; spontaneous: number; share: number };
  k3MedianMs: number | null;
  k4: Record<string, { runs: number; wins: number; winRate: number; meanAttempts: number }>;
  k5: { carePerDay: number; careUnused: Record<number, number> };
  k6: { previewUse: number; undoPerRun: number };
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * One list per tester: events carrying `tid` group by it (a reload starts a new `sid` but is the same tester);
 * older exports without `tid` fall back to `sid`. `t` restarts per page load, so each `sid` is sorted on its own
 * and page loads are concatenated in the order they first appear in the export (the ring buffer is chronological).
 */
function bySession(events: readonly TelemetryEvent[]): Map<string, TelemetryEvent[]> {
  const loads = new Map<string, TelemetryEvent[]>();
  const tester = new Map<string, string>();
  for (const e of events) {
    const list = loads.get(e.sid);
    if (list) list.push(e);
    else loads.set(e.sid, [e]);
    if (e.tid && !tester.has(e.sid)) tester.set(e.sid, e.tid);
  }
  const m = new Map<string, TelemetryEvent[]>();
  for (const [sid, list] of loads) {
    list.sort((a, b) => a.t - b.t);
    const key = tester.get(sid) ?? sid;
    const acc = m.get(key);
    if (acc) acc.push(...list);
    else m.set(key, list);
  }
  return m;
}

/**
 * K1 for one commission: first special's msSinceFirstInput in the first-attempt run.
 * `undefined` = the session never started that run (excluded); `null` = started but no special.
 */
function firstSpecial(list: readonly TelemetryEvent[], commissionId: string): number | null | undefined {
  const start = list.findIndex((e) => e.e === 'run_start' && e.commissionId === commissionId && e.attempt === 0);
  if (start < 0) return undefined;
  for (let i = start + 1; i < list.length; i++) {
    const e = list[i]!;
    if (e.e === 'run_end') return null;
    if (e.e === 'special_created') return e.msSinceFirstInput;
  }
  return null;
}

/** 02 §13.3 */
export function computeKpis(events: readonly TelemetryEvent[]): KpiReport {
  const sessions = bySession(events);
  const k1a: (number | null)[] = [];
  const k1b: (number | null)[] = [];
  let spontaneous = 0;
  let reachedC02 = 0;
  const waits: number[] = [];
  const k4: KpiReport['k4'] = {};
  let careTotal = 0;
  let days = 0;
  const careUnused: Record<number, number> = {};
  let moves = 0;
  let previewed = 0;
  let undos = 0;
  let runs = 0;
  for (const list of sessions.values()) {
    const a = firstSpecial(list, 'T1');
    const b = firstSpecial(list, 'C01');
    if (a !== undefined) k1a.push(a);
    if (b !== undefined) k1b.push(b);
    const c02 = list.findIndex((e) => e.e === 'run_start' && e.commissionId === 'C02');
    if (c02 >= 0) {
      reachedC02++;
      if (list.slice(0, c02).some((e) => e.e === 'care' && !e.prompted)) spontaneous++;
    }
    let hubSince: number | null = null;
    const attempts: Record<string, number> = {};
    const maxDay = new Set<number>();
    for (const e of list) {
      if (e.e === 'session_start' || e.e === 'run_end' || e.e === 'sleep') hubSince = e.t;
      if (e.e === 'run_start') {
        if (hubSince !== null) waits.push(e.t - hubSince);
        hubSince = null;
        runs++;
        maxDay.add(e.day);
      }
      if (e.e === 'run_end') {
        const r = (k4[e.commissionId] ??= { runs: 0, wins: 0, winRate: 0, meanAttempts: 0 });
        r.runs++;
        attempts[e.commissionId] = (attempts[e.commissionId] ?? 0) + 1;
        if (e.result === 'won') {
          r.wins++;
          r.meanAttempts += attempts[e.commissionId]!;
        }
      }
      if (e.e === 'care') {
        careTotal++;
        maxDay.add(e.day);
      }
      if (e.e === 'sleep') careUnused[e.careUnused] = (careUnused[e.careUnused] ?? 0) + 1;
      if (e.e === 'move') {
        moves++;
        if (e.previewMs > 300) previewed++;
      }
      if (e.e === 'undo') undos++;
    }
    days += maxDay.size;
  }
  for (const r of Object.values(k4)) {
    r.winRate = r.runs ? r.wins / r.runs : 0;
    r.meanAttempts = r.wins ? r.meanAttempts / r.wins : 0;
  }
  return {
    sessions: sessions.size,
    k1a,
    k1b,
    k2: { sessions: reachedC02, spontaneous, share: reachedC02 ? spontaneous / reachedC02 : 0 },
    k3MedianMs: median(waits),
    k4,
    k5: { carePerDay: days ? careTotal / days : 0, careUnused },
    k6: { previewUse: moves ? previewed / moves : 0, undoPerRun: runs ? undos / runs : 0 },
  };
}

const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const within = (xs: (number | null)[], ms: number) => {
  const got = xs.filter((x): x is number => x !== null);
  return xs.length ? got.filter((x) => x <= ms).length / xs.length : 0;
};

const unusedDist = (d: Record<number, number>) => {
  const rows = Object.entries(d).sort(([a], [b]) => Number(a) - Number(b));
  return rows.length ? rows.map(([k, n]) => `${k}→${n}`).join('，') : '—';
};

export function kpiMarkdown(r: KpiReport): string {
  const lines = [
    '# KPI 报告',
    '',
    `会话数：${r.sessions}`,
    '',
    '| KPI | 值 |',
    '|---|---|',
    `| K1a（T1 首个特效 ≤ 90 秒的会话占比） | ${pct(within(r.k1a, 90_000))} |`,
    `| K1b（C01 首次尝试首个特效 ≤ 90 秒） | ${pct(within(r.k1b, 90_000))} |`,
    `| K2（C02 前自发照料） | ${pct(r.k2.share)}（${r.k2.spontaneous}/${r.k2.sessions}） |`,
    `| K3（露台停留中位数） | ${r.k3MedianMs === null ? '—' : `${(r.k3MedianMs / 1000).toFixed(1)} 秒`} |`,
    `| K5（每天照料次数） | ${r.k5.carePerDay.toFixed(2)} |`,
    `| K5（入夜未用照料点：点数→次数） | ${unusedDist(r.k5.careUnused)} |`,
    `| K6（预演使用率 / 每局回退） | ${pct(r.k6.previewUse)} / ${r.k6.undoPerRun.toFixed(2)} |`,
    '',
    '## K4 委托胜率',
    '',
    '| 委托 | 局数 | 胜率 | 平均尝试 |',
    '|---|---|---|---|',
    ...Object.entries(r.k4)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => `| ${id} | ${v.runs} | ${pct(v.winRate)} | ${v.wins ? v.meanAttempts.toFixed(2) : '—'} |`),
  ];
  return lines.join('\n') + '\n';
}
