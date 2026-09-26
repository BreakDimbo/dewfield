import type { Pos, Tile } from '@/core/board/model';
import { remainingOf } from '@/core/commission/order';
import type { Tunables } from '@/core/config/tunables';
import { bus, type BusChannels } from '@/state/bus';
import { gameController } from '@/state/controllers/gameController';
import { runController } from '@/state/controllers/runController';
import { launchFlyer, pulseHud, showBanner, usePresentationStore } from '@/state/presentationStore';
import type { TilePool } from '@/render/field/TilePool';
import type { VfxSystem } from '@/render/vfx/VfxSystem';
import { buildTimeline, type ChoreoAdapters } from './builder';
import type { Timeline } from './timeline';
import { useUiStore } from '@/state/uiStore';

type Payload = BusChannels['boardEvents'];

/** Plays committed event logs on the pool, one at a time, then checks presentation == logic (03 §9.6). */
export class Choreographer {
  private queue: Payload[] = [];
  private current: { tl: Timeline; payload: Payload } | null = null;
  private readonly adapters: ChoreoAdapters;
  private readonly offs: (() => void)[] = [];
  /** HUD deltas coalesced per beat (≤ 1 React commit / 250 ms, TR-2); flushed with the move's end. */
  private pendingHud: ReturnType<typeof usePresentationStore.getState>['hud'] | null = null;
  private pendingPulse: Parameters<typeof pulseHud>[0][] = [];
  private pendingBanner: [string, 'cascade' | 'order' | 'special'] | null = null;
  private lastFlush = 0;
  private clock = 0;

  private flushHud(force = false): void {
    if (!this.pendingHud && !this.pendingPulse.length && !this.pendingBanner) return;
    if (!force && this.clock - this.lastFlush < 350) return;
    this.lastFlush = this.clock;
    const hud = this.pendingHud;
    const pulses = this.pendingPulse;
    this.pendingHud = null;
    this.pendingPulse = [];
    if (hud) usePresentationStore.setState({ hud });
    const last = pulses.at(-1);
    if (last) pulseHud(last);
    if (this.pendingBanner) showBanner(...this.pendingBanner);
    this.pendingBanner = null;
  }

  /** Cell → client px, set by FieldView (needs the live camera). */
  project: ((pos: Pos) => { x: number; y: number } | null) | null = null;

  constructor(
    private readonly pool: TilePool,
    vfx: VfxSystem,
    private readonly cfg: () => Tunables,
    private readonly reducedMotion: () => boolean,
  ) {
    const hud = (f: (h: ReturnType<typeof usePresentationStore.getState>['hud']) => Partial<typeof h>) => {
      const base = this.pendingHud ?? usePresentationStore.getState().hud;
      this.pendingHud = { ...base, ...f(base) };
    };
    this.adapters = {
      tiles: pool,
      vfx,
      hud: {
        moveSpent: () => {
          hud((h) => ({ movesLeft: h.movesLeft - 1 }));
          this.pendingPulse.push('moves');
        },
        delivered: (crop, pos) => {
          hud((h) => ({ delivered: { ...h.delivered, [crop]: (h.delivered[crop] ?? 0) + 1 } }));
          this.pendingPulse.push(crop);
          const p = this.project?.(pos);
          if (p) launchFlyer(crop, p.x, p.y);
        },
        dewdrops: (n) => {
          hud((h) => ({ dewdrops: h.dewdrops + n }));
          this.pendingPulse.push('dew');
        },
        cascade: (depth) => {
          usePresentationStore.setState({ cascadeDepth: depth });
          if (depth >= 2) this.pendingBanner = [`连锁 ×${depth}`, 'cascade'];
        },
        banner: (text, tone) => {
          if (!this.pendingBanner || tone !== 'cascade') this.pendingBanner = [text, tone];
        },
        rush: (on) => {
          useUiStore.setState({ rush: on });
          if (on) bus.emit('cue', { t: 'ui', name: 'rush' });
        },
      },
      sfx: (cue) => bus.emit('cue', cue),
    };
    this.offs.push(
      bus.on('boardEvents', (p) => this.queue.push(p)),
      bus.on('boardSnap', ({ run }) => {
        this.queue = [];
        this.current = null;
        this.pendingHud = null;
        this.pendingPulse = [];
        vfx.clear();
        pool.snap(run?.board ?? null);
      }),
    );
  }

  dispose(): void {
    for (const off of this.offs) off();
  }

  get busy(): boolean {
    return !!this.current || this.queue.length > 0;
  }

  private startNext(): boolean {
    const next = this.queue.shift();
    if (!next) return false;
    const tl = buildTimeline(next.events, this.presented(), this.adapters, this.cfg().anim, {
      remaining: remainingOf(next.run.commission.items, this.presentedDelivered(next)),
      reducedMotion: this.reducedMotion(),
      unripeDewdrop: this.cfg().economy.unripeDewdrop,
    });
    this.current = { tl, payload: next };
    return true;
  }

  /** Dev/screenshot aid: when set, timelines stop advancing on their own. */
  frozen = false;

  /** Jump the current (or next) timeline to `ms` from its start and hold there. */
  seek(ms: number): void {
    if (!this.current && !this.startNext()) return;
    this.frozen = true;
    const tl = this.current!.tl;
    tl.advance(Math.max(0, ms - tl.time));
  }

  tick(dtMs: number): void {
    this.clock += dtMs;
    this.flushHud();
    if (this.frozen) return;
    if (!this.current && !this.startNext()) return;
    const { tl, payload } = this.current!;
    const base = this.reducedMotion() ? this.cfg().anim.reducedMotionScale : 1;
    const rush = useUiStore.getState().rush ? this.cfg().anim.rushTimeScale : 1;
    tl.advance(dtMs * base * rush * usePresentationStore.getState().timeScale);
    if (!tl.done) return;
    this.current = null;
    this.flushHud(true);
    this.finish(payload);
  }

  /** Jump every queued timeline to its end, in order (logic is already committed). */
  skip(): void {
    for (;;) {
      if (!this.current && !this.startNext()) return;
      const { tl, payload } = this.current!;
      tl.skipToEnd();
      this.current = null;
      this.flushHud(true);
      this.finish(payload);
    }
  }

  private presented() {
    const grid: (Tile | null)[] = new Array(49).fill(null);
    for (const s of this.pool.snapshot()) grid[s.y * 7 + s.x] = s.tile;
    return grid;
  }

  private presentedDelivered(p: Payload) {
    return p.kind === 'move' ? usePresentationStore.getState().hud.delivered : p.run.delivered;
  }

  private finish(p: Payload): void {
    const bad = this.pool.mismatches(p.run.board);
    if (bad > 0) {
      console.error(`[choreo] presentation diverged from logic on ${bad} tiles; snapping`);
      usePresentationStore.setState((s) => ({ mismatches: s.mismatches + 1 }));
      this.pool.snap(p.run.board);
      if (new URLSearchParams(location.search).has('autoplay')) throw new Error('choreo_mismatch');
    }
    if (p.kind === 'move' || p.kind === 'reject') runController.timelineDone();
    else if (p.kind === 'overnight') gameController.morningDone();
  }
}
