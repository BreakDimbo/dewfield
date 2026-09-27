// In-game day/night lighting (sakura-farm). Reads game.state.minute every frame and drives the sun direction,
// sun/hemisphere light, sky dome colours, fog and the farm lanterns (plus two small point lights at night).
// Daytime values equal the original Sakuragaoka tuning, so noon looks like the reference town.
import * as THREE from 'three';
import { sunDirection, daylight, warmth } from '../game/clock.js';

const C = (h) => new THREE.Color(h);
// sky: zenith, mid, horizon, warm haze, fog
const DAY = { zenith: C('#4f8fd6'), mid: C('#8fbde9'), horizon: C('#dfe9f2'), warm: C('#fbe3cf'), fog: C('#cfdcec') };
const DUSK = { zenith: C('#5b6fb4'), mid: C('#c9a2c4'), horizon: C('#f6c49a'), warm: C('#ffb07a'), fog: C('#e2c6bb') };
const NIGHT = { zenith: C('#0c1633'), mid: C('#1b2a55'), horizon: C('#34436f'), warm: C('#3d4a7a'), fog: C('#27335a') };
const SUN_DAY = C('#fff0dc'), SUN_LOW = C('#ff9f5e'), MOON = C('#a9b8ff');
const HEMI_SKY = C('#a9b3ee'), HEMI_GROUND = C('#d9c6c8'), HEMI_NIGHT_SKY = C('#5a67a8'), HEMI_NIGHT_GROUND = C('#3b3550'), HEMI_DUSK = C('#e6a9b4');

export function startDayNight(ctx, { sky, sunDir, game, pipeline }) {
  const farm = ctx.services.farm;
  const lampBase = farm?.lampMaterial?.color.clone();
  // real point lights only on high quality: every lit material in the town pays for each light per pixel
  const points = (ctx.quality?.name === 'high' ? farm?.lamps ?? [] : []).map((m) => {
    const l = new THREE.PointLight('#ffcf8a', 0, 9, 1.6);
    m.updateWorldMatrix(true, false);
    m.getWorldPosition(l.position);
    l.position.y -= 0.2;
    ctx.scene.add(l);
    return l;
  });
  const tmp = new THREE.Color();
  const dir = new THREE.Vector3();
  let lastMinute = -1;

  function apply(minute) {
    const d = daylight(minute);
    const w = warmth(minute) * d;
    dir.fromArray(sunDirection(minute));
    // sun below ~10° at dusk: keep shadows long but not degenerate
    sunDir.copy(dir);
    ctx.shared.uSunDir.value.copy(dir);
    const u = sky.uniforms;
    u.uSun.value.copy(dir);
    for (const [k, uni] of [['zenith', 'uZenith'], ['mid', 'uMid'], ['horizon', 'uHorizon'], ['warm', 'uWarm'], ['fog', 'uFog']]) {
      tmp.copy(NIGHT[k]).lerp(DAY[k], d).lerp(DUSK[k], w * 0.85);
      u[uni].value.copy(tmp);
    }
    if (ctx.scene.fog) ctx.scene.fog.color.copy(u.uFog.value);
    // lights
    sky.sun.intensity = 2.75 * d * (1 - w * 0.2) + 0.3 * (1 - d);
    sky.sun.color.copy(MOON).lerp(SUN_DAY, d).lerp(SUN_LOW, w * 0.8);
    sky.hemi.intensity = 1.62 * (0.16 + 0.84 * d);
    sky.hemi.color.copy(HEMI_NIGHT_SKY).lerp(HEMI_SKY, d).lerp(HEMI_DUSK, w * 0.6);
    sky.hemi.groundColor.copy(HEMI_NIGHT_GROUND).lerp(HEMI_GROUND, d);
    // overall exposure drops at night so the lanterns and the moon read as the light sources
    if (pipeline) pipeline.compMat.uniforms.uExposure.value = 0.5 + 0.5 * d;
    // lanterns: dim by day, bright (bloom) at night
    const night = 1 - d;
    if (lampBase) farm.lampMaterial.color.copy(lampBase).multiplyScalar(0.55 + 1.35 * night);
    for (const p of points) p.intensity = 6 * night;
  }

  ctx.onUpdate(() => {
    const m = game.state.minute;
    if (Math.abs(m - lastMinute) < 0.05) return;
    lastMinute = m;
    apply(m);
  });
  apply(game.state.minute);
  return { apply };
}
