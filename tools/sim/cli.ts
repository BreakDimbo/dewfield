import { writeFileSync } from 'node:fs';
import { DEFAULT_TUNABLES, VS_TUNABLES } from '../../src/core/config/tunables';
import type { BotId } from './bots';
import type { CarePolicy } from './policies';
import { boardTable, campaignTable } from './report';
import { simulateCampaign, simulateSingle } from './sim';

/** 02 §15 — `pnpm sim --mode single --bot greedy --commission C01 --runs 500 --seed 1 [--care waterOrdered] [--vs] [--out f.json]` */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--') ? process.argv[i + 1]! : fallback;
}
const cfg = process.argv.includes('--vs') ? VS_TUNABLES : DEFAULT_TUNABLES;
const mode = arg('mode', 'single');
const seed = Number(arg('seed', '1'));
const runs = Number(arg('runs', '200'));
const bot = arg('bot', 'greedy') as BotId;
const care = arg('care', 'none') as CarePolicy;
const out = arg('out', '');
const t0 = performance.now();
let json: unknown;
let md: string;
if (mode === 'campaign') {
  const c = simulateCampaign({ runs, seed, bot, care, extra: Number(arg('extra', '0')) }, cfg);
  json = c;
  md = `## campaign · ${bot} · care=${care} · ${runs} 局 · seed ${seed}\n\n${campaignTable(c)}\n\n### 棋盘指标\n\n${boardTable(c.board)}\n`;
} else {
  const stages = arg('fieldStages', '0.3,0.4,0.3').split(',').map(Number) as [number, number, number];
  const commission = arg('commission', 'C01');
  const s = simulateSingle({ commission, runs, seed, bot, care, fieldStages: stages }, cfg);
  json = s;
  md = `## single · ${commission} · ${bot} · care=${care} · ${runs} 局 · seed ${seed}\n\n${boardTable(s)}\n`;
}
if (out) writeFileSync(out, JSON.stringify(json, null, 2));
process.stdout.write(md);
process.stderr.write(`(${((performance.now() - t0) / 1000).toFixed(1)} s)\n`);
