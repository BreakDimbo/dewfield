import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-17: the character set the display-font subset must cover — shared by subset-font.mjs (which builds it)
 * and fontChars.test.ts (which checks the committed woff2 is not stale). state/ and render/ are scanned too:
 * notices and choreo banners carry hard-coded strings, and those layers may not import ui/strings (03 §4).
 */
export const SOURCES = ['src/ui', 'src/core/config', 'src/state', 'src/render'];
/** Symbols the source font may lack; the UI falls back to the system stack for them. */
export const DECORATIVE = '✦✿★✓×−';
const EXTRA = '，。！？、：；“”‘’（）《》·…—～' + DECORATIVE;

const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !f.includes('.test.') ? [p] : [];
  });

/** Printable ASCII + every non-ASCII char in SOURCES (relative to `root`) + common punctuation. */
export function collectChars(root = process.cwd()) {
  const chars = new Set();
  for (const f of SOURCES.flatMap((s) => walk(join(root, s))))
    for (const ch of readFileSync(f, 'utf8')) if (ch.codePointAt(0) > 0x7f) chars.add(ch);
  for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
  for (const ch of EXTRA) chars.add(ch);
  return chars;
}
