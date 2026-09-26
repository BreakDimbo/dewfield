import { invariant } from '@/core/util/invariant';
import type { BoardEvent, Via } from './events';
import { N, W, isCrop, isSpecial, posOf, type CropSpecial, type Tile } from './model';
import { colCells, cropCells, kindOf, ring, rowCells, square, type Activation, type Grid } from './specials';

/** Everything a step-0 needs before the shared harvest pipeline runs. */
export interface Step0Plan {
  inH: boolean[];
  triggers: number[];
  activated: number[];
  pre: Activation[];
  pollinated: boolean[];
  ring: boolean[];
  via: Via;
  convert: BoardEvent | null;
  isCombo: boolean;
}

const mask = (cells: readonly number[]): boolean[] => {
  const m = new Array<boolean>(N).fill(false);
  for (const c of cells) m[c] = true;
  return m;
};
const uniqSorted = (cells: readonly number[]): number[] => [...new Set(cells)].sort((x, y) => x - y);

function specialsIn(g: Grid, inH: readonly boolean[], except: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < N; i++) if (inH[i] && isSpecial(g[i]) && !except.includes(i)) out.push(i);
  return out;
}

/**
 * 02 §3.5 combo table. `a`, `b` are post-swap indices; the combo is centred on b.
 * Converts tiles in `g` in place for bee + sickle / bee + dew orb.
 */
export function planCombo(g: Grid, a: number, b: number): Step0Plan {
  const ka = kindOf(g[a]);
  const kb = kindOf(g[b]);
  invariant(ka && kb, 'planCombo needs two specials');
  const bx = b % W;
  const by = Math.floor(b / W);
  const pair = new Set([ka.startsWith('sickle') ? 'sickle' : ka, kb.startsWith('sickle') ? 'sickle' : kb]);
  let area: number[] = [];
  let ringCells: number[] = [];
  let pollinated: number[] = [];
  let triggers: number[] | null = null;
  let convert: BoardEvent | null = null;

  if (pair.has('bee')) {
    const other = ka === 'bee' ? b : a;
    const otherKind = kindOf(g[other]);
    if (otherKind === 'bee') {
      area = Array.from({ length: N }, (_, i) => i);
      pollinated = area.filter((i) => isCrop(g[i]));
    } else {
      const src = g[other];
      invariant(isCrop(src), 'bee combo partner must be a crop special');
      const conv: { pos: ReturnType<typeof posOf>; uid: number; kind: CropSpecial }[] = [];
      for (const i of cropCells(g, src.crop)) {
        const t = g[i]!;
        if (!isCrop(t) || t.special !== null) continue;
        const parity = ((i % W) + Math.floor(i / W)) % 2;
        const kind: CropSpecial = otherKind === 'dewOrb' ? 'dewOrb' : parity === 0 ? 'sickleH' : 'sickleV';
        g[i] = { ...t, special: kind };
        conv.push({ pos: posOf(i), uid: t.uid, kind });
      }
      if (conv.length > 0) convert = { t: 'convert', items: conv, cause: 'bee' };
      const matchKind = (k: string | null) => (otherKind === 'dewOrb' ? k === 'dewOrb' : !!k && k.startsWith('sickle'));
      triggers = cropCells(g, src.crop).filter((i) => matchKind(kindOf(g[i])));
      area = triggers.slice();
    }
  } else if (pair.size === 1 && pair.has('sickle')) {
    area = uniqSorted([...rowCells(by), ...colCells(bx)]);
  } else if (pair.has('sickle')) {
    const rows = [by - 1, by, by + 1].filter((y) => y >= 0 && y < 7).flatMap(rowCells);
    const cols = [bx - 1, bx, bx + 1].filter((x) => x >= 0 && x < W).flatMap(colCells);
    area = uniqSorted([...rows, ...cols]);
  } else {
    area = square(bx, by, 2);
    ringCells = ring(bx, by, 3);
  }

  const beeCells = [a, b].filter((i) => kindOf(g[i]) === 'bee');
  const consumed = triggers ? beeCells : [a, b];
  const inH = mask([...area, a, b]);
  const pre: Activation[] = [b, a].map((i) => ({
    i,
    uid: g[i]!.uid,
    kind: kindOf(g[i])!,
    via: 'combo',
    area,
    level: 0,
  }));
  return {
    inH,
    triggers: triggers ?? specialsIn(g, inH, [a, b]),
    activated: consumed,
    pre: triggers ? pre.filter((p) => p.kind === 'bee') : pre,
    pollinated: mask(pollinated),
    ring: mask(ringCells),
    via: triggers ? 'combo' : 'chain',
    convert,
    isCombo: true,
  };
}

/** 02 §3.3: bee swapped with a plain crop (post-swap indices). */
export function planBeeSwap(g: Grid, a: number, b: number): Step0Plan {
  const bee = kindOf(g[a]) === 'bee' ? a : b;
  const other = bee === a ? b : a;
  const t = g[other] as Tile;
  invariant(isCrop(t), 'bee swap partner must be a crop');
  const p = cropCells(g, t.crop);
  const inH = mask([...p, bee]);
  return {
    inH,
    triggers: p.filter((i) => isSpecial(g[i])),
    activated: [bee],
    pre: [{ i: bee, uid: g[bee]!.uid, kind: 'bee', via: 'swap', area: p, level: 0 }],
    pollinated: mask(p),
    ring: new Array<boolean>(N).fill(false),
    via: 'chain',
    convert: null,
    isCombo: false,
  };
}
