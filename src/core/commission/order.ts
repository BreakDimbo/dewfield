import type { CropId } from '@/core/config/crops';
import type { OrderItem } from './types';

export function remainingOf(items: readonly OrderItem[], delivered: Partial<Record<CropId, number>>) {
  const out: Partial<Record<CropId, number>> = {};
  for (const it of items) out[it.crop] = Math.max(0, it.count - (delivered[it.crop] ?? 0));
  return out;
}

export function isOrderComplete(items: readonly OrderItem[], delivered: Partial<Record<CropId, number>>): boolean {
  return items.every((it) => (delivered[it.crop] ?? 0) >= it.count);
}

export const sumValues = (r: Partial<Record<string, number>>): number =>
  Object.values(r).reduce<number>((s, v) => s + (v ?? 0), 0);
