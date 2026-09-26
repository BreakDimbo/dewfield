import { now } from '@/platform/clock';
import { usePresentationStore } from '@/state/presentationStore';
import { useAppStore } from '@/state/appStore';
import { telemetry } from '@/state/telemetryLogger';
import { startAutoplay } from './autoplay';

export const benchResult: { value: { avgMs: number; p95Ms: number; frames: number } | null } = { value: null };

/** 03 §13 `?bench=1`: bot plays for 60 s; average and p95 frame time go to telemetry and the console. */
export function startBench(durationMs = Number(new URLSearchParams(location.search).get('benchMs') ?? 60_000)): void {
  const stop = startAutoplay(1);
  const frames: number[] = [];
  let last = performance.now();
  const t0 = now();
  const tick = () => {
    const t = performance.now();
    frames.push(t - last);
    last = t;
    if (now() - t0 < durationMs) requestAnimationFrame(tick);
    else {
      stop();
      frames.sort((a, b) => a - b);
      const avgMs = frames.reduce((s, x) => s + x, 0) / frames.length;
      const p95Ms = frames[Math.floor(frames.length * 0.95)] ?? 0;
      benchResult.value = { avgMs, p95Ms, frames: frames.length };
      telemetry.log('bench_result', { avgMs, p95Ms, dpr: window.devicePixelRatio, quality: useAppStore.getState().settings.quality });
      console.info(`[bench] avg ${avgMs.toFixed(2)} ms · p95 ${p95Ms.toFixed(2)} ms · ${frames.length} frames`);
      usePresentationStore.setState({ timeScale: 1 });
    }
  };
  requestAnimationFrame(tick);
}
