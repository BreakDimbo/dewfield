import { describe, expect, it } from 'vitest';
import { Timeline } from './timeline';

describe('Timeline (03 §9.2)', () => {
  it('fires starts, updates, ends and cues in time order', () => {
    const log: string[] = [];
    const tl = new Timeline();
    tl.add({ start: 0, duration: 100, update: (t) => log.push(`a${t.toFixed(2)}`), onStart: () => log.push('a+'), onEnd: () => log.push('a-') });
    tl.cue(100, () => log.push('cue100'));
    tl.add({ start: 100, duration: 50, update: (t) => log.push(`b${t.toFixed(2)}`), onStart: () => log.push('b+'), onEnd: () => log.push('b-') });
    tl.cue(20, () => log.push('cue20'));
    tl.advance(50);
    expect(log).toEqual(['a+', 'a0.00', 'cue20', 'a0.50']);
    log.length = 0;
    tl.advance(60);
    expect(log).toEqual(['a1.00', 'a-', 'cue100', 'b+', 'b0.00', 'b0.20']);
    expect(tl.done).toBe(false);
    tl.advance(1000);
    expect(tl.done).toBe(true);
    expect(tl.duration).toBe(150);
  });

  it('skipToEnd runs everything left, in order', () => {
    const log: string[] = [];
    const tl = new Timeline();
    tl.cue(300, () => log.push('late'));
    tl.add({ start: 10, duration: 0, update: () => log.push('zero'), onEnd: () => log.push('zero-') });
    tl.add({ start: 200, duration: 100, update: () => {}, onEnd: () => log.push('long-') });
    tl.skipToEnd();
    expect(log).toEqual(['zero', 'zero', 'zero-', 'long-', 'late']);
    expect(tl.done).toBe(true);
  });

  it('scaled advancing covers the same content (timeScale is applied by the caller)', () => {
    const run = (step: number) => {
      const tl = new Timeline();
      const seen: number[] = [];
      for (let k = 0; k < 5; k++) tl.cue(k * 40, () => seen.push(k));
      while (!tl.done) tl.advance(step);
      return seen;
    };
    expect(run(16)).toEqual(run(16 * 3));
    expect(new Timeline().done).toBe(true);
    const tl = new Timeline();
    tl.advance(-5);
    expect(tl.time).toBe(0);
  });
});
