import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { cellX, cellZ } from '@/render/field/layout';
import { pickCell, worldToCell } from '@/render/input/pick';
import { boardFramePoints, fitDistance, fitsAt, hudInsets } from './fit';
import { POSES } from './poses';

const pose = POSES.match;

describe('fitDistance (03 §8.4)', () => {
  it.each([
    ['16:9', 1920, 1080],
    ['4:3', 1024, 768],
    ['9:16', 390, 844],
  ])('%s: board + 0.5 cell margin fits the HUD-safe area, and only just', (_n, w, h) => {
    const pts = boardFramePoints();
    const insets = hudInsets(w, h);
    const d = fitDistance(pts, pose.dir, pose.target, pose.fov, w / h, insets);
    expect(fitsAt(pts, pose.dir, pose.target, d, pose.fov, w / h, insets)).toBe(true);
    expect(fitsAt(pts, pose.dir, pose.target, d * 0.97, pose.fov, w / h, insets)).toBe(false);
  });

  it('portrait needs a farther camera than landscape', () => {
    const pts = boardFramePoints();
    const land = fitDistance(pts, pose.dir, pose.target, pose.fov, 16 / 9, hudInsets(1600, 900));
    const port = fitDistance(pts, pose.dir, pose.target, pose.fov, 9 / 16, hudInsets(900, 1600));
    expect(port).toBeGreaterThan(land);
  });
});

describe('pick (03 §10)', () => {
  const setup = (aspect: number) => {
    const cam = new PerspectiveCamera(pose.fov, aspect, 0.1, 500);
    const d = fitDistance(boardFramePoints(), pose.dir, pose.target, pose.fov, aspect, hudInsets(1280, 800));
    cam.position.copy(pose.target).addScaledVector(pose.dir, d);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld(true);
    return cam;
  };

  it('screen point over each cell centre returns that cell', () => {
    const cam = setup(1280 / 800);
    for (const [x, y] of [
      [0, 0],
      [6, 6],
      [3, 3],
      [2, 5],
    ] as const) {
      const p = new Vector3(cellX(x), 0, cellZ(y)).project(cam);
      expect(pickCell(p.x, p.y, cam)).toEqual({ x, y });
    }
  });

  it('respects the lifted pick plane', () => {
    const cam = setup(1.6);
    const p = new Vector3(cellX(4), 0.3, cellZ(1)).project(cam);
    expect(pickCell(p.x, p.y, cam, 0.3)).toEqual({ x: 4, y: 1 });
  });

  it('outside the board returns null', () => {
    const cam = setup(1.6);
    expect(pickCell(0.99, 0.99, cam)).toBeNull();
    const sky = new PerspectiveCamera();
    sky.position.set(0, 5, 0);
    sky.updateMatrixWorld(true);
    expect(pickCell(0, 1, sky)).toBeNull();
    expect(worldToCell(-3.6, 0)).toBeNull();
    expect(worldToCell(3.49, 3.49)).toEqual({ x: 6, y: 6 });
  });
});
