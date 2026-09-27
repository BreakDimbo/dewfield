import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, use, useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '@/state/appStore';
import { effectiveTier, MAX_FLIPS, QUALITY_START, qualityStep } from './quality';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { gameCfg } from '@/state/config';
import { CameraRig } from './camera/CameraRig';
import { FieldView } from './field/FieldView';
import { fieldRuntime, mounts } from './runtime';
import { StatsProbe } from './stats';
import { PhotoProbe } from './photo';
import { useBoardGestures } from './input/useBoardGestures';
import { LightingRig } from './lighting/LightingRig';
import { RowHighlight } from './terrace/RowHighlight';
import { Terrace } from './terrace/Terrace';
import { DecorSpots } from './terrace/DecorSpots';
import { Signboard } from './terrace/Signboard';
import { assetsPending } from './assets/manifest';

/** 03 §14: suspend manifest consumers until every glTF source is parsed; the greybox set renders straight away. */
function AssetGate({ children }: { children: ReactNode }) {
  const p = assetsPending();
  if (p) use(p);
  return children;
}

function Gestures() {
  useBoardGestures();
  return null;
}

/** P2-21: drei PerformanceMonitor drives the pure ladder; Settings high/low override it. */
function Quality() {
  const setDpr = useThree((s) => s.setDpr);
  const setting = useAppStore((s) => s.settings.quality);
  const [q, setQ] = useState(QUALITY_START);
  useEffect(() => {
    const tier = effectiveTier(setting, q, gameCfg().render.dprMax);
    setDpr(Math.min(window.devicePixelRatio || 1, tier.dpr));
    const vfx = fieldRuntime.current?.vfx;
    if (vfx) vfx.particleScale = tier.particleScale;
  }, [q, setting, setDpr]);
  return (
    <PerformanceMonitor
      bounds={() => [45, 58]}
      flipflops={MAX_FLIPS}
      onDecline={() => setQ((s) => qualityStep(s, 'decline'))}
      onIncline={() => setQ((s) => qualityStep(s, 'incline'))}
    />
  );
}

/** The one and only Canvas (03 §8.1). Mounted once; modes only move the camera. */
export function Stage() {
  useEffect(() => {
    mounts.canvas++;
    mounts.canvasEver++;
    return () => {
      mounts.canvas--;
    };
  }, []);
  return (
    <Canvas
      dpr={[1, gameCfg().render.dprMax]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      shadows={false}
      frameloop="always"
      camera={{ fov: 32, near: 0.1, far: 220, position: [8, 9, 16] }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
        gl.outputColorSpace = SRGBColorSpace;
      }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <LightingRig />
      <Terrace />
      <DecorSpots />
      <Signboard />
      <Suspense fallback={null}>
        <AssetGate>
          <FieldView />
        </AssetGate>
      </Suspense>
      <RowHighlight />
      <CameraRig />
      <Gestures />
      <Quality />
      <StatsProbe particles={() => fieldRuntime.current?.vfx.particleCount ?? 0} />
      <PhotoProbe />
    </Canvas>
  );
}
