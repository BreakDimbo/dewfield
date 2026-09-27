import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import subsetFont from 'subset-font';
import { collectChars, DECORATIVE } from './fontChars.mjs';

/**
 * P2-17 / 03 §14: subset the display font (LXGW WenKai, OFL-1.1, see public/fonts/OFL.txt) to exactly the
 * characters used by the UI string table, content configs and the hard-coded state/render strings (fontChars.mjs),
 * as woff2 ≤ 150 KB. Fails on any missing glyph. Written under src/ so Vite hashes it into /assets/.
 * Source TTF is downloaded into .font-cache/ (never committed).
 */
const SRC_URL = 'https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Medium.ttf';
const CACHE = join(process.cwd(), '.font-cache');
const SRC = process.env.FONT_SRC ?? join(CACHE, 'LXGWWenKai-Medium.ttf');
const OUT = join(process.cwd(), 'src/ui/fonts/wenkai-subset.woff2');
const LIMIT = 150 * 1024;

const chars = collectChars();
const text = [...chars].sort().join('');

if (!existsSync(SRC)) {
  mkdirSync(CACHE, { recursive: true });
  const r = await fetch(SRC_URL);
  if (!r.ok) throw new Error(`download failed: ${r.status}`);
  writeFileSync(SRC, Buffer.from(await r.arrayBuffer()));
}
const src = readFileSync(SRC);

const hb = await import('harfbuzzjs');
const face = new hb.Face(new hb.Blob(src), 0);
const have = new Set(face.collectUnicodes());
const decorative = new Set([...DECORATIVE].map((c) => c.codePointAt(0)));
const missing = [...chars].filter((ch) => !have.has(ch.codePointAt(0)) && !decorative.has(ch.codePointAt(0)));
if (missing.length) {
  console.error(`missing glyphs in source font: ${missing.join('')}`);
  process.exit(1);
}

const out = await subsetFont(src, text, { targetFormat: 'woff2' });
writeFileSync(OUT, out);
const kb = (out.length / 1024).toFixed(1);
console.log(`subset: ${chars.size} chars → ${OUT} (${kb} KB)`);
if (out.length > LIMIT) {
  console.error(`subset exceeds ${LIMIT / 1024} KB`);
  process.exit(1);
}
