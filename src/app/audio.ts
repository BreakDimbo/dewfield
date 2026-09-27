import { musicFor, startAudioDirector } from '@/audio/AudioDirector';
import type { AudioEngine } from '@/audio/AudioEngine';
import { HowlerEngine } from '@/audio/HowlerEngine';
import { SynthEngine } from '@/audio/SynthEngine';
import { useAppStore } from '@/state/appStore';

let installed = false;

/** No sound before the first interaction (01 §14); mute while the tab is hidden; synth fallback if assets fail. */
export function installAudio(): void {
  if (installed) return;
  installed = true;
  let engine: AudioEngine;
  const fallback = new SynthEngine();
  const howler = new HowlerEngine(import.meta.env.BASE_URL, () => {
    engine = fallback;
    fallback.unlock();
    applyVolume();
    fallback.mute(document.hidden);
  });
  engine = howler;
  const unlock = () => {
    engine.unlock();
    applyMusic();
  };
  // iOS only grants audio on touchend/click (not pointerdown), so listen to all of them; unlock is idempotent.
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const)
    window.addEventListener(ev, unlock, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => engine.mute(document.hidden));
  function applyVolume() {
    const v = useAppStore.getState().settings.volume;
    engine.setMaster(v.master);
    engine.setBus('sfx', v.sfx);
    engine.setBus('music', v.music);
  }
  function applyMusic() {
    const s = useAppStore.getState();
    engine.music(musicFor(s.app, s.home?.phase));
  }
  applyVolume();
  useAppStore.subscribe((s, p) => {
    if (s.settings !== p.settings) applyVolume();
    if (s.app !== p.app || s.home?.phase !== p.home?.phase) applyMusic();
  });
  startAudioDirectorWith(() => engine);
}

function startAudioDirectorWith(get: () => AudioEngine) {
  const proxy: AudioEngine = {
    unlock: () => get().unlock(),
    play: (id, o) => get().play(id, o),
    music: (t, o) => get().music(t, o),
    setBus: (b, v) => get().setBus(b, v),
    setMaster: (v) => get().setMaster(v),
    mute: (m) => get().mute(m),
  };
  startAudioDirector(proxy);
}
