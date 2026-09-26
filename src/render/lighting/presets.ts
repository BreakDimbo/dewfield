import { Color, Vector3 } from 'three';

export interface LightPreset {
  sky: Color;
  ground: Color;
  hemi: number;
  sun: Color;
  sunIntensity: number;
  sunDir: Vector3;
  fog: Color;
  fogNear: number;
  fogFar: number;
  domeTop: Color;
  domeHorizon: Color;
  domeGlow: Color;
  exposure: number;
}

const c = (hex: string) => new Color(hex);

/** 01 §13.4 — morning (cool-warm), dusk (warm orange), night (deep blue, transitions only). */
export const PRESETS: Record<'morning' | 'dusk' | 'night', LightPreset> = {
  morning: {
    sky: c('#F3F6F4'),
    ground: c('#D8C3A6'),
    hemi: 1.12,
    sun: c('#FFF0D8'),
    sunIntensity: 2.6,
    sunDir: new Vector3(-4, 9, 5).normalize(),
    fog: c('#EFE8DC'),
    fogNear: 34,
    fogFar: 70,
    domeTop: c('#BFD6DE'),
    domeHorizon: c('#F6EFE4'),
    domeGlow: c('#FFF4DE'),
    exposure: 1.0,
  },
  dusk: {
    sky: c('#FBE3CF'),
    ground: c('#C99E82'),
    hemi: 1.15,
    sun: c('#FFC89A'),
    sunIntensity: 2.0,
    sunDir: new Vector3(6, 4, 3).normalize(),
    fog: c('#F1D6C2'),
    fogNear: 24,
    fogFar: 58,
    domeTop: c('#C9B6C8'),
    domeHorizon: c('#F7D9C2'),
    domeGlow: c('#FFD2A6'),
    exposure: 0.98,
  },
  night: {
    sky: c('#6E7FA6'),
    ground: c('#2F3148'),
    hemi: 0.75,
    sun: c('#A9BCE8'),
    sunIntensity: 0.6,
    sunDir: new Vector3(3, 8, -4).normalize(),
    fog: c('#2B3350'),
    fogNear: 20,
    fogFar: 52,
    domeTop: c('#1D2440'),
    domeHorizon: c('#3C4568'),
    domeGlow: c('#56628C'),
    exposure: 0.9,
  },
};
