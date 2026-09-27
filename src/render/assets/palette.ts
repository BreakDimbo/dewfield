import { Color, SRGBColorSpace } from 'three';
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

const LADDER_STEP = 0.07;

/** Hue interpolation along the shorter arc of the colour wheel (red → orange → yellow-green, not via purple). */
function towardHue(h: number, target: number, t: number): number {
  let d = target - h;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return (h + d * t + 1) % 1;
}

/** Raise lightness until the colour's luma clears `floor` (keeps hue and saturation). */
function liftAbove(c: Color, floor: number): Color {
  c.getHSL(tmp);
  const { h, s } = tmp;
  let l = tmp.l;
  while (luminance(c) < floor && l < 1) {
    l = Math.min(1, l + 0.01);
    c.setHSL(h, s, l);
  }
  return c;
}

/**
 * RD-2 stage colours (00 D-36). Young fruit is greener, not whiter: the hue moves from the ripe colour towards the
 * crop's `young` colour (half-way when unripe, fully for sprouts), unripe keeps 65% of the ripe saturation
 * (−35%) and sprouts 55%. Each step is then lifted so the three stages differ by at least LADDER_STEP in luma.
 */
export function stageColor(hex: string, stage: Stage, young: string = hex): Color {
  const ripe = new Color(hex);
  if (stage === 2) return ripe;
  ripe.getHSL(tmp);
  const base = { ...tmp };
  new Color(young).getHSL(tmp);
  const youngHue = tmp.h;
  const unripe = new Color().setHSL(towardHue(base.h, youngHue, 0.5), base.s * 0.65, Math.min(1, base.l + 0.04));
  liftAbove(unripe, luminance(ripe) + LADDER_STEP);
  if (stage === 1) return unripe;
  const sprout = new Color().setHSL(towardHue(base.h, youngHue, 1), base.s * 0.55, Math.min(1, base.l + 0.08));
  return liftAbove(sprout, luminance(unripe) + LADDER_STEP);
}

/** Rec. 709 luma on display (sRGB) values — what a greyscale screenshot shows (RD-2). */
export function luminance(c: Color): number {
  const rgb = { r: 0, g: 0, b: 0 };
  c.getRGB(rgb, SRGBColorSpace);
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

export const cropColor = (crop: CropId, stage: Stage): Color => stageColor(CROP_BY_ID[crop].color, stage, CROP_BY_ID[crop].young);

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
