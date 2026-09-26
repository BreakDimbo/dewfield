import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3 } from 'three';
import { boardInteractive } from '@/core/flow/appFsm';
import { IDLE, gestureReduce, type GestureInput, type GestureState } from '@/core/flow/gesture';
import { useAppStore } from '@/state/appStore';
import { gameCfg } from '@/state/config';
import { gameController } from '@/state/controllers/gameController';
import { runController } from '@/state/controllers/runController';
import { useRunStore } from '@/state/runStore';
import { useUiStore } from '@/state/uiStore';
import { pickCell } from './pick';
import { signboard } from '@/render/runtime';
import { Raycaster, Vector2 } from 'three';

const ray = new Raycaster();
const ndcV = new Vector2();

export const PICK_PLANE_Y = 0.28;

const a = new Vector3();
const b = new Vector3();

/** 03 §10: pointer → plane pick → gesture reducer → run intents; hub picking for care and tile tips. */
export function useBoardGestures(): void {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = 'none';
    let state: GestureState = IDLE;
    let pointerId: number | null = null;

    const ndc = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
    };
    const cellOf = (e: PointerEvent) => {
      const p = ndc(e);
      return pickCell(p.x, p.y, camera, PICK_PLANE_Y);
    };
    const cellPx = () => {
      const r = el.getBoundingClientRect();
      a.set(0, 0, 0).project(camera);
      b.set(1, 0, 0).project(camera);
      return (Math.abs(b.x - a.x) * r.width) / 2;
    };
    const feed = (input: GestureInput) => {
      if (!boardInteractive(useAppStore.getState().app)) {
        state = IDLE;
        return;
      }
      const cfg = gameCfg();
      const thresholdPx = Math.min(cfg.input.dragThresholdPx, cfg.input.dragThresholdCell * cellPx());
      const r = gestureReduce(state, input, { thresholdPx, width: 7, height: 7 });
      state = r.state;
      for (const i of r.intents) runController.intent(i);
    };

    const hubMove = (e: PointerEvent) => {
      const ui = useUiStore.getState();
      if (useAppStore.getState().app !== 'hub') return;
      const c = cellOf(e);
      if (ui.careMode === 'water' && ui.guideRow === null) {
        const row = c?.y ?? null;
        if (row !== ui.hoverRow) useUiStore.setState({ hoverRow: row });
      }
      if (ui.careMode === 'bee' && (c?.x !== ui.hoverCell?.x || c?.y !== ui.hoverCell?.y)) useUiStore.setState({ hoverCell: c });
    };
    const hubTap = (e: PointerEvent) => {
      const { app, home } = useAppStore.getState();
      if (app !== 'hub' || !home) return;
      const c = cellOf(e);
      const ui = useUiStore.getState();
      if (ui.careMode === 'none' && signboard.collider) {
        const p = ndc(e);
        ray.setFromCamera(ndcV.set(p.x, p.y), camera);
        if (ray.intersectObject(signboard.collider, false).length > 0) return gameController.openBrief();
      }
      if (ui.careMode === 'water') {
        if (c) gameController.waterRow(c.y);
        else gameController.setCareMode('none');
        return;
      }
      if (ui.careMode === 'bee') {
        if (c) gameController.placeBee(c);
        else gameController.setCareMode('none');
        return;
      }
      if (!c) {
        useUiStore.setState({ tooltip: null });
        return;
      }
      gameController.inspectTile(c, { x: e.clientX, y: e.clientY });
    };

    const down = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      if (useRunStore.getState().phase === 'resolving') runController.fastForward();
      pointerId = e.pointerId;
      el.setPointerCapture?.(e.pointerId);
      feed({ t: 'down', cell: cellOf(e), px: { x: e.clientX, y: e.clientY } });
    };
    const move = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      hubMove(e);
      if (pointerId !== null && e.pointerId !== pointerId) return;
      feed({ t: 'move', cell: cellOf(e), px: { x: e.clientX, y: e.clientY } });
    };
    const up = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      if (pointerId === null) return;
      pointerId = null;
      feed({ t: 'up', cell: cellOf(e), px: { x: e.clientX, y: e.clientY } });
      hubTap(e);
    };
    const cancel = () => {
      pointerId = null;
      feed({ t: 'cancel' });
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('lostpointercapture', cancel);
    const offApp = useAppStore.subscribe((s, prev) => {
      if (s.app !== prev.app) {
        state = IDLE;
        useUiStore.setState({ tooltip: null, hoverRow: null });
      }
    });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('lostpointercapture', cancel);
      offApp();
    };
  }, [gl, camera]);
}
