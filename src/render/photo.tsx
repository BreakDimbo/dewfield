import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Raycaster, Vector3, type Object3D } from 'three';
import { contextLost, occlusionProbe, photoApi } from './runtime';

const shown = (o: Object3D | null): boolean => !o || (o.visible && shown(o.parent));
const inField = (o: Object3D | null): boolean => !!o && (o.userData.field === true || inField(o.parent));

/** Rays from the camera to a grid over the board + 0.5 cell, at soil and crop-top height (RD-6). */
function findOccluders(scene: Object3D, camera: { position: Vector3 }): string[] {
  const ray = new Raycaster();
  const hits = new Set<string>();
  const dir = new Vector3();
  for (let x = -4; x <= 4; x += 0.5)
    for (let z = -4; z <= 4; z += 0.5)
      for (const y of [0, 0.8]) {
        const target = new Vector3(x, y, z);
        dir.subVectors(target, camera.position);
        const dist = dir.length();
        ray.set(camera.position, dir.normalize());
        ray.far = dist - 0.05;
        for (const h of ray.intersectObject(scene, true)) {
          if (!shown(h.object) || inField(h.object)) continue;
          hits.add(h.object.name || h.object.parent?.name || h.object.type);
        }
      }
  return [...hits];
}

export function PhotoProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    photoApi.capture = async (watermark) => {
      const s = gl.domElement.width / 1280;
      const font = `600 ${Math.round(22 * s)}px "LXGW WenKai", "Songti SC", serif`;
      // The display face may not be loaded yet if no DOM text used it; canvas text would fall back silently.
      await document.fonts?.load(font, watermark).catch(() => undefined);
      gl.render(scene, camera);
      const src = gl.domElement;
      const out = document.createElement('canvas');
      out.width = src.width;
      out.height = src.height;
      const ctx = out.getContext('2d')!;
      ctx.drawImage(src, 0, 0);
      ctx.font = font;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(44,42,40,0.18)';
      ctx.fillText(watermark, out.width - 28 * s + 1.5 * s, out.height - 24 * s + 1.5 * s);
      ctx.fillStyle = 'rgba(247,241,232,0.92)';
      ctx.fillText(watermark, out.width - 28 * s, out.height - 24 * s);
      return out.toDataURL('image/png');
    };
    photoApi.renderAndRead = () => {
      gl.render(scene, camera);
      const ctx = gl.getContext();
      const w = ctx.drawingBufferWidth;
      const h = ctx.drawingBufferHeight;
      const data = new Uint8Array(w * h * 4);
      ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, data);
      return { w, h, data };
    };
    occlusionProbe.occluders = () => findOccluders(scene, camera);
    const lost = (e: Event) => {
      e.preventDefault();
      contextLost.handler?.();
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      photoApi.capture = null;
      photoApi.renderAndRead = null;
      occlusionProbe.occluders = null;
      gl.domElement.removeEventListener('webglcontextlost', lost);
    };
  }, [gl, scene, camera]);
  return null;
}
