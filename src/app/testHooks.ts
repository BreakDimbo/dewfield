import { Quaternion } from 'three';
import { pickHint } from '@/core/board/hint';
import { parseBoard, printBoard } from '@/core/board/ascii';
import type { Move } from '@/core/board/model';
import { fieldRuntime, mounts, occlusionProbe, photoApi, renderStats } from '@/render/runtime';
import { useAppStore } from '@/state/appStore';
import { gameController } from '@/state/controllers/gameController';
import { runController } from '@/state/controllers/runController';
import { useRunStore } from '@/state/runStore';
import { useUiStore } from '@/state/uiStore';
import { telemetry } from '@/state/telemetryLogger';
import { createRun } from '@/core/run/run';
import { bus } from '@/state/bus';
import { gameCfg } from '@/state/config';
import { hudFromRun, usePresentationStore } from '@/state/presentationStore';

declare global {
  interface Window {
    __DEWFIELD__?: {
      getState: () => { app: string; ascii: string | null; movesLeft: number | null; delivered: unknown; wallet: number | null; ui: unknown };
      applyMove: (ax: number, ay: number, bx: number, by: number) => void;
      skipAnimations: () => void;
      newGame: (seed?: number) => void;
      startRun: () => void;
      closeSettlement: () => void;
      water: (y: number) => boolean;
      autoMove: () => void;
      stats: () => { calls: number; triangles: number; fps: number };
      exportTelemetry: () => string;
      cellScreen: (x: number, y: number) => { x: number; y: number } | null;
      boardRect: () => { left: number; right: number; top: number; bottom: number } | null;
      guideRow: () => number | null;
      home: () => unknown;
      showBoard: (ascii: string) => void;
      loadRun: (ascii: string) => void;
      seek: (ms: number) => void;
      patchHome: (patch: Record<string, unknown>) => void;
      readCells: (grid: [number, number]) => Promise<number[][]>;
      synthReview: (cells: number[], grid: [number, number]) => { cell: number; truth: string; lum: number[]; sil: number[] }[];
      resume: () => void;
      mounts: () => { canvas: number; field: number; canvasEver: number; fieldEver: number };
      photo: (watermark: string) => Promise<string | null>;
      mismatches: () => number;
      occluders: () => string[] | null;
    };
  }
}

/** 03 §15 test hooks: dev builds with ?e2e=1 only. */
export function installTestHooks(): void {
  window.__DEWFIELD__ = {
    getState: () => {
      const run = useRunStore.getState().run;
      const home = useAppStore.getState().home;
      return {
        app: useAppStore.getState().app,
        ascii: run ? printBoard(run.board) : null,
        movesLeft: run?.movesLeft ?? null,
        delivered: run?.delivered ?? null,
        wallet: home?.wallet.dewdrop ?? null,
        ui: { careMode: useUiStore.getState().careMode, hoverRow: useUiStore.getState().hoverRow },
      };
    },
    applyMove: (ax, ay, bx, by) => {
      const m: Move = { a: { x: ax, y: ay }, b: { x: bx, y: by } };
      runController.commit(m);
    },
    skipAnimations: () => fieldRuntime.current?.choreo.skip(),
    newGame: (seed = 1) => gameController.newGame(seed),
    startRun: () => {
      gameController.openBrief();
      gameController.startRun();
    },
    closeSettlement: () => gameController.closeSettlement(),
    water: (y) => gameController.waterRow(y),
    stats: () => ({ ...renderStats }),
    mounts: () => ({ ...mounts }),
    mismatches: () => usePresentationStore.getState().mismatches,
    occluders: () => occlusionProbe.occluders?.() ?? null,
    photo: async (watermark) => (await photoApi.capture?.(watermark)) ?? null,
    exportTelemetry: () => telemetry.exportJson(),
    cellScreen: (x, y) => fieldRuntime.current?.choreo.project?.({ x, y }) ?? null,
    boardRect: () => {
      const p = fieldRuntime.current?.choreo.project;
      if (!p) return null;
      const pts = [
        [-1, -1],
        [7, -1],
        [-1, 7],
        [7, 7],
      ].map(([x, y]) => p({ x: x!, y: y! })!);
      return { left: Math.min(...pts.map((q) => q.x)), right: Math.max(...pts.map((q) => q.x)), top: Math.min(...pts.map((q) => q.y)), bottom: Math.max(...pts.map((q) => q.y)) };
    },
    autoMove: () => {
      const rs = useRunStore.getState();
      if (!rs.run || rs.phase !== 'idle') return;
      const m = rs.guide ?? pickHint(rs.run, gameCfg())?.move;
      if (m) runController.commit(m);
    },
    guideRow: () => useUiStore.getState().guideRow,
    home: () => useAppStore.getState().home,
    showBoard: (ascii) => fieldRuntime.current?.pool.snap(parseBoard(ascii).board),
    seek: (ms) => fieldRuntime.current?.choreo.seek(ms),
    readCells: async ([gw, gh]) => {
      const url = await photoApi.capture?.('');
      const rt = fieldRuntime.current;
      if (!url || !rt?.choreo.project) return [];
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const rect = document.querySelector('canvas')!.getBoundingClientRect();
      const sx = c.width / rect.width;
      const a = rt.choreo.project({ x: 3, y: 3 })!;
      const b = rt.choreo.project({ x: 4, y: 3 })!;
      const cell = Math.abs(b.x - a.x) * sx;
      const out: number[][] = [];
      for (let i = 0; i < 49; i++) {
        const p = rt.choreo.project({ x: i % 7, y: Math.floor(i / 7) })!;
        const cx = (p.x - rect.left) * sx;
        const cy = (p.y - rect.top) * sx - cell * 0.3;
        const w = cell * 0.8;
        const h = cell * 1.1;
        const feat: number[] = [];
        for (let gy = 0; gy < gh; gy++)
          for (let gx = 0; gx < gw; gx++) {
            let sum = 0;
            let n = 0;
            for (let yy = 0; yy < 3; yy++)
              for (let xx = 0; xx < 3; xx++) {
                const px = Math.round(cx - w / 2 + ((gx + (xx + 0.5) / 3) / gw) * w);
                const py = Math.round(cy - h / 2 + ((gy + (yy + 0.5) / 3) / gh) * h);
                const k = (py * c.width + px) * 4;
                sum += 0.2126 * data[k]! + 0.7152 * data[k + 1]! + 0.0722 * data[k + 2]!;
                n++;
              }
            feat.push(sum / n / 255);
          }
        out.push(feat);
      }
      return out;
    },
    synthReview: (cells, [gw, gh]) => {
      const rt = fieldRuntime.current;
      const read = photoApi.renderAndRead;
      const project = rt?.choreo.project;
      if (!rt || !read || !project) return [];
      const camQ = new Quaternion();
      const rect = document.querySelector('canvas')!.getBoundingClientRect();
      const hl = { selected: null, guide: null, nudge: null, hint: null, idle: false };
      const classes = ['C', 'T', 'M', 'E', 'B'].flatMap((c) => [0, 1, 2].map((s) => `${c}${s}`));
      const patch = (cell: number) => {
        const snap = read();
        const sx = snap.w / rect.width;
        const p = project({ x: cell % 7, y: Math.floor(cell / 7) })!;
        const q = project({ x: (cell % 7) + 1, y: Math.floor(cell / 7) })!;
        const size = Math.abs(q.x - p.x) * sx;
        const cx = (p.x - rect.left) * sx;
        const cy = (p.y - rect.top) * sx - size * 0.3;
        const w = size * 0.9;
        const h = size * 1.15;
        const lum: number[] = [];
        for (let gy = 0; gy < gh; gy++)
          for (let gx = 0; gx < gw; gx++) {
            let sum = 0;
            for (let yy = 0; yy < 3; yy++)
              for (let xx = 0; xx < 3; xx++) {
                const px = Math.round(cx - w / 2 + ((gx + (xx + 0.5) / 3) / gw) * w);
                const py = snap.h - 1 - Math.round(cy - h / 2 + ((gy + (yy + 0.5) / 3) / gh) * h);
                const k = (py * snap.w + px) * 4;
                sum += 0.2126 * snap.data[k]! + 0.7152 * snap.data[k + 1]! + 0.0722 * snap.data[k + 2]!;
              }
            lum.push(sum / 9 / 255);
          }
        return lum;
      };
      const pool = rt.pool;
      const render = () => pool.update(0, camQ, hl);
      const out: { cell: number; truth: string; lum: number[]; sil: number[] }[] = [];
      for (const cell of cells) {
        const entry = pool.snapshot().find((s) => s.y * 7 + s.x === cell);
        if (!entry || entry.tile.kind !== 'crop') continue;
        const orig = entry.tile;
        const truth = `${'CTMEB'['carrot tomato corn eggplant blueberry'.split(' ').indexOf(orig.crop)]}${orig.stage}`;
        const empty = (() => {
          pool.setPop(entry.uid, 0);
          render();
          const e = patch(cell);
          pool.setPop(entry.uid, 1);
          return e;
        })();
        render();
        const observed = patch(cell);
        const lumD: number[] = [];
        const silD: number[] = [];
        const mask = (a: number[]) => a.map((v, i) => (Math.abs(v - empty[i]!) > 0.06 ? 1 : 0));
        const obsMask = mask(observed);
        for (const c of classes) {
          const crop = (['carrot', 'tomato', 'corn', 'eggplant', 'blueberry'] as const)['CTMEB'.indexOf(c[0]!)]!;
          pool.setCrop(entry.uid, crop);
          pool.setStage(entry.uid, Number(c[1]) as 0 | 1 | 2);
          render();
          const cand = patch(cell);
          lumD.push(cand.reduce((s, v, i) => s + (v - observed[i]!) ** 2, 0));
          const m = mask(cand);
          silD.push(m.reduce<number>((s, v, i) => s + (v === obsMask[i] ? 0 : 1), 0));
        }
        pool.setCrop(entry.uid, orig.crop);
        pool.setStage(entry.uid, orig.stage);
        render();
        out.push({ cell, truth, lum: lumD, sil: silD });
      }
      return out;
    },
    patchHome: (patch) => {
      const h = useAppStore.getState().home;
      if (h) useAppStore.setState({ home: { ...h, ...patch } as typeof h });
    },
    resume: () => {
      if (fieldRuntime.current) fieldRuntime.current.choreo.frozen = false;
    },
    loadRun: (ascii) => {
      const { board, nextUid } = parseBoard(ascii);
      const commission = {
        id: 'SANDBOX',
        clientId: 'xiaotang' as const,
        tier: 1 as const,
        items: [{ crop: 'tomato' as const, count: 30 }],
        moves: 20,
        isTutorial: false,
        dayExempt: false,
        text: '',
        delivered: {},
        attempts: 0,
      };
      const run = createRun({ commission, board, seed: 1, uidCounter: nextUid }, gameCfg());
      useRunStore.setState({ run, phase: 'idle', guide: null, selected: null, preview: null });
      usePresentationStore.setState({ hud: hudFromRun(run), busy: false });
      bus.emit('boardSnap', { run });
    },
  };
}
