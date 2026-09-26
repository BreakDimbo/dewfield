import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-12 asset pipeline: every sound is synthesised here (no third-party samples, no licensing questions),
 * written as 48 kHz WAV, then encoded by ffmpeg to webm/opus 96 kbps + mp3 128 kbps (03 §14).
 * Run: `pnpm assets:audio` (needs ffmpeg on PATH). Output: public/audio/sfx.{webm,mp3,json}, music/*.{webm,mp3}.
 */
const SR = 48_000;
const OUT = join(process.cwd(), 'public/audio');
const TMP = join(process.cwd(), '.audio-tmp');

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

type Buf = Float32Array;
const buf = (sec: number): Buf => new Float32Array(Math.ceil(sec * SR));
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));

function add(dst: Buf, at: number, fn: (t: number) => number, dur: number, gain = 1) {
  const s0 = Math.floor(at * SR);
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < dst.length; i++) dst[s0 + i]! += gain * fn(i / SR);
}
const sine = (f: number, t: number) => Math.sin(2 * Math.PI * f * t);

/** Marimba-ish bar: fundamental + 4th and 10th partials with fast decay. */
function marimba(dst: Buf, at: number, f: number, gain = 0.5, len = 0.9) {
  add(dst, at, (t) => env(t, 0.002, 0.28) * (sine(f, t) + 0.22 * sine(f * 3.93, t) * Math.exp(-t * 18) + 0.06 * sine(f * 9.9, t) * Math.exp(-t * 40)), len, gain);
}
/** Soft plucked string (Karplus-Strong). */
function pluck(dst: Buf, at: number, f: number, gain = 0.4, len = 1.6, damp = 0.996) {
  const p = Math.max(2, Math.round(SR / f));
  const ring = new Float32Array(p).map(() => rnd() * 2 - 1);
  let k = 0;
  let last = 0;
  add(dst, at, () => {
    const v = ring[k]!;
    const nv = damp * 0.5 * (v + ring[(k + 1) % p]!);
    ring[k] = nv;
    k = (k + 1) % p;
    last = last * 0.4 + v * 0.6;
    return last;
  }, len, gain);
}
function noise(dst: Buf, at: number, dur: number, gain: number, color: (t: number) => number) {
  let lp = 0;
  add(dst, at, (t) => {
    const a = color(t);
    lp += a * ((rnd() * 2 - 1) - lp);
    return lp;
  }, dur, gain);
}
function reverb(src: Buf, mix = 0.18): Buf {
  const out = new Float32Array(src.length);
  const taps = [0.0297, 0.0371, 0.0411, 0.0437].map((s) => Math.round(s * SR));
  const lines = taps.map((n) => new Float32Array(n));
  const idx = taps.map(() => 0);
  for (let i = 0; i < src.length; i++) {
    let wet = 0;
    lines.forEach((l, j) => {
      const v = l[idx[j]!]!;
      wet += v;
      l[idx[j]!] = src[i]! + v * 0.72;
      idx[j] = (idx[j]! + 1) % l.length;
    });
    out[i] = src[i]! * (1 - mix) + (wet / lines.length) * mix;
  }
  return out;
}
function normalise(b: Buf, peak = 0.85): Buf {
  let m = 0;
  for (const v of b) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < b.length; i++) b[i]! *= peak / m;
  return b;
}

const C5 = 523.25;
const st = (s: number, base = C5) => base * 2 ** (s / 12);

/** ~25 cues (01 §12 "约 25 个音效"). */
const SFX: Record<string, () => Buf> = {
  swap: () => {
    const b = buf(0.14);
    add(b, 0, (t) => env(t, 0.002, 0.03) * sine(420 - 900 * t, t), 0.14, 0.5);
    noise(b, 0, 0.05, 0.25, () => 0.6);
    return b;
  },
  reject: () => {
    const b = buf(0.32);
    marimba(b, 0, 220, 0.4, 0.14);
    marimba(b, 0.1, 185, 0.4, 0.2);
    return b;
  },
  tick: () => {
    const b = buf(0.08);
    add(b, 0, (t) => env(t, 0.001, 0.015) * sine(1400, t), 0.08, 0.3);
    return b;
  },
  harvest0: () => {
    const b = buf(0.12);
    noise(b, 0, 0.1, 0.3, (t) => 0.2 * Math.exp(-t * 30));
    return b;
  },
  harvest1: () => {
    const b = buf(0.4);
    add(b, 0, (t) => env(t, 0.002, 0.09) * (sine(st(12), t) + 0.3 * sine(st(24), t)), 0.4, 0.35);
    return b;
  },
  harvest2: () => {
    const b = buf(0.9);
    marimba(b, 0, C5, 0.6);
    return b;
  },
  sickle: () => {
    const b = buf(0.45);
    noise(b, 0, 0.42, 0.7, (t) => 0.05 + 0.6 * Math.sin(Math.PI * Math.min(1, t / 0.42)));
    return b;
  },
  dew: () => {
    const b = buf(0.6);
    add(b, 0, (t) => env(t, 0.004, 0.14) * sine(900 * Math.exp(-t * 5) + 240, t), 0.6, 0.55);
    noise(b, 0.03, 0.2, 0.12, () => 0.9);
    return b;
  },
  bee: () => {
    const b = buf(0.8);
    add(b, 0, (t) => env(t, 0.06, 0.4) * Math.sign(sine(190 + 14 * sine(7, t), t)) * 0.3, 0.8, 0.35);
    return b;
  },
  created: () => {
    const b = buf(0.9);
    [0, 4, 7].forEach((s, i) => marimba(b, i * 0.06, st(12 + s), 0.28, 0.6));
    return b;
  },
  combo: () => {
    const b = buf(1.1);
    [0, 4, 7, 11, 14].forEach((s, i) => marimba(b, i * 0.035, st(s), 0.24, 0.8));
    noise(b, 0, 0.5, 0.2, (t) => 0.3 * Math.exp(-t * 6));
    return b;
  },
  grow: () => {
    const b = buf(0.3);
    add(b, 0, (t) => env(t, 0.01, 0.07) * sine(st(7) * (1 + t), t), 0.3, 0.2);
    return b;
  },
  land: () => {
    const b = buf(0.12);
    add(b, 0, (t) => env(t, 0.001, 0.03) * sine(140 - 200 * t, t), 0.12, 0.35);
    return b;
  },
  orderDone: () => {
    const b = buf(1.2);
    [0, 4, 7, 12].forEach((s, i) => marimba(b, i * 0.08, st(12 + s), 0.3));
    return b;
  },
  fanfare: () => {
    const b = buf(1.6);
    [0, 4, 7, 12, 16].forEach((s, i) => marimba(b, i * 0.1, st(s), 0.34));
    [0, 7, 12].forEach((s) => pluck(b, 0.5, st(s - 12), 0.18, 1));
    return b;
  },
  sigh: () => {
    const b = buf(1.2);
    [7, 4, 0].forEach((s, i) => marimba(b, i * 0.16, st(s - 12), 0.3));
    return b;
  },
  tap: () => {
    const b = buf(0.08);
    add(b, 0, (t) => env(t, 0.001, 0.02) * sine(700 - 800 * t, t), 0.08, 0.3);
    return b;
  },
  confirm: () => {
    const b = buf(0.5);
    marimba(b, 0, st(7), 0.3, 0.4);
    marimba(b, 0.07, st(12), 0.3, 0.4);
    return b;
  },
  open: () => {
    const b = buf(0.25);
    add(b, 0, (t) => env(t, 0.004, 0.05) * sine(500 + 700 * t, t), 0.25, 0.25);
    return b;
  },
  close: () => {
    const b = buf(0.25);
    add(b, 0, (t) => env(t, 0.004, 0.05) * sine(900 - 700 * t, t), 0.25, 0.25);
    return b;
  },
  water: () => {
    const b = buf(0.9);
    for (let i = 0; i < 9; i++) add(b, i * 0.07 + rnd() * 0.03, (t) => env(t, 0.003, 0.03) * sine(1200 + rnd() * 900 - 1400 * t, t), 0.12, 0.18);
    noise(b, 0, 0.8, 0.12, (t) => 0.4 * (1 - t));
    return b;
  },
  night: () => {
    const b = buf(2.4);
    [0, 5, 9, 12, 7, 16].forEach((s, i) => add(b, i * 0.22, (t) => env(t, 0.002, 0.5) * (sine(st(s + 12), t) + 0.4 * sine(st(s + 12) * 2.76, t)), 1.4, 0.14));
    return b;
  },
  purchase: () => {
    const b = buf(0.8);
    marimba(b, 0, st(12), 0.3, 0.5);
    marimba(b, 0.06, st(19), 0.3, 0.5);
    add(b, 0.12, (t) => env(t, 0.001, 0.06) * sine(st(31), t), 0.3, 0.12);
    return b;
  },
  levelUp: () => {
    const b = buf(1.8);
    [0, 2, 4, 7, 9, 12, 14, 16].forEach((s, i) => marimba(b, i * 0.07, st(s), 0.22, 0.9));
    return b;
  },
  rush: () => {
    const b = buf(1.4);
    for (let i = 0; i < 14; i++) pluck(b, i * 0.045, st([0, 2, 4, 7, 9][i % 5]! + 12 * Math.floor(i / 5) - 12), 0.18, 0.8);
    return b;
  },
};

/** Seamless loops: the tail wraps onto the head so the reverb doesn't click at the loop point. */
function music(kind: 'morning' | 'dusk' | 'match'): Buf {
  const bpm = kind === 'match' ? 92 : kind === 'dusk' ? 66 : 78;
  const beat = 60 / bpm;
  const bars = kind === 'match' ? 16 : 12;
  const len = bars * 4 * beat;
  const b = buf(len + 3);
  const prog: number[][] =
    kind === 'dusk'
      ? [[-3, 0, 4], [-7, -3, 0], [-5, -1, 2], [-8, -5, -1]]
      : kind === 'match'
        ? [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [-5, -1, 2]]
        : [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [-5, 2, 7]];
  const pent = [0, 2, 4, 7, 9, 12, 14, 16];
  for (let bar = 0; bar < bars; bar++) {
    const chord = prog[bar % prog.length]!;
    const t0 = bar * 4 * beat;
    chord.forEach((s) => add(b, t0, (t) => env(t, 0.4, 2.2) * 0.5 * (sine(st(s - 12), t) + 0.3 * sine(st(s), t)), 4 * beat + 1, kind === 'dusk' ? 0.1 : 0.07));
    pluck(b, t0, st(chord[0]! - 24), 0.3, 2.4, 0.998);
    const steps = kind === 'match' ? 8 : 6;
    for (let k = 0; k < steps; k++) {
      if (rnd() < (kind === 'dusk' ? 0.45 : 0.25)) continue;
      const note = pent[Math.floor(rnd() * pent.length)]! + (rnd() < 0.3 ? 12 : 0);
      const at = t0 + (k * 4 * beat) / steps;
      if (kind === 'match') marimba(b, at, st(note), 0.16, 0.5);
      else pluck(b, at, st(note), 0.16, 1.4);
    }
    if (kind === 'match') for (let k = 0; k < 8; k++) noise(b, t0 + (k * beat) / 2, 0.03, k % 2 ? 0.04 : 0.07, () => 0.8);
  }
  const wet = reverb(b, 0.25);
  const n = Math.floor(len * SR);
  const loop = wet.slice(0, n);
  for (let i = 0; i < wet.length - n; i++) loop[i]! += wet[n + i]!;
  return normalise(loop, 0.7);
}

function wav(path: string, b: Buf) {
  const data = Buffer.alloc(44 + b.length * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + b.length * 2, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(b.length * 2, 40);
  for (let i = 0; i < b.length; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(b[i]! * 32767))), 44 + i * 2);
  writeFileSync(path, data);
}

function encode(src: string, dst: string) {
  const webm = ['-y', '-loglevel', 'error', '-i', src, '-c:a', 'libopus', '-b:a', '96k', `${dst}.webm`];
  const mp3 = ['-y', '-loglevel', 'error', '-i', src, '-c:a', 'libmp3lame', '-b:a', '128k', `${dst}.mp3`];
  execFileSync('ffmpeg', webm);
  execFileSync('ffmpeg', mp3);
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(join(OUT, 'music'), { recursive: true });

const gap = 0.25;
const parts = Object.entries(SFX).map(([id, make]) => [id, normalise(reverb(make(), 0.12), 0.8)] as const);
const total = parts.reduce((s, [, b]) => s + b.length + gap * SR, 0);
const sprite = new Float32Array(Math.ceil(total));
const map: Record<string, [number, number]> = {};
let at = 0;
for (const [id, b] of parts) {
  sprite.set(b, at);
  map[id] = [Math.round((at / SR) * 1000), Math.round((b.length / SR) * 1000)];
  at += b.length + gap * SR;
}
wav(join(TMP, 'sfx.wav'), sprite);
encode(join(TMP, 'sfx.wav'), join(OUT, 'sfx'));
writeFileSync(join(OUT, 'sfx.json'), JSON.stringify({ sprite: map }, null, 2) + '\n');
for (const kind of ['morning', 'dusk', 'match'] as const) {
  wav(join(TMP, `${kind}.wav`), music(kind));
  encode(join(TMP, `${kind}.wav`), join(OUT, 'music', kind));
}
rmSync(TMP, { recursive: true, force: true });
console.log(`sfx: ${parts.length} cues; music: 3 loops → ${OUT}`);
