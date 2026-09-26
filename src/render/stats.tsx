import { useFrame, useThree } from '@react-three/fiber';

import { renderStats } from './runtime';

export function StatsProbe({ particles }: { particles: () => number }) {
  const gl = useThree((s) => s.gl);
  gl.info.autoReset = false;
  useFrame((_, dt) => {
    renderStats.calls = gl.info.render.calls;
    renderStats.triangles = gl.info.render.triangles;
    renderStats.frameMs = renderStats.frameMs * 0.9 + dt * 1000 * 0.1;
    renderStats.fps = 1000 / Math.max(1, renderStats.frameMs);
    renderStats.particles = particles();
    gl.info.reset();
  }, -1);
  return null;
}
