import type * as LevaModule from 'leva';
import { useEffect, useState } from 'react';
import { parseBoard, printBoard } from '@/core/board/ascii';
import { fieldBoard } from '@/core/homestead/homestead';
import { now } from '@/platform/clock';
import { mounts, renderStats } from '@/render/runtime';
import { useAppStore } from '@/state/appStore';
import { overrideTunables, gameCfg } from '@/state/config';
import { usePresentationStore } from '@/state/presentationStore';
import { useRunStore } from '@/state/runStore';
import { telemetry } from '@/state/telemetryLogger';
import css from './debug.module.css';

type Leva = typeof LevaModule;

/** 02 §13.4: the only way telemetry leaves the device. The file is the raw event array `pnpm kpi` reads. */
function exportTelemetry(): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([telemetry.exportJson()], { type: 'application/json' }));
  a.download = `dewfield-telemetry-${now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

/** 03 §16 `?debug=1`. Lives in its own lazy chunk; leva is only pulled in here. */
export default function DebugPanel() {
  const [, tick] = useState(0);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [tuning, setTuning] = useState(false);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  const app = useAppStore.getState();
  const rs = useRunStore.getState();
  const ps = usePresentationStore.getState();
  const board = rs.run?.board ?? (app.home ? fieldBoard(app.home) : null);
  const ascii = board ? printBoard(board) : '—';
  const seed = app.home?.seed ?? 0;

  const copy = async () => {
    const payload = JSON.stringify({ seed, ascii }, null, 2);
    parseBoard(ascii);
    await navigator.clipboard?.writeText(payload).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const openTuning = () => setTuning(true);

  if (!open)
    return (
      <button className={css.fab} onClick={() => setOpen(true)} data-bad={ps.mismatches > 0}>
        DBG
      </button>
    );
  return (
    <aside className={css.panel} aria-label="debug">
      <header>
        <b>Dewfield debug</b>
        {ps.mismatches > 0 && <span className={css.bad}>choreo ×{ps.mismatches}</span>}
        <button onClick={() => setOpen(false)}>×</button>
      </header>
      <dl>
        <dt>fps</dt>
        <dd>{renderStats.fps.toFixed(0)}</dd>
        <dt>draw calls</dt>
        <dd>{renderStats.calls}</dd>
        <dt>triangles</dt>
        <dd>{(renderStats.triangles / 1000).toFixed(1)}k</dd>
        <dt>particles</dt>
        <dd>{renderStats.particles}</dd>
        <dt>app / phase</dt>
        <dd>
          {app.app} / {rs.phase}
        </dd>
        <dt>seed</dt>
        <dd>{seed}</dd>
        <dt>runCounter</dt>
        <dd>{app.home?.runCounter ?? '—'}</dd>
        <dt>move</dt>
        <dd>
          {rs.run ? `${rs.run.moveIndex} · left ${rs.run.movesLeft}` : '—'}
        </dd>
        <dt>mounts</dt>
        <dd>
          canvas {mounts.canvas} · field {mounts.field}
        </dd>
      </dl>
      <pre className={css.ascii} data-testid="ascii-dump">
        {ascii}
      </pre>
      <div className={css.row}>
        <button onClick={copy}>{copied ? '已复制' : '复制状态'}</button>
        <button onClick={() => overrideTunables({ anim: { fastForwardScale: gameCfg().anim.fastForwardScale === 3 ? 5 : 3 } })}>
          ff ×{gameCfg().anim.fastForwardScale}
        </button>
        <button onClick={openTuning} disabled={tuning}>
          {tuning ? 'leva ✓' : '调参 (leva)'}
        </button>
        <button onClick={exportTelemetry}>导出遥测</button>
      </div>
      {tuning && <LevaTuning />}
    </aside>
  );
}

function LevaTuning() {
  const [mod, setMod] = useState<Leva | null>(null);
  useEffect(() => {
    void import('leva').then(setMod);
  }, []);
  if (!mod) return null;
  return <LevaInner leva={mod} />;
}

function LevaInner({ leva }: { leva: Leva }) {
  const a = gameCfg().anim;
  const v = leva.useControls('anim (next run)', {
    swap: { value: a.swap, min: 60, max: 400, step: 10 },
    harvestPop: { value: a.harvestPop, min: 60, max: 500, step: 10 },
    fallPerCell: { value: a.fallPerCell, min: 20, max: 160, step: 5 },
    grow: { value: a.grow, min: 60, max: 400, step: 10 },
  });
  useEffect(() => overrideTunables({ anim: v }), [v]);
  return <leva.Leva collapsed={false} titleBar={{ title: 'tunables' }} />;
}
