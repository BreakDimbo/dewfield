import type { Object3D } from 'three';
import type { Choreographer } from '@/render/choreo/Choreographer';
import type { TilePool } from '@/render/field/TilePool';
import type { VfxSystem } from '@/render/vfx/VfxSystem';

export interface FieldRuntime {
  pool: TilePool;
  vfx: VfxSystem;
  choreo: Choreographer;
}

/** Imperative handles shared across the canvas (no React state). */
export const fieldRuntime: { current: FieldRuntime | null } = { current: null };

/** P1-20 acceptance: the canvas and FieldView mount exactly once (live count + mounts ever made). */
export const mounts = { canvas: 0, field: 0, canvasEver: 0, fieldEver: 0 };

/** Last frame's renderer counters, read by the debug panel (03 §16). */
export const renderStats = { calls: 0, triangles: 0, fps: 0, frameMs: 0, particles: 0 };

/** P2-20: capture right after an explicit render — no `preserveDrawingBuffer` needed. */
export const photoApi: {
  capture: ((watermark: string) => Promise<string>) | null;
  /** Render now and read back RGBA (bottom-up rows), for scripted readability review. */
  renderAndRead: (() => { w: number; h: number; data: Uint8Array }) | null;
} = { capture: null, renderAndRead: null };

/** RD-6 / P2-10: names of scene objects between the camera and the board (+0.5 cell) — must be empty in match. */
export const occlusionProbe: { occluders: (() => string[]) | null } = { occluders: null };

/** P2-22: set by the app layer to show the "reload" overlay. */
export const contextLost: { handler: (() => void) | null } = { handler: null };

/** P1-20: the signboard's invisible collider, ray-tested by hub picking. */
export const signboard: { collider: Object3D | null } = { collider: null };
