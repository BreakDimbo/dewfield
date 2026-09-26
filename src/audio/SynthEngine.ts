import type { AudioEngine, MusicId, SfxId } from './AudioEngine';

/** Asset-free WebAudio fallback (used if the sprite fails to load). Silent until unlock(). */
export class SynthEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private masterV = 0.8;
  private sfxV = 0.8;
  private muted = false;
  private last = new Map<SfxId, number>();

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.sfx.connect(this.master).connect(comp).connect(this.ctx.destination);
    this.apply();
    const n = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  setBus(bus: 'music' | 'sfx', v: number): void {
    if (bus === 'sfx') this.sfxV = v;
    this.apply();
  }
  setMaster(v: number): void {
    this.masterV = v;
    this.apply();
  }
  mute(m: boolean): void {
    this.muted = m;
    this.apply();
  }
  private apply() {
    if (!this.master || !this.sfx || !this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterV * 0.9, this.ctx.currentTime, 0.02);
    this.sfx.gain.value = this.sfxV;
  }

  music(_track: MusicId | null): void {
    /* the synth fallback has no music bed */
  }

  play(id: SfxId, opts: { rate?: number; volume?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const gap = id.startsWith('harvest') || id === 'tick' ? 0.028 : 0.012;
    if (t - (this.last.get(id) ?? -1) < gap) return;
    this.last.set(id, t);
    const rate = opts.rate ?? 1;
    const vol = opts.volume ?? 1;
    const C5 = 523.25;
    switch (id) {
      case 'harvest2':
        return this.marimba(C5 * rate, 0.34 * vol, t);
      case 'harvest1':
        return this.tone(C5 * 2 * rate, 'sine', 0.12 * vol, 0.004, 0.22, t, C5 * 4 * rate);
      case 'tick':
      case 'harvest0':
        return this.tone(900 * rate, 'triangle', 0.05 * vol, 0.002, 0.06, t);
      case 'swap':
        this.tone(420, 'sine', 0.12 * vol, 0.002, 0.07, t, 300);
        return this.burst(2400, 0.05 * vol, 0.03, t);
      case 'reject':
        this.tone(220, 'triangle', 0.12 * vol, 0.004, 0.09, t);
        return this.tone(185, 'triangle', 0.12 * vol, 0.004, 0.12, t + 0.09);
      case 'sickle':
        return this.sweep(600, 5200, 0.16 * vol, 0.3, t);
      case 'dew':
        this.tone(900, 'sine', 0.2 * vol, 0.005, 0.28, t, 260);
        return this.burst(5200, 0.05 * vol, 0.12, t + 0.02);
      case 'bee':
        return this.tone(180, 'sawtooth', 0.05 * vol, 0.03, 0.5, t, 220);
      case 'created':
      case 'orderDone':
      case 'confirm':
      case 'purchase':
        [0, 4, 7].forEach((s, i) => this.marimba(C5 * 2 * 2 ** (s / 12), 0.16 * vol, t + i * 0.06));
        return;
      case 'grow':
        return this.tone(C5 * 1.5 * rate, 'sine', 0.06 * vol, 0.01, 0.14, t, C5 * 2 * rate);
      case 'land':
        return this.tone(140, 'sine', 0.08 * vol, 0.002, 0.08, t, 90);
      case 'fanfare':
      case 'levelUp':
      case 'combo':
      case 'rush':
        [0, 4, 7, 12, 16].forEach((s, i) => this.marimba(C5 * 2 ** (s / 12), 0.22 * vol, t + i * 0.09));
        return;
      case 'sigh':
      case 'night':
        [7, 4, 0].forEach((s, i) => this.marimba((C5 / 2) * 2 ** (s / 12), 0.18 * vol, t + i * 0.14));
        return;
      case 'water':
        for (let i = 0; i < 5; i++) this.tone(1200 + i * 180, 'sine', 0.05 * vol, 0.004, 0.12, t + i * 0.05, 500 + i * 60);
        return;
      default:
        return this.tone(700, 'sine', 0.06 * vol, 0.002, 0.05, t, 520);
    }
  }

  private marimba(f: number, v: number, t: number) {
    this.tone(f, 'sine', v, 0.003, 0.55, t);
    this.tone(f * 4, 'sine', v * 0.22, 0.002, 0.09, t);
    this.tone(f * 10, 'sine', v * 0.05, 0.001, 0.03, t);
  }

  private tone(f: number, type: OscillatorType, v: number, attack: number, decay: number, t: number, fEnd?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(this.sfx!);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  private burst(freq: number, v: number, dur: number, t: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx!);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  private sweep(f0: number, f1: number, v: number, dur: number, t: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx!);
    s.start(t);
    s.stop(t + dur + 0.02);
  }
}
