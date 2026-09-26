import { readFileSync } from 'node:fs';
import type { TelemetryEvent } from '../../src/core/telemetry/events';
import { computeKpis, kpiMarkdown } from '../../src/core/telemetry/kpi';

/** `pnpm kpi <export.json…>` → Markdown K1–K6 report on stdout (01 §16.2). */
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  console.error('usage: pnpm kpi <telemetry-export.json> [...]');
  process.exit(1);
}
const events = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as TelemetryEvent[]);
process.stdout.write(kpiMarkdown(computeKpis(events)));
