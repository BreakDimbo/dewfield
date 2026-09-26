import { Howl, Howler } from 'howler';
import type { AudioEngine, MusicId, SfxId } from './AudioEngine';

/** 03 §11 production engine: one sfx sprite + three streamed music loops, created only after unlock. */
export class HowlerEngine implements AudioEngine {
  private sfx: Howl | null = null;
  private tracks = new Map<MusicId, Howl>();
  private current: MusicId | null = null;
  private wanted: MusicId | null = null;
  private sfxV = 0.8;
  private musicV = 0.6;
  private unlocked = false;
  private failed = false;

  constructor(
    private readonly base: string,
    private readonly onFail: () => void,
  ) {}

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    void fetch(`${this.base}audio/sfx.json`)
      .then((r) => r.json() as Promise<{ sprite: Record<string, [number, number]> }>)
      .then(({ sprite }) => {
        this.sfx = new Howl({
          src: [`${this.base}audio/sfx.webm`, `${this.base}audio/sfx.mp3`],
          sprite,
          onloaderror: () => this.fail(),
        });
        if (this.wanted) this.music(this.wanted);
      })
      .catch(() => this.fail());
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
    const prev = this.current ? this.tracks.get(this.current) : null;
    if (prev) {
      prev.fade(prev.volume(), 0, fade);
      const p = prev;
      setTimeout(() => p.pause(), fade + 50);
    }
    this.current = track;
    if (!track) return;
    let h = this.tracks.get(track);
    if (!h) {
      h = new Howl({ src: [`${this.base}audio/music/${track}.webm`, `${this.base}audio/music/${track}.mp3`], html5: true, loop: true, volume: 0 });
      this.tracks.set(track, h);
    }
    h.play();
    h.fade(0, this.musicV, fade);
  }

  setBus(bus: 'music' | 'sfx', v: number): void {
    if (bus === 'sfx') this.sfxV = v;
    else {
      this.musicV = v;
      if (this.current) this.tracks.get(this.current)?.volume(v);
    }
  }

  setMaster(v: number): void {
    Howler.volume(v);
  }

  mute(m: boolean): void {
    Howler.mute(m);
  }
}
