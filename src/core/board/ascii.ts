import { CROP_BY_ASCII, CROP_BY_ID, type CropId } from '@/core/config/crops';
import { H, makeBoard, W, type Board, type CropSpecial, type Stage, type Tile } from './model';

export type TokenSpec = { kind: 'crop'; crop: CropId; stage: Stage; special: CropSpecial | null } | { kind: 'bee' };

const SUFFIX: Record<string, CropSpecial> = { h: 'sickleH', v: 'sickleV', d: 'dewOrb' };
const SUFFIX_OF: Record<CropSpecial, string> = { sickleH: 'h', sickleV: 'v', dewOrb: 'd' };
const TOKEN_RE = /^([CTMEB])([012])([hvd]?)$/;

export function parseToken(tok: string): TokenSpec | null {
  if (tok === '**') return { kind: 'bee' };
  const m = TOKEN_RE.exec(tok);
  if (!m) return null;
  return {
    kind: 'crop',
    crop: CROP_BY_ASCII[m[1]!]!.id,
    stage: Number(m[2]) as Stage,
    special: m[3] ? SUFFIX[m[3]]! : null,
  };
}

export function printToken(t: TokenSpec | Tile): string {
  if (t.kind === 'bee') return '**';
  return `${CROP_BY_ID[t.crop].ascii}${t.stage}${t.special ? SUFFIX_OF[t.special] : ''}`;
}

export function tileFromToken(tok: string, uid: number): Tile {
  const spec = parseToken(tok);
  if (!spec) throw new Error(`bad token "${tok}"`);
  return spec.kind === 'bee' ? { uid, kind: 'bee' } : { uid, ...spec };
}

/** 02 §1.10. uids are assigned row-major from `uidStart`. */
export function parseBoard(ascii: string, uidStart = 1): { board: Board; nextUid: number } {
  const rows = ascii
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  if (rows.length !== H) throw new Error(`expected ${H} rows, got ${rows.length}`);
  const cells: Tile[] = [];
  let uid = uidStart;
  rows.forEach((row, y) => {
    const toks = row.split(/\s+/);
    if (toks.length !== W) throw new Error(`row ${y + 1}: expected ${W} tokens, got ${toks.length}`);
    toks.forEach((tok, x) => {
      const spec = parseToken(tok);
      if (!spec) throw new Error(`row ${y + 1}, col ${x + 1}: bad token "${tok}"`);
      cells.push(spec.kind === 'bee' ? { uid: uid++, kind: 'bee' } : { uid: uid++, ...spec });
    });
  });
  return { board: makeBoard(cells), nextUid: uid };
}

export function printRows(board: Board): string[] {
  const rows: string[] = [];
  for (let y = 0; y < H; y++) rows.push(board.cells.slice(y * W, y * W + W).map(printToken).join(' '));
  return rows;
}

export function printBoard(board: Board): string {
  return printRows(board).join('\n');
}

/** Rebuild a board from persisted rows + uids (02 §12.2 FieldState). */
export function boardFromField(rows: readonly string[], uids: readonly number[]): Board {
  const { board } = parseBoard(rows.join('\n'));
  if (uids.length !== board.cells.length) throw new Error('uid count mismatch');
  return makeBoard(board.cells.map((t, i) => ({ ...t, uid: uids[i]! })));
}

export function fieldFromBoard(board: Board): { rows: string[]; uids: number[] } {
  return { rows: printRows(board), uids: board.cells.map((t) => t.uid) };
}
