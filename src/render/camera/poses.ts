import { Vector3 } from 'three';

export interface Pose {
  /** Unit vector from target to camera. */
  dir: Vector3;
  target: Vector3;
  fov: number;
  /** When set, distance is fitted to frame the board; otherwise this is the distance. */
  distance?: number;
  /** Fit the board plus this half-extent (world units) instead of the match frame. */
  fitHalf?: number;
}

const fromAngles = (pitchDeg: number, yawDeg: number) => {
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  return new Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
};

export type PoseId = 'title' | 'hub' | 'match' | 'photo0' | 'photo1' | 'photo2';

/** 03 §8.4 — match: ~55° down, narrow fov (reads almost orthographic). */
export const POSES: Record<PoseId, Pose> = {
  match: { dir: fromAngles(55, 0), target: new Vector3(0, 0.1, 0.12), fov: 30 },
  hub: { dir: fromAngles(42, -14), target: new Vector3(0, 0.2, 0.5), fov: 34, fitHalf: 5.6 },
  title: { dir: fromAngles(28, 24), target: new Vector3(-0.3, 0.6, 0.4), fov: 32, distance: 19 },
  photo0: { dir: fromAngles(22, 32), target: new Vector3(0, 0.8, 0), fov: 30, distance: 20 },
  photo1: { dir: fromAngles(78, 0), target: new Vector3(0, 0, 0.2), fov: 34, fitHalf: 6.6 },
  photo2: { dir: fromAngles(34, -38), target: new Vector3(0.4, 0.4, 0.4), fov: 38, distance: 23 },
};
