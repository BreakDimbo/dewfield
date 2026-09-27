import { BoxGeometry, Texture } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardEvent } from '@/core/board/events';
import { VS_TUNABLES } from '@/core/config/tunables';
import { t1Run } from '@/core/testkit/runs';
import { bus } from '@/state/bus';
import { runController } from '@/state/controllers/runController';
import { usePresentationStore } from '@/state/presentationStore';
import { useUiStore } from '@/state/uiStore';
import type { TilePool } from '@/render/field/TilePool';
import type { VfxSystem } from '@/render/vfx/VfxSystem';

// Canvas-drawn textures need a DOM; timeline bookkeeping does not.
vi.mock('@/render/assets/greybox', () => ({
  bandTexture: () => new Texture(),
  glowTexture: () => new Texture(),
  sparkTexture: () => new Texture(),
  beeGeometry: () => new BoxGeometry(),
}));
const { Choreographer } = await import('./Choreographer');

const noop = () => {};
const pool = {
  acquire: noop,
  release: noop,
  setCell: noop,
  setPop: noop,
  setGlow: noop,
  setStage: noop,
  setSpecial: noop,
  setCrop: noop,
  snap: noop,
  snapshot: () => [],
  mismatches: () => 0,
} as unknown as TilePool;
const vfx = new Proxy({}, { get: () => noop }) as unknown as VfxSystem;

const anim = VS_TUNABLES.anim;
const run = t1Run(VS_TUNABLES);
/** One rejected swap: a single timeline of exactly `anim.swapRejected` ms. */
const reject: BoardEvent[] = [{ t: 'swapRejected', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }];
const D = anim.swapRejected;

let rm = false;
let done: ReturnType<typeof vi.spyOn>;
let choreo: InstanceType<typeof Choreographer>;

beforeEach(() => {
  bus.clear();
  rm = false;
  usePresentationStore.setState({ timeScale: 1 });
  useUiStore.setState({ rush: false });
  done = vi.spyOn(runController, 'timelineDone').mockImplementation(noop);
  choreo = new Choreographer(pool, vfx, () => VS_TUNABLES, () => rm);
});
afterEach(() => {
  choreo.dispose();
  done.mockRestore();
});

/** Real ms of ticking needed before the timeline reports done. */
function realMsToFinish(): number {
  bus.emit('boardEvents', { events: reject, run, kind: 'reject' });
  let ms = 0;
  while (choreo.busy && ms < 10_000) {
    choreo.tick(1);
    ms++;
  }
  return ms;
}

describe('Choreographer time scale (P1-14, 03 §9.4)', () => {
  it('plays at 1× by default', () => {
    expect(realMsToFinish()).toBeCloseTo(D, -1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['fast-forward', () => usePresentationStore.setState({ timeScale: anim.fastForwardScale }), anim.fastForwardScale],
    ['rush', () => useUiStore.setState({ rush: true }), anim.rushTimeScale],
    ['reduced motion', () => (rm = true), anim.reducedMotionScale],
    [
      'all three multiply',
      () => {
        rm = true;
        useUiStore.setState({ rush: true });
        usePresentationStore.setState({ timeScale: anim.fastForwardScale });
      },
      anim.reducedMotionScale * anim.rushTimeScale * anim.fastForwardScale,
    ],
  ])('%s scales the clock (base × rush × timeScale)', (_n, setup, scale) => {
    setup();
    const ms = realMsToFinish();
    expect(Math.abs(ms - D / scale)).toBeLessThanOrEqual(1.01);
  });

  it('skip() finishes every queued timeline in order, reporting each', () => {
    bus.emit('boardEvents', { events: reject, run, kind: 'reject' });
    bus.emit('boardEvents', { events: reject, run, kind: 'reject' });
    choreo.tick(1);
    expect(choreo.busy).toBe(true);
    choreo.skip();
    expect(choreo.busy).toBe(false);
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('boardSnap drops anything queued without reporting it', () => {
    bus.emit('boardEvents', { events: reject, run, kind: 'reject' });
    bus.emit('boardSnap', { run });
    expect(choreo.busy).toBe(false);
    choreo.tick(D * 2);
    expect(done).not.toHaveBeenCalled();
  });
});
