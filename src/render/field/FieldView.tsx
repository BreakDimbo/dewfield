import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { parseBoard } from '@/core/board/ascii';
import { T1_FIXTURE } from '@/core/config/commissions';
import { fieldBoard } from '@/core/homestead/homestead';
import { geometryOf, manifest } from '@/render/assets/manifest';
import { Choreographer } from '@/render/choreo/Choreographer';
import { fieldRuntime, mounts, type FieldRuntime } from '@/render/runtime';
import { VfxSystem } from '@/render/vfx/VfxSystem';
import { useAppStore } from '@/state/appStore';
import { gameCfg } from '@/state/config';
import { usePresentationStore } from '@/state/presentationStore';
import { useRunStore } from '@/state/runStore';
import { useUiStore } from '@/state/uiStore';
import { cellX, cellZ } from './layout';
import { PreviewOverlay } from './PreviewOverlay';
import { TilePool } from './TilePool';


const camQ = new Quaternion();

const proj = new Vector3();

export function FieldView() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const runtime = useMemo<FieldRuntime>(() => {
    const pool = new TilePool(112);
    const vfx = new VfxSystem(gameCfg().render.particlesMax, pool.material);
    const choreo = new Choreographer(pool, vfx, gameCfg, () => useAppStore.getState().settings.reducedMotion);
    return { pool, vfx, choreo };
  }, []);

  useEffect(() => {
    mounts.field++;
    fieldRuntime.current = runtime;
    const { home } = useAppStore.getState();
    const run = useRunStore.getState().run;
    runtime.pool.snap(run?.board ?? (home ? fieldBoard(home) : parseBoard(T1_FIXTURE).board));
    return () => {
      mounts.field--;
      runtime.choreo.dispose();
      fieldRuntime.current = null;
    };
  }, [runtime]);

  useEffect(() => {
    runtime.choreo.project = (pos) => {
      const r = gl.domElement.getBoundingClientRect();
      proj.set(cellX(pos.x), 0.5, cellZ(pos.y)).project(camera);
      return { x: r.left + ((proj.x + 1) / 2) * r.width, y: r.top + ((1 - proj.y) / 2) * r.height };
    };
  }, [runtime, camera, gl]);

  const plots = useMemo(() => {
    const m = new InstancedMesh(geometryOf(manifest.plotDish()), runtime.pool.material, 49);
    const mat = new Matrix4();
    for (let i = 0; i < 49; i++) m.setMatrixAt(i, mat.makeTranslation(cellX(i % 7), 0, cellZ(Math.floor(i / 7))));
    m.instanceMatrix.needsUpdate = true;
    return m;
  }, [runtime]);

  useLayoutEffect(() => () => plots.dispose(), [plots]);

  useFrame((state, dt) => {
    const ms = Math.min(dt, 0.05) * 1000;
    runtime.choreo.tick(ms);
    camera.getWorldQuaternion(camQ);
    const rs = useRunStore.getState();
    const busy = usePresentationStore.getState().busy;
    const nudge = rs.preview && !busy ? rs.preview.move : null;
    const ui = useUiStore.getState();
    runtime.pool.setPreviewGrowth(ui.tomorrow ? gameCfg().overnight.growth : 0);
    runtime.pool.update(state.clock.elapsedTime, camQ, {
      selected: busy ? null : rs.selected,
      guide: busy || rs.preview ? null : rs.guide,
      nudge,
      hint: busy ? null : ui.hint,
      idle: !runtime.choreo.busy,
    });
    runtime.vfx.update(Math.min(dt, 0.05), state.clock.elapsedTime, camQ);
  });

  return (
    <group>
      <primitive object={plots} />
      <primitive object={runtime.pool.group} />
      <primitive object={runtime.vfx.group} />
      <PreviewOverlay />
    </group>
  );
}

