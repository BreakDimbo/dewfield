import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

import { contextLost, photoApi } from './runtime';

export function PhotoProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    photoApi.capture = async (watermark) => {
      gl.render(scene, camera);
      const src = gl.domElement;
      const out = document.createElement('canvas');
      out.width = src.width;
      out.height = src.height;
      const ctx = out.getContext('2d')!;
      ctx.drawImage(src, 0, 0);
      const s = out.width / 1280;
      ctx.font = `600 ${Math.round(22 * s)}px "LXGW WenKai", "Songti SC", serif`;
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
    const lost = (e: Event) => {
      e.preventDefault();
      contextLost.handler?.();
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      photoApi.capture = null;
      photoApi.renderAndRead = null;
      gl.domElement.removeEventListener('webglcontextlost', lost);
    };
  }, [gl, scene, camera]);
  return null;
}
