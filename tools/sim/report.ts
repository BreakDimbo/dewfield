import type { BoardSummary } from './metrics';
import type { simulateCampaign } from './sim';

const f2 = (x: number) => x.toFixed(2);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** 02 §15.1 thresholds (target / CI guard). */
export const TARGETS = {
  avgValidMoves: [5, 4.5],
  lowValidShare: [0.1, 0.15],
  shufflesPer25: [1, 1.5],
  specialsPerMove: [0.18, 0.15],
  specialWithin10: [0.9, 0.85],
  avgDepth: [1.3, 1.2],
  deepShare: [0.1, 0.08],
} as const;

export function boardTable(s: BoardSummary): string {
  const row = (name: string, v: string, t: string, g: string) => `| ${name} | ${v} | ${t} | ${g} |`;
  return [
    '| 指标 | 结果 | 目标 | 守卫 |',
    '|---|---|---|---|',
    row('静止盘平均可行步', f2(s.avgValidMoves), '≥ 5', '≥ 4.5'),
    row('可行步 ≤ 2 的比例', pct(s.lowValidShare), '≤ 10%', '≤ 15%'),
    row('每 25 手洗牌', f2(s.shufflesPer25), '≤ 1', '≤ 1.5'),
    row('每手生成特效', f2(s.specialsPerMove), '≥ 0.18', '≥ 0.15'),
    row('前 10 手内出特效', pct(s.specialWithin10), '≥ 90%', '≥ 85%'),
    row('每手平均级联深度', f2(s.avgDepth), '≥ 1.3', '≥ 1.2'),
    row('级联深度 ≥ 3 的手', pct(s.deepShare), '≥ 10%', '≥ 8%'),
    row('委托胜率', pct(s.winRate), '见 02 §5.7', '—'),
    '',
    `（${s.runs} 局，${s.moves} 手）`,
  ].join('\n');
}

export function campaignTable(c: ReturnType<typeof simulateCampaign>): string {
  const lines = ['| 委托 | 胜率（按尝试） | 平均尝试 | 单场收入中位数 |', '|---|---|---|---|'];
  for (const r of c.rows) {
    const tries = r.income.length;
    lines.push(`| ${r.id} | ${pct(r.wins / Math.max(1, tries))} | ${f2(mean(r.attempts))} | ${median(r.income)} |`);
  }
  lines.push('', '| 装饰 | 购买日（中位数） | 购买时已完成正式委托数（中位数） |', '|---|---|---|');
  for (const [id, days] of Object.entries(c.purchaseDays))
    lines.push(`| ${id} | 第 ${median(days)} 天 | ${median(c.purchaseAfterCommission[id] ?? [])} |`);
  lines.push('', `露台 L2 中位日：${median(c.levelDays[2] ?? [])}；L3 中位日：${median(c.levelDays[3] ?? [])}`);
  lines.push('', '| 天 | 入夜前露珠中位数 |', '|---|---|');
  c.dewByDay.forEach((xs, d) => lines.push(`| ${d + 1} | ${median(xs)} |`));
  return lines.join('\n');
}
