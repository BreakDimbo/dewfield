import { Color } from 'three';
import { CROP_BY_ID, type CropId } from '@/core/config/crops';
import type { Stage } from '@/core/board/model';

/** 01 §13.1 */
export const PAL = {
  linen: '#F7F1E8',
  sage: '#5B8F6B',
  clay: '#D9A39A',
  mist: '#A7C4D0',
  charcoal: '#2C2A28',
  leaf: '#5E9468',
  leafLight: '#86B67C',
  leafDark: '#467456',
  soil: '#7A5A48',
  soilDeep: '#5E4436',
  saucer: '#D6A594',
  saucerShade: '#B98474',
  gold: '#D8B25A',
  steel: '#9AAAB0',
  dew: '#8CC0D4',
  honey: '#E6BC52',
  wood: '#E6D5BD',
  woodShade: '#D2BC9E',
} as const;

const tmp = { h: 0, s: 0, l: 0 };
const SPROUT_TINT = new Color('#A9CB8C');

/** RD-2: unripe −35% saturation; sprouts paler still so the three stages read in greyscale too. */
export function stageColor(hex: string, stage: Stage): Color {
  const c = new Color(hex);
  if (stage === 2) return c;
  c.getHSL(tmp);
  if (stage === 1) return c.setHSL(tmp.h, tmp.s * 0.65, Math.min(1, tmp.l + 0.04));
  return c.setHSL(tmp.h, tmp.s * 0.55, Math.min(1, tmp.l + 0.05)).lerp(SPROUT_TINT, 0.22);
}

export const cropColor = (crop: CropId, stage: Stage): Color => stageColor(CROP_BY_ID[crop].color, stage);

/** Young leaves are fresher, ripe leaves deeper. */
export function leafColor(stage: Stage, light = false): Color {
  const base = new Color(light ? PAL.leafLight : PAL.leaf);
  if (stage === 0) return base.lerp(new Color('#A7CF8E'), 0.35);
  if (stage === 1) return base.lerp(new Color('#9CC286'), 0.15);
  return base;
}

export const CROP_UI_COLOR: Record<CropId, string> = {
  carrot: CROP_BY_ID.carrot.color,
  tomato: CROP_BY_ID.tomato.color,
  corn: CROP_BY_ID.corn.color,
  eggplant: CROP_BY_ID.eggplant.color,
  blueberry: CROP_BY_ID.blueberry.color,
};
