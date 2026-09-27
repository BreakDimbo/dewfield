import { Howl, Howler } from 'howler';
import type { AudioEngine, MusicId, SfxId } from './AudioEngine';

type SpriteMap = Record<string, [number, number]>;

/**
 * 03 §11 production engine: one sfx sprite + three streamed music loops.
 * Nothing touches Howler (which would create an AudioContext) before unlock(): master volume and mute are
 * cached until then. unlock() must run inside a user gesture, so it works synchronously — the sprite map is
 * prefetched at construction and the Howl is created in the same call stack when possible (iOS Safari).
 */
export class HowlerEngine implements AudioEngine {
  private sfx: Howl | null = null;
  private tracks = new Map<MusicId, Howl>();
  private pauseTimers = new Map<MusicId, ReturnType<typeof setTimeout>>();
  private current: MusicId | null = null;
  private wanted: MusicId | null = null;
  private sfxV = 0.8;
  private musicV = 0.6;
  private masterV = 1;
  private muted = false;
  private unlocked = false;
  private failed = false;
  private sprite: SpriteMap | null = null;
  private readonly spriteReady: Promise<SpriteMap | null>;

  constructor(
    private readonly base: string,
    private readonly onFail: () => void,
    fetcher: typeof fetch = (...a) => fetch(...a),
  ) {
    this.spriteReady = fetcher(`${this.base}audio/sfx.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`sfx.json ${r.status}`);
        return r.json() as Promise<{ sprite: SpriteMap }>;
      })
      .then(({ sprite }) => (this.sprite = sprite))
      .catch(() => {
        if (this.unlocked) this.fail();
        return null;
      });
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  unlock(): void {
    if (this.failed) return;
    if (this.unlocked) {
      // Later gestures resume a context the browser suspended (iOS after interruptions).
      void Howler.ctx?.resume?.();
      return;
    }
    this.unlocked = true;
    Howler.volume(this.masterV);
    Howler.mute(this.muted);
    void Howler.ctx?.resume?.();
    if (this.sprite) this.createSfx(this.sprite);
    else
      void this.spriteReady.then((s) => {
        if (s) this.createSfx(s);
        else this.fail();
      });
  }

  private createSfx(sprite: SpriteMap) {
    if (this.sfx) return;
    this.sfx = new Howl({
      src: [`${this.base}audio/sfx.webm`, `${this.base}audio/sfx.mp3`],
      sprite,
      onloaderror: () => this.fail(),
    });
    if (this.wanted) this.music(this.wanted);
  }

  private fail() {
    if (this.failed) return;
    this.failed = true;
    this.onFail();
  }

  play(id: SfxId, opts: { rate?: number; volume?: number } = {}): void {
    if (!this.sfx || this.failed) return;
    const h = this.sfx.play(id);
    this.sfx.volume(Math.min(1, (opts.volume ?? 1) * this.sfxV), h);
    if (opts.rate) this.sfx.rate(opts.rate, h);
  }

  music(track: MusicId | null, opts: { fadeMs?: number } = {}): void {
    this.wanted = track;
    if (!this.unlocked || !this.sfx || track === this.current) return;
    const fade = opts.fadeMs ?? 800;
    const prevId = this.current;
    const prev = prevId ? this.tracks.get(prevId) : null;
    if (prevId && prev) {
      prev.fade(prev.volume(), 0, fade);
      this.pauseTimers.set(
        prevId,
        setTimeout(() => {
          this.pauseTimers.delete(prevId);
          prev.pause();
        }, fade + 50),
      );
    }
    this.current = track;
    if (!track) return;
    // Coming back to a track that is still fading out: cancel its pending pause.
    const pending = this.pauseTimers.get(track);
    if (pending) {
      clearTimeout(pending);
      this.pauseTimers.delete(track);
    }
    let h = this.tracks.get(track);
    if (!h) {
      h = new Howl({ src: [`${this.base}audio/music/${track}.webm`, `${this.base}audio/music/${track}.mp3`], html5: true, loop: true, volume: 0 });
      this.tracks.set(track, h);
    }
    if (!h.playing()) h.play();
    h.fade(h.volume(), this.musicV, fade);
  }

  setBus(bus: 'music' | 'sfx', v: number): void {
    if (bus === 'sfx') this.sfxV = v;
    else {
      this.musicV = v;
      if (this.current) this.tracks.get(this.current)?.volume(v);
    }
  }

  setMaster(v: number): void {
    this.masterV = v;
    if (this.unlocked) Howler.volume(v);
  }

  mute(m: boolean): void {
    this.muted = m;
    if (this.unlocked) Howler.mute(m);
  }
}
