import { BoxGeometry, MeshStandardMaterial, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { HarvestItem } from '@/core/board/events';

// Canvas-drawn textures need a DOM; particle bookkeeping does not.
vi.mock('@/render/assets/greybox', () => ({
  bandTexture: () => new Texture(),
  glowTexture: () => new Texture(),
  sparkTexture: () => new Texture(),
  beeGeometry: () => new BoxGeometry(),
}));
const { VfxSystem } = await import('./VfxSystem');
type VfxSystem = InstanceType<typeof VfxSystem>;

const count = (v: VfxSystem) => (v as unknown as { particles: unknown[] }).particles.length;
const ripe: HarvestItem = { pos: { x: 3, y: 3 }, uid: 1, crop: 'carrot', stage: 2, yield: 'crop', delivered: true };

describe('VfxSystem (P2-11)', () => {
  it('harvest bursts grow with cascade depth 1 → 8', () => {
    const sizes = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => {
      const v = new VfxSystem(10_000, new MeshStandardMaterial());
      v.harvestBurst(ripe, d);
      return count(v);
    });
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeGreaterThanOrEqual(sizes[i - 1]!);
    expect(sizes[7]!).toBeGreaterThan(sizes[0]!);
  });

  it('never holds more than the particle cap, dropping the oldest', () => {
    const v = new VfxSystem(300, new MeshStandardMaterial());
    for (let k = 0; k < 200; k++) v.harvestBurst({ ...ripe, pos: { x: k % 7, y: (k >> 3) % 7 } }, 8);
    expect(count(v)).toBe(300);
  });

  it('quality tier 0.5 roughly halves bursts', () => {
    const full = new VfxSystem(100_000, new MeshStandardMaterial());
    const half = new VfxSystem(100_000, new MeshStandardMaterial());
    half.particleScale = 0.5;
    for (let k = 0; k < 100; k++) {
      full.harvestBurst(ripe, 4);
      half.harvestBurst(ripe, 4);
    }
    expect(count(half) / count(full)).toBeGreaterThan(0.35);
    expect(count(half) / count(full)).toBeLessThan(0.65);
  });

  it('morning shimmer stays gentle and leaves headroom under the cap', () => {
    const v = new VfxSystem(100, new MeshStandardMaterial());
    v.morningShimmer(0, false);
    expect(count(v)).toBe(9);
    for (let k = 0; k < 50; k++) v.morningShimmer(k % 7, false);
    expect(count(v)).toBeLessThanOrEqual(60);
    const calm = new VfxSystem(100, new MeshStandardMaterial());
    calm.morningShimmer(3, true);
    expect(count(calm)).toBe(3);
  });
});
