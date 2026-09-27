import { useEffect } from 'react';
import { useAppStore } from '@/state/appStore';
import { gameCfg } from '@/state/config';

/** RD-8 / 03 §9.5: duration divisor — `anim.reducedMotionScale` when reduced motion is on, else 1. */
export function motionScale(): number {
  return useAppStore.getState().settings.reducedMotion ? gameCfg().anim.reducedMotionScale : 1;
}

/** Mirrors the in-app reduced-motion setting onto `<html data-rm>` so tokens.css can drop springs and speed up. */
export function useMotionAttr(): void {
  const rm = useAppStore((s) => s.settings.reducedMotion);
  useEffect(() => {
    document.documentElement.dataset.rm = rm ? '1' : '0';
  }, [rm]);
}
