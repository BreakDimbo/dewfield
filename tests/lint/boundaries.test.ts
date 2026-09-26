import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function errorsFor(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? 'fatal');
}

describe('layer guards (03 §4)', () => {
  const core = 'src/core/x.ts';

  it.each([
    ['three import', "import 'three';", 'no-restricted-imports'],
    ['react import', "import 'react';", 'no-restricted-imports'],
    ['state import', "import '@/state/appStore';", 'no-restricted-imports'],
    ['Math.random', 'export const r = Math.random();', 'no-restricted-properties'],
    ['Date.now', 'export const t = Date.now();', 'no-restricted-properties'],
    ['new Date', 'export const d = new Date();', 'no-restricted-syntax'],
    ['window', 'export const w = window;', 'no-restricted-globals'],
    ['performance', 'export const p = performance.now();', 'no-restricted-globals'],
  ])('core: %s → exactly one error', async (_name, code, rule) => {
    expect(await errorsFor(core, code)).toEqual([rule]);
  });

  it('core may import zod and itself', async () => {
    expect(await errorsFor(core, "import 'zod';\nimport '@/core/rng/rng';")).toEqual([]);
  });

  it.each([
    ['src/ui/a.tsx', "import 'three';"],
    ['src/ui/a.tsx', "import '@/render/Stage';"],
    ['src/ui/a.tsx', "import '@/audio/AudioDirector';"],
    ['src/render/a.ts', "import '@/ui/tokens';"],
    ['src/render/a.ts', "import '@/audio/AudioDirector';"],
    ['src/state/a.ts', "import '@/render/Stage';"],
    ['src/state/a.ts', "import 'three';"],
    ['src/audio/a.ts', "import '@/ui/strings/zh-CN';"],
    ['src/platform/a.ts', "import '@/state/appStore';"],
    ['src/app/a.ts', "import '@/debug/DebugPanel';"],
    ['tools/sim/a.ts', "import '@/render/Stage';"],
  ])('%s: %s is rejected', async (file, code) => {
    expect(await errorsFor(file, code)).toEqual(['no-restricted-imports']);
  });

  it.each([
    ['src/render/a.ts', "import 'three';\nimport '@/state/appStore';\nimport '@/core/rng/rng';"],
    ['src/ui/a.tsx', "import '@/state/appStore';\nimport '@/core/board/model';"],
    ['src/app/a.ts', "export const load = () => import('@/debug/DebugPanel');"],
  ])('%s: allowed imports pass', async (file, code) => {
    expect(await errorsFor(file, code)).toEqual([]);
  });
});
