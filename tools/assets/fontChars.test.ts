import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { collectChars, DECORATIVE } from './fontChars.mjs';

/** P2-17 #1: the committed subset covers every character the sources use — CI fails when it goes stale. */
describe('display font subset coverage', () => {
  it('covers every non-ASCII char in fontChars SOURCES (re-run `pnpm assets:font` if this fails)', async () => {
    // woff2 → sfnt via subset-font's own converter (harfbuzz cannot read woff2 directly)
    const req = createRequire(createRequire(import.meta.url).resolve('subset-font'));
    const fontverter = req('fontverter') as { convert(buf: Buffer, to: 'sfnt'): Promise<Buffer> };
    const sfnt = await fontverter.convert(readFileSync('src/ui/fonts/wenkai-subset.woff2'), 'sfnt');
    const hb = (await import('harfbuzzjs')) as unknown as {
      Blob: new (b: Uint8Array) => unknown;
      Face: new (b: unknown, i: number) => { collectUnicodes(): Iterable<number> };
    };
    const have = new Set(new hb.Face(new hb.Blob(sfnt), 0).collectUnicodes());
    const missing = [...collectChars()].filter((ch) => {
      const cp = ch.codePointAt(0)!;
      return cp > 0x7f && !DECORATIVE.includes(ch) && !have.has(cp);
    });
    expect(missing.join('')).toBe('');
  });
});
