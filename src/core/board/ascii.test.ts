import { describe, expect, it } from 'vitest';
import { boardFromField, fieldFromBoard, parseBoard, parseToken, printBoard, printToken } from './ascii';
import { hashBoard, makeBoard, type Tile } from './model';

const SAMPLE = `
T1 E0 B1 M2 T0 C2 E1
B0 C2 C0 C1 E1 **  M2
M1 T0 E2 B0 M0 T2h B1
C2v B2d E0 M1 T1 C0 B2
E2 E2 T1 B0 C1 M0 T0
B1 M2 C2 E1 T2 B0 M1
T0 C1 M2 B2 E0 T1 C2
`;

describe('core/board ascii (02 §1.10)', () => {
  it('parses every token kind', () => {
    expect(parseToken('C2')).toEqual({ kind: 'crop', crop: 'carrot', stage: 2, special: null });
    expect(parseToken('T0h')).toEqual({ kind: 'crop', crop: 'tomato', stage: 0, special: 'sickleH' });
    expect(parseToken('M1v')).toEqual({ kind: 'crop', crop: 'corn', stage: 1, special: 'sickleV' });
    expect(parseToken('B2d')).toEqual({ kind: 'crop', crop: 'blueberry', stage: 2, special: 'dewOrb' });
    expect(parseToken('E1')?.kind).toBe('crop');
    expect(parseToken('**')).toEqual({ kind: 'bee' });
    for (const bad of ['X1', 'C3', 'C2x', 'c2', '*', 'C', '']) expect(parseToken(bad)).toBeNull();
  });

  it('round-trips normalized strings', () => {
    const { board } = parseBoard(SAMPLE);
    const printed = printBoard(board);
    expect(printBoard(parseBoard(printed).board)).toBe(printed);
    expect(printed.split('\n')[1]).toBe('B0 C2 C0 C1 E1 ** M2');
    for (const tok of ['C2', 'T0h', 'M1v', 'B2d', '**']) expect(printToken(parseToken(tok)!)).toBe(tok);
  });

  it('assigns uids row-major from uidStart', () => {
    const { board, nextUid } = parseBoard(SAMPLE, 100);
    expect(board.cells[0]!.uid).toBe(100);
    expect(board.cells[48]!.uid).toBe(148);
    expect(nextUid).toBe(149);
    expect(board.cells[12]).toEqual({ uid: 112, kind: 'bee' });
  });

  it('reports row and column for bad input', () => {
    expect(() => parseBoard(SAMPLE.replace('E0 M1 T1', 'E0 Q1 T1'))).toThrow(/row 4, col 4/);
    expect(() => parseBoard(SAMPLE.replace('T0 C1 M2 B2 E0 T1 C2', 'T0 C1'))).toThrow(/row 7: expected 7 tokens/);
    expect(() => parseBoard('C2 C2')).toThrow(/expected 7 rows/);
  });

  it('hashBoard is stable and sensitive to any cell change', () => {
    const { board } = parseBoard(SAMPLE);
    expect(hashBoard(board)).toBe(hashBoard(parseBoard(SAMPLE).board));
    const changed = board.cells.map((t, i) => (i === 30 && t.kind === 'crop' ? { ...t, stage: 2 as const } : t));
    expect(hashBoard(makeBoard(changed))).not.toBe(hashBoard(board));
    const uidChanged = board.cells.map((t, i): Tile => (i === 0 ? { ...t, uid: 999 } : t));
    expect(hashBoard(makeBoard(uidChanged))).not.toBe(hashBoard(board));
  });

  it('field state round-trips with explicit uids', () => {
    const { board } = parseBoard(SAMPLE, 7);
    const field = fieldFromBoard(board);
    expect(field.rows).toHaveLength(7);
    expect(boardFromField(field.rows, field.uids)).toEqual(board);
    expect(() => boardFromField(field.rows, field.uids.slice(1))).toThrow();
  });

  it('makeBoard rejects wrong sizes', () => {
    expect(() => makeBoard([])).toThrow();
  });
});
