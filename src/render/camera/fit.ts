import { PerspectiveCamera, Vector3 } from 'three';

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const cam = new PerspectiveCamera();
const v = new Vector3();

/** True if every point projects inside the NDC safe rect for a camera at target + dir·d. */
export function fitsAt(
  points: readonly Vector3[],
  dir: Vector3,
  target: Vector3,
  d: number,
  fov: number,
  aspect: number,
  insets: Insets,
): boolean {
  cam.fov = fov;
  cam.aspect = aspect;
  cam.near = 0.1;
  cam.far = 500;
  cam.position.copy(target).addScaledVector(dir, d);
  cam.up.set(0, 1, 0);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  const x0 = -1 + 2 * insets.left;
  const x1 = 1 - 2 * insets.right;
  const y0 = -1 + 2 * insets.bottom;
  const y1 = 1 - 2 * insets.top;
  for (const p of points) {
    v.copy(p).project(cam);
    if (v.x < x0 || v.x > x1 || v.y < y0 || v.y > y1 || v.z > 1) return false;
  }
  return true;
}

/** 03 §8.4: smallest distance along `dir` that keeps `points` inside the safe area (20-step bisection). */
export function fitDistance(
  points: readonly Vector3[],
  dir: Vector3,
  target: Vector3,
  fov: number,
  aspect: number,
  insets: Insets,
): number {
  let lo = 1;
  let hi = 400;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (fitsAt(points, dir, target, mid, fov, aspect, insets)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Board footprint plus the 0.5-cell outer margin (RD-6), at soil and crop-top heights. */
export function boardFramePoints(half = 3.5 + 0.5, top = 0.8): Vector3[] {
  const pts: Vector3[] = [];
  for (const x of [-half, half]) for (const z of [-half, half]) for (const y of [0, top]) pts.push(new Vector3(x, y, z));
  return pts;
}

/** HUD clearance in pixels (03 §8.4) → viewport fractions. */
export function hudInsets(width: number, height: number): Insets {
  const portrait = height > width;
  const top = (portrait ? 120 : 96) / height;
  const bottom = (portrait ? 140 : 72) / height;
  const side = portrait ? 12 / width : 24 / width;
  return { top, bottom, left: side, right: side };
}
