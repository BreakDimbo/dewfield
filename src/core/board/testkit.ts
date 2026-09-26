import { parseBoard } from './ascii';
import { idx, type Board } from './model';

/** Test helper: '.' is a bee, which breaks every run, so fixtures stay isolated. */
export function grid(ascii: string, uidStart = 1): Board {
  return parseBoard(ascii.replace(/(^|\s)\.(?=\s|$)/g, '$1**'), uidStart).board;
}

export const at = (x: number, y: number): number => idx({ x, y });
