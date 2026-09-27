// In-game time of day (docs/DESIGN.md §3): labels, light phase and the sun's direction.
import { CLOCK } from './data.js';

export const formatTime = (minute) => {
  const m = Math.floor(minute) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** 'dawn' 6–8, 'day' 8–16, 'evening' 16–19, 'night' 19–24. */
export function phaseOf(minute) {
  const h = minute / 60;
  if (h < 8) return 'dawn';
  if (h < 16) return 'day';
  if (h < 19) return 'evening';
  return 'night';
}

/**
 * Direction TO the sun as [x, y, z] (+X east, −Z north). Rises in the east at 6:00, highest (≈ 62°, south) at
 * 12:00, sets in the west at 18:00. After sunset the "sun" becomes a dim moon high in the south-east.
 */
export function sunDirection(minute) {
  const h = minute / 60;
  if (h >= 6 && h <= 18.5) {
    const t = (h - 6) / 12; // 0 sunrise … 1 sunset
    const az = Math.PI * t; // 0 = east, π = west, passing south
    const el = Math.max(0.04, Math.sin(Math.PI * Math.min(1, t)) * (62 * Math.PI / 180));
    const x = Math.cos(az) * Math.cos(el);
    const z = Math.sin(az) * Math.cos(el);
    return normalize([x, Math.sin(el), z]);
  }
  return normalize([0.35, 0.75, 0.5]);
}

/** Daylight 0…1 (0 = full night) used to blend sky, light and lamp intensities. */
export function daylight(minute) {
  const h = minute / 60;
  const up = smooth(4.6, 6.6, h); // 6:00 (day start) is already mostly light
  const down = 1 - smooth(17.8, 19.6, h);
  return Math.min(up, down);
}

/** Warmth 0…1: low sun (sunrise / sunset) tints light orange. */
export function warmth(minute) {
  const h = minute / 60;
  return Math.max(1 - smooth(6.5, 9, h), smooth(15.5, 18.2, h) * (1 - smooth(19.2, 20.5, h)));
}

export const canSleep = (minute) => minute >= CLOCK.sleepFrom;
export const mustSleep = (minute) => minute >= CLOCK.dayEnd;

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function normalize(v) {
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
}
