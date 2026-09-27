import { beforeEach, describe, expect, it } from 'vitest';
import { parseBoard } from '@/core/board/ascii';
import type { Board, Move } from '@/core/board/model';
import { countValidMoves } from '@/core/board/moves';
import type { TipId } from '@/core/config/tips';
import { createRun } from '@/core/run/run';
import { checker } from '@/core/testkit/checker';
import { mv, sandboxCommission } from '@/core/testkit/runs';
import { MemoryAdapter } from '@/platform/storage';
import { useAppStore } from '@/state/appStore';
import { bus } from '@/state/bus';
import { gameCfg } from '@/state/config';
import { persistence } from '@/state/persistence';
import { usePresentationStore } from '@/state/presentationStore';
import { useRunStore } from '@/state/runStore';
import { telemetry } from '@/state/telemetryLogger';
import { useUiStore } from '@/state/uiStore';
import { gameController } from './gameController';
import { runController } from './runController';
import { dismissTip } from './tips';

/** 04 P2-15 #2: every 02 §16.5 tip fires at its moment, once per save (controller integration). */

beforeEach(() => {
  persistence.use(new MemoryAdapter(), 'test');
  telemetry.reset();
  useAppStore.setState({ app: 'boot', home: null, settlement: null, notices: [] });
  useRunStore.setState({ run: null, phase: 'ended', paused: false, selected: null, preview: null, guide: null });
  useUiStore.setState({ tips: [], careMode: 'none', guideRow: null, panel: 'none', briefReadOnly: false });
  // No choreographer: each scripted move stays "resolving" until the next one is installed.
  bus.clear();
  gameController.boot();
  gameController.newGame(8);
});

const shown = (id: TipId) => telemetry.all().filter((e) => e.e === 'tip_shown' && e.tip === id).length;
const queued = (id: TipId) => useUiStore.getState().tips.filter((t) => t.id === id).length;

/** Put a scripted run on the board (free input, idle) and commit one move through the controller. */
function commitOn(board: Board, move: Move, opts: { count?: number; moves?: number; queue?: string } = {}): void {
  const run = createRun(
    {
      commission: sandboxCommission([{ crop: 'carrot', count: opts.count ?? 99 }], opts.moves ?? 20),
      board,
      seed: 3,
      uidCounter: 100,
      spawnQueue: opts.queue ? opts.queue.split(' ') : [],
    },
    gameCfg(),
  );
  useRunStore.setState({ run, phase: 'idle', paused: false, selected: null, preview: null, guide: null });
  usePresentationStore.setState({ busy: false });
  runController.commit(move);
  expect(useRunStore.getState().phase).toBe('resolving');
}

/**
 * The (x + 2y) % 5 sprout pattern has no valid move (see generate.test). Row 0/1 are edited so that one vertical
 * swap at x = 2 makes an E triple on row 0; the queue refills exactly the pattern, leaving the board stuck.
 */
function stuckAfterMove(): Board {
  const P = (x: number, y: number) => ['C0', 'T0', 'M0', 'E0', 'B0'][(x + 2 * y) % 5]!;
  const rows = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => P(x, y)));
  rows[0]![1] = 'E2';
  rows[0]![3] = 'E2';
  rows[0]![2] = P(2, 1);
  rows[1]![2] = 'E2';
  return parseBoard(rows.map((r) => r.join(' ')).join('\n')).board;
}

const SCRIPTED: { tip: TipId; board: () => Board; move: Move; opts?: Parameters<typeof commitOn>[2] }[] = [
  // Three sprouts matched: harvested, but they do not count (02 §2.2).
  { tip: 'sproutHarvest', board: () => checker({ '0,6': 'C0', '1,6': 'C0', '2,5': 'C0' }), move: mv(2, 5, 2, 6) },
  // A ripe triple next to the sprout background: neighbours grow.
  { tip: 'neighborRipen', board: () => checker({ '0,6': 'C2', '1,6': 'C2', '2,5': 'C2' }), move: mv(2, 5, 2, 6) },
  // An L made by the swap.
  { tip: 'dewOrb', board: () => checker({ '4,0': 'E1', '4,1': 'E1', '4,3': 'E1', '5,2': 'E1', '6,2': 'E1' }), move: mv(4, 3, 4, 2) },
  // A line of five.
  { tip: 'bee', board: () => checker({ '0,3': 'C2', '1,3': 'C2', '2,2': 'C2', '3,3': 'C2', '4,3': 'C2' }), move: mv(2, 2, 2, 3) },
  // Two specials left touching after the move.
  { tip: 'combo', board: () => checker({ '0,0': 'B0h', '1,0': 'E1v', '4,6': 'C2', '5,6': 'C2', '6,5': 'C2' }), move: mv(6, 5, 6, 6) },
  { tip: 'shuffle', board: stuckAfterMove, move: mv(2, 1, 2, 0), opts: { queue: 'T0 M0 E0' } },
  // The order completes with moves left: harvest rush.
  { tip: 'rush', board: () => checker({ '0,6': 'C2', '1,6': 'C2', '2,5': 'C2' }), move: mv(2, 5, 2, 6), opts: { count: 3, moves: 8 } },
];

describe('contextual tips from scripted boards (P2-15, 02 §16.5)', () => {
  it('the shuffle scenario really is stuck after its move', () => {
    const P = (x: number, y: number) => ['C0', 'T0', 'M0', 'E0', 'B0'][(x + 2 * y) % 5]!;
    const pattern = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => P(x, y)).join(' ')).join('\n');
    expect(countValidMoves(parseBoard(pattern).board.cells)).toBe(0);
    expect(countValidMoves(stuckAfterMove().cells)).toBeGreaterThan(0);
  });

  it.each(SCRIPTED)('$tip: shown on its first trigger, never again in the same save', ({ tip, board, move, opts }) => {
    expect(shown(tip)).toBe(0);
    commitOn(board(), move, opts);
    expect(shown(tip)).toBe(1);
    expect(queued(tip)).toBe(1);
    expect(useAppStore.getState().home!.tutorial.seenTips).toContain(tip);
    commitOn(board(), move, opts);
    expect(shown(tip)).toBe(1);
    expect(queued(tip)).toBe(1);
  });

  it('seen tips survive a reload: a restored save does not show them again', () => {
    const { board, move } = SCRIPTED.find((s) => s.tip === 'dewOrb')!;
    commitOn(board(), move);
    persistence.save(useAppStore.getState().home!);
    useAppStore.setState({ app: 'title', home: null });
    useUiStore.setState({ tips: [] });
    expect(gameController.continueGame()).toBe(true);
    commitOn(board(), move);
    expect(shown('dewOrb')).toBe(1);
    expect(queued('dewOrb')).toBe(0);
  });
});

describe('contextual tips from hub beats (P2-15, 02 §16.5)', () => {
  /** Skip day 1: a fresh save past the tutorial, with enough dewdrops for the shop. */
  function pastTutorial(dewdrop: number): void {
    const home = useAppStore.getState().home!;
    useAppStore.setState({
      app: 'hub',
      home: { ...home, wallet: { dewdrop }, tutorial: { ...home.tutorial, done: true, completedSteps: ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'] } },
    });
    useRunStore.setState({ run: null, phase: 'ended' });
  }

  it('sleep follows the shop tip once it is dismissed, once', () => {
    useUiStore.setState({ tips: [{ id: 'shop', text: '' }] });
    dismissTip();
    expect(shown('sleep')).toBe(1);
    useUiStore.setState((st) => ({ tips: [{ id: 'shop', text: '' }, ...st.tips] }));
    dismissTip();
    expect(shown('sleep')).toBe(1);
    expect(queued('sleep')).toBe(1);
  });

  it('levelUp on each terrace level-up purchase, shown only the first time', () => {
    pastTutorial(100_000);
    const [a, b] = gameCfg().terrace.levelThresholds;
    const order = ['windChime', 'planters', 'awning', 'beehive', 'bench', 'irrigation'] as const;
    for (let k = 0; k < b; k++) {
      expect(gameController.purchase(order[k]!)).toBe(true);
      expect(shown('levelUp')).toBe(k + 1 >= a ? 1 : 0);
    }
    expect(queued('levelUp')).toBe(1);
  });

  it('bee: releasing bees on the field shows it too, and only once', () => {
    pastTutorial(100_000);
    expect(gameController.purchase('beehive')).toBe(true);
    expect(gameController.placeBee({ x: 3, y: 3 })).toBe(true);
    expect(shown('bee')).toBe(1);
    const { board, move } = SCRIPTED.find((s) => s.tip === 'bee')!;
    commitOn(board(), move);
    expect(shown('bee')).toBe(1);
    expect(queued('bee')).toBe(1);
  });
});
