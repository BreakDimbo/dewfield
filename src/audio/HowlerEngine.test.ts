import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const howls: FakeHowl[] = [];
class FakeHowl {
  vol: number;
  isPlaying = false;
  constructor(public opts: { src: string[]; volume?: number }) {
    this.vol = opts.volume ?? 1;
    howls.push(this);
    calls.push(`new:${opts.src[0]}`);
  }
  play() {
    this.isPlaying = true;
    calls.push(`play:${this.opts.src[0]}`);
    return 1;
  }
  playing() {
    return this.isPlaying;
  }
  pause() {
    this.isPlaying = false;
    calls.push(`pause:${this.opts.src[0]}`);
  }
  fade(_from: number, to: number) {
    this.vol = to;
  }
  volume(v?: number) {
    if (v === undefined) return this.vol;
    this.vol = v;
    return this;
  }
  rate() {}
}

vi.mock('howler', () => ({
  Howl: FakeHowl,
  Howler: {
    ctx: undefined,
    volume: (v: number) => calls.push(`Howler.volume:${v}`),
    mute: (m: boolean) => calls.push(`Howler.mute:${m}`),
  },
}));

const { HowlerEngine } = await import('./HowlerEngine');

const okFetch = (() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ sprite: { swap: [0, 100] } }) } as Response)) as typeof fetch;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('HowlerEngine (P2-12 / P2-22)', () => {
  beforeEach(() => {
    calls.length = 0;
    howls.length = 0;
    vi.useRealTimers();
  });

  it('never touches Howler (no AudioContext) before unlock', async () => {
    const e = new HowlerEngine('/', () => {}, okFetch);
    e.setMaster(0.5);
    e.mute(true);
    e.setBus('sfx', 0.3);
    e.music('morning');
    e.play('swap');
    await flush();
    expect(calls).toEqual([]);
  });

  it('applies cached volume/mute and creates the sprite synchronously inside the unlocking gesture', async () => {
    const e = new HowlerEngine('/', () => {}, okFetch);
    e.setMaster(0.5);
    await flush();
    e.unlock();
    expect(calls.slice(0, 3)).toEqual(['Howler.volume:0.5', 'Howler.mute:false', 'new:/audio/sfx.webm']);
  });

  it('falls back when the sprite map is missing', async () => {
    const onFail = vi.fn();
    const bad = (() => Promise.resolve({ ok: false, status: 404 } as Response)) as typeof fetch;
    const e = new HowlerEngine('/', onFail, bad);
    await flush();
    expect(onFail).not.toHaveBeenCalled();
    e.unlock();
    await flush();
    expect(onFail).toHaveBeenCalledOnce();
  });

  it('A → B → A inside the crossfade keeps A playing', async () => {
    vi.useFakeTimers();
    const e = new HowlerEngine('/', () => {}, okFetch);
    await vi.advanceTimersByTimeAsync(0);
    e.unlock();
    e.music('morning');
    e.music('dusk');
    e.music('morning');
    vi.advanceTimersByTime(2000);
    const morning = howls.find((h) => h.opts.src[0]!.includes('morning'))!;
    expect(morning.isPlaying).toBe(true);
    expect(morning.vol).toBeCloseTo(0.6);
    const dusk = howls.find((h) => h.opts.src[0]!.includes('dusk'))!;
    expect(dusk.isPlaying).toBe(false);
  });
});
