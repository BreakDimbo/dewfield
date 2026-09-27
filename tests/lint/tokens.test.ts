import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** P2-17 #2: every UI colour comes from ui/tokens.css — no stray hex / rgb literals elsewhere. */
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(css|tsx)$/.test(f) && !f.includes('.test.') ? [p] : [];
  });

describe('design tokens only', () => {
  it('src/ui and src/debug use no raw colour literals outside tokens.css', () => {
    const offenders: string[] = [];
    for (const f of [...walk('src/ui'), ...walk('src/debug')]) {
      if (f.endsWith('tokens.css')) continue;
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('the display font subset is present and within budget', () => {
    const size = statSync('src/ui/fonts/wenkai-subset.woff2').size;
    expect(size).toBeGreaterThan(20_000);
    expect(size).toBeLessThanOrEqual(150 * 1024);
  });
});
