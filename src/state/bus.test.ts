import { describe, expect, it, vi } from 'vitest';
import { createBus } from './bus';

describe('bus', () => {
  it('on / emit / off are typed and isolated per channel', () => {
    const b = createBus<{ a: number; b: string }>();
    const fa = vi.fn();
    const fb = vi.fn();
    const offA = b.on('a', fa);
    b.on('b', fb);
    b.emit('a', 1);
    expect(fa).toHaveBeenCalledWith(1);
    expect(fb).not.toHaveBeenCalled();
    offA();
    b.emit('a', 2);
    expect(fa).toHaveBeenCalledTimes(1);
    b.off('b', fb);
    b.emit('b', 'x');
    expect(fb).not.toHaveBeenCalled();
    b.on('a', fa);
    b.clear();
    b.emit('a', 3);
    expect(fa).toHaveBeenCalledTimes(1);
  });

  it('a handler may unsubscribe while being called', () => {
    const b = createBus<{ a: number }>();
    const seen: number[] = [];
    const off = b.on('a', (n) => {
      seen.push(n);
      off();
    });
    b.on('a', (n) => seen.push(n * 10));
    b.emit('a', 1);
    b.emit('a', 2);
    expect(seen).toEqual([1, 10, 20]);
  });
});
