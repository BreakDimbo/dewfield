import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3, type PerspectiveCamera } from 'three';
import type { AppState } from '@/core/flow/appFsm';
import { easeInOutCubic } from '@/render/choreo/easing';
import { fieldRuntime } from '@/render/runtime';
import { useAppStore } from '@/state/appStore';
import { useUiStore } from '@/state/uiStore';
import { gameCfg } from '@/state/config';
import { gameController } from '@/state/controllers/gameController';
import { boardFramePoints, fitDistance, hudInsets } from './fit';
import { POSES, type PoseId } from './poses';

const poseFor = (s: AppState): PoseId =>
  s === 'photo'
    ? (`photo${useUiStore.getState().photoPose}` as PoseId)
    : s === 'boot' || s === 'title'
      ? 'title'
      : s === 'toMatch' || s === 'match' || s === 'settlement'
        ? 'match'
        : 'hub';

const FRAME = boardFramePoints();
const goal = new Vector3();

interface Shot {
  pos: Vector3;
  target: Vector3;
  fov: number;
}

function shotFor(id: PoseId, aspect: number, w: number, h: number): Shot {
  const p = POSES[id];
  const frame = p.fitHalf ? boardFramePoints(p.fitHalf, 1.2) : FRAME;
  const d = p.distance ?? fitDistance(frame, p.dir, p.target, p.fov, aspect, hudInsets(w, h));
  const portrait = aspect < 1;
  const dist = p.distance && portrait ? p.distance * 1.55 : d;
  return { pos: p.target.clone().addScaledVector(p.dir, dist), target: p.target.clone(), fov: p.fov };
}

/** 03 §8.4 — poses per app state, eased transitions, pointer parallax, VFX shake. */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const pointer = useThree((s) => s.pointer);
  const from = useRef<Shot | null>(null);
  const to = useRef<Shot | null>(null);
  const t0 = useRef(0);
  const dur = useRef(1);
  const pose = useRef<PoseId>('title');
  const arrivedFor = useRef<AppState | null>(null);
  const par = useRef(new Vector3());
  const look = useRef(new Vector3());
  const clock = useRef(0);

  useEffect(() => {
    const aspect = size.width / size.height;
    const apply = (state: AppState, instant: boolean) => {
      const id = poseFor(state);
      const next = shotFor(id, aspect, size.width, size.height);
      const cur = { pos: camera.position.clone(), target: look.current.clone(), fov: camera.fov };
      if (instant || !to.current) {
        from.current = next;
        to.current = next;
        dur.current = 1;
        t0.current = clock.current - 10;
      } else if (id !== pose.current) {
        from.current = cur;
        to.current = next;
        const rm = useAppStore.getState().settings.reducedMotion;
        dur.current = (gameCfg().anim.cameraTransition * (rm ? 0.5 : 1)) / 1000;
        t0.current = clock.current;
      } else {
        to.current = next;
        from.current = next;
      }
      pose.current = id;
    };
    apply(useAppStore.getState().app, !to.current);
    const offApp = useAppStore.subscribe((s, prev) => {
      if (s.app !== prev.app) apply(s.app, false);
    });
    const offUi = useUiStore.subscribe((s, prev) => {
      if (s.photoPose !== prev.photoPose && useAppStore.getState().app === 'photo') apply('photo', false);
    });
    return () => {
      offApp();
      offUi();
    };
  }, [camera, size.width, size.height]);

  useFrame((state, dt) => {
    clock.current = state.clock.elapsedTime;
    const a = from.current;
    const b = to.current;
    if (!a || !b) return;
    const raw = Math.min(1, (clock.current - t0.current) / dur.current);
    const k = easeInOutCubic(raw);
    const app = useAppStore.getState().app;
    if (raw >= 1 && (app === 'toMatch' || app === 'toHub') && arrivedFor.current !== app) {
      arrivedFor.current = app;
      queueMicrotask(() => gameController.arrived());
    }
    if (app !== 'toMatch' && app !== 'toHub') arrivedFor.current = null;
    const rm = useAppStore.getState().settings.reducedMotion;
    const idleDrift = pose.current === 'title' && !rm ? 0.6 * Math.sin(clock.current * 0.12) : 0;
    const px = rm ? 0 : pointer.x * 0.15;
    const py = rm ? 0 : pointer.y * 0.1;
    par.current.lerp(goal.set(px + idleDrift, py, 0), 0.05);
    const shake = rm ? 0 : (fieldRuntime.current?.vfx.shakeAmount ?? 0) * 0.06;
    camera.position.lerpVectors(a.pos, b.pos, k);
    camera.position.x += par.current.x + (Math.random() - 0.5) * shake;
    camera.position.y += par.current.y + (Math.random() - 0.5) * shake;
    look.current.lerpVectors(a.target, b.target, k);
    camera.fov = a.fov + (b.fov - a.fov) * k;
    camera.updateProjectionMatrix();
    camera.lookAt(look.current);
    void dt;
  });

  return null;
}
