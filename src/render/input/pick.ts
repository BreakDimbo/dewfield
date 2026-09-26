import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import type { Pos } from '@/core/board/model';
import { CELL } from '@/render/field/layout';

const ray = new Raycaster();
const ndc = new Vector2();
const hit = new Vector3();
const plane = new Plane(new Vector3(0, 1, 0), 0);

/** World (x, z) → cell, or null outside the 7×7 board (03 §10). */
export function worldToCell(x: number, z: number): Pos | null {
  const cx = Math.floor(x / CELL + 3.5);
  const cy = Math.floor(z / CELL + 3.5);
  return cx >= 0 && cx < 7 && cy >= 0 && cy < 7 ? { x: cx, y: cy } : null;
}

/**
 * Ray from the camera through NDC onto a horizontal plane. `planeY` sits slightly above the soil so that tapping
 * a crop's body (not its footprint) picks its own cell under the tilted camera.
 */
export function pickCell(ndcX: number, ndcY: number, camera: Camera, planeY = 0): Pos | null {
  ndc.set(ndcX, ndcY);
  ray.setFromCamera(ndc, camera);
  plane.constant = -planeY;
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  return worldToCell(hit.x, hit.z);
}

export function pickWorld(ndcX: number, ndcY: number, camera: Camera, planeY = 0): Vector3 | null {
  ndc.set(ndcX, ndcY);
  ray.setFromCamera(ndc, camera);
  plane.constant = -planeY;
  return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
}
