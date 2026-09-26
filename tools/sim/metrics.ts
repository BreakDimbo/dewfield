import type { BoardEvent } from '../../src/core/board/events';
import { countValidMoves } from '../../src/core/board/moves';
import type { RunState } from '../../src/core/run/state';

/** Per-run accumulator for the 02 §15.1 board metrics. */
export class BoardMetrics {
  moves = 0;
  validSum = 0;
  lowValid = 0;
  shuffles = 0;
  specials = 0;
  depthSum = 0;
  deep = 0;
  runs = 0;
  specialWithin10 = 0;
  wins = 0;

  private firstSpecialAt: number | null = null;

  startRun(): void {
    this.runs++;
    this.firstSpecialAt = null;
  }

  afterMove(run: RunState, events: readonly BoardEvent[]): void {
    this.moves++;
    const v = countValidMoves(run.board.cells);
    this.validSum += v;
    if (v <= 2) this.lowValid++;
    let depth = 0;
    let created = 0;
    let inRush = false;
    for (const e of events) {
      if (e.t === 'rushStart') inRush = true;
      if (inRush) continue;
      if (e.t === 'cascadeStep') depth = Math.max(depth, e.depth);
      if (e.t === 'specialCreated') created++;
      if (e.t === 'shuffle') this.shuffles++;
    }
    this.depthSum += depth;
    if (depth >= 3) this.deep++;
    this.specials += created;
    if (created > 0 && this.firstSpecialAt === null) {
      this.firstSpecialAt = run.moveIndex;
      if (run.moveIndex <= 10) this.specialWithin10++;
    }
  }

  endRun(run: RunState): void {
    if (run.status === 'won') this.wins++;
  }

  summary() {
    const m = Math.max(1, this.moves);
    const r = Math.max(1, this.runs);
    return {
      runs: this.runs,
      moves: this.moves,
      avgValidMoves: this.validSum / m,
      lowValidShare: this.lowValid / m,
      shufflesPer25: (25 * this.shuffles) / m,
      specialsPerMove: this.specials / m,
      specialWithin10: this.specialWithin10 / r,
      avgDepth: this.depthSum / m,
      deepShare: this.deep / m,
      winRate: this.wins / r,
    };
  }
}

export type BoardSummary = ReturnType<BoardMetrics['summary']>;
