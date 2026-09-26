/** 03 §9.2 — event-driven timeline, independent of three so it runs in Node. */
export interface Track {
  start: number;
  duration: number;
  update(t01: number): void;
  onStart?(): void;
  onEnd?(): void;
}

interface TrackRec extends Track {
  state: 0 | 1 | 2;
  seq: number;
}
interface CueRec {
  at: number;
  fire(): void;
  fired: boolean;
  seq: number;
}

export class Timeline {
  private tracks: TrackRec[] = [];
  private cues: CueRec[] = [];
  private seq = 0;
  time = 0;

  add(track: Track): void {
    this.tracks.push({ ...track, duration: Math.max(0, track.duration), state: 0, seq: this.seq++ });
  }

  cue(at: number, fire: () => void): void {
    this.cues.push({ at, fire, fired: false, seq: this.seq++ });
  }

  get duration(): number {
    let d = 0;
    for (const t of this.tracks) d = Math.max(d, t.start + t.duration);
    for (const c of this.cues) d = Math.max(d, c.at);
    return d;
  }

  get done(): boolean {
    return this.tracks.every((t) => t.state === 2) && this.cues.every((c) => c.fired);
  }

  /** Fires starts/ends/cues in chronological order (ties: ends → cues → starts, then insertion order). */
  advance(ms: number): void {
    const target = this.time + Math.max(0, ms);
    for (;;) {
      let best: { at: number; rank: number; seq: number; run: () => void } | null = null;
      const consider = (at: number, rank: number, seq: number, run: () => void) => {
        if (at > target) return;
        if (!best || at < best.at || (at === best.at && (rank < best.rank || (rank === best.rank && seq < best.seq))))
          best = { at, rank, seq, run };
      };
      for (const t of this.tracks) {
        if (t.state === 0)
          consider(t.start, 2, t.seq, () => {
            t.state = 1;
            t.onStart?.();
            t.update(0);
          });
        else if (t.state === 1)
          consider(t.start + t.duration, 0, t.seq, () => {
            t.update(1);
            t.state = 2;
            t.onEnd?.();
          });
      }
      for (const c of this.cues)
        if (!c.fired)
          consider(c.at, 1, c.seq, () => {
            c.fired = true;
            c.fire();
          });
      if (!best) break;
      (best as { run: () => void }).run();
    }
    for (const t of this.tracks)
      if (t.state === 1) t.update(t.duration === 0 ? 1 : Math.min(1, (target - t.start) / t.duration));
    this.time = target;
  }

  skipToEnd(): void {
    this.advance(Math.max(0, this.duration - this.time) + 1);
  }
}
