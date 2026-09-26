import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PMREMGenerator,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useAppStore } from '@/state/appStore';
import { useUiStore } from '@/state/uiStore';
import { gameCfg } from '@/state/config';
import { PRESETS, type LightPreset } from './presets';

type PresetId = keyof typeof PRESETS;

function presetFor(): PresetId {
  const { app, home } = useAppStore.getState();
  if (app === 'night' && useUiStore.getState().nightPhase === 'dark') return 'night';
  return home?.phase === 'dusk' ? 'dusk' : 'morning';
}

/** Sky dome gradient + half-sphere light + one sun, lerped between presets (03 §8.5). No shadow maps (D-20). */
export function LightingRig() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const hemi = useMemo(() => new HemisphereLight(), []);
  const sun = useMemo(() => new DirectionalLight(), []);
  const fog = useMemo(() => new Fog('#EFE8DC', 26, 60), []);
  const dome = useMemo(() => {
    const mat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new Color() },
        horizon: { value: new Color() },
        glow: { value: new Color() },
        sunDir: { value: new Vector3() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 1.6 + 0.12, 0.0, 1.0);
          vec3 col = mix(horizon, top, smoothstep(0.0, 1.0, h));
          float s = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 6.0);
          col = mix(col, glow, s * 0.55);
          float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          col += (grain - 0.5) / 255.0;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new Mesh(new SphereGeometry(90, 32, 16), mat);
    m.renderOrder = -10;
    return m;
  }, []);
  const cur = useRef<LightPreset>(clonePreset(PRESETS[presetFor()]));
  const target = useRef<PresetId>(presetFor());

  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    scene.fog = fog;
    sun.position.set(0, 0, 0);
    scene.add(sun.target);
    return () => {
      env.dispose();
      pm.dispose();
      scene.environment = null;
      scene.fog = null;
    };
  }, [gl, scene, fog, sun]);

  useFrame((_, dt) => {
    target.current = presetFor();
    const goal = PRESETS[target.current];
    const k = 1 - Math.exp((-dt * 1000 * 3) / gameCfg().anim.nightFade);
    const c = cur.current;
    for (const key of ['sky', 'ground', 'sun', 'fog', 'domeTop', 'domeHorizon', 'domeGlow'] as const) c[key].lerp(goal[key], k);
    c.hemi += (goal.hemi - c.hemi) * k;
    c.sunIntensity += (goal.sunIntensity - c.sunIntensity) * k;
    c.sunDir.lerp(goal.sunDir, k).normalize();
    c.fogNear += (goal.fogNear - c.fogNear) * k;
    c.fogFar += (goal.fogFar - c.fogFar) * k;
    c.exposure += (goal.exposure - c.exposure) * k;

    hemi.color.copy(c.sky);
    hemi.groundColor.copy(c.ground);
    hemi.intensity = c.hemi;
    sun.color.copy(c.sun);
    sun.intensity = c.sunIntensity;
    sun.position.copy(c.sunDir).multiplyScalar(20);
    fog.color.copy(c.fog);
    fog.near = c.fogNear;
    fog.far = c.fogFar;
    gl.toneMappingExposure = c.exposure;
    const u = (dome.material as ShaderMaterial).uniforms;
    u.top!.value.copy(c.domeTop);
    u.horizon!.value.copy(c.domeHorizon);
    u.glow!.value.copy(c.domeGlow);
    u.sunDir!.value.copy(c.sunDir);
  });

  return (
    <>
      <primitive object={hemi} />
      <primitive object={sun} />
      <primitive object={dome} />
    </>
  );
}

function clonePreset(p: LightPreset): LightPreset {
  return {
    ...p,
    sky: p.sky.clone(),
    ground: p.ground.clone(),
    sun: p.sun.clone(),
    sunDir: p.sunDir.clone(),
    fog: p.fog.clone(),
    domeTop: p.domeTop.clone(),
    domeHorizon: p.domeHorizon.clone(),
    domeGlow: p.domeGlow.clone(),
  };
}
