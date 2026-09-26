import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CROP_BY_ID, type CropId } from '@/core/config/crops';
import { landFlyer, usePresentationStore } from '@/state/presentationStore';
import { useRunStore } from '@/state/runStore';
import { useUiStore } from '@/state/uiStore';
import { runController } from '@/state/controllers/runController';
import { CropIcon, DewIcon } from '@/ui/common/CropIcon';
import ui from '@/ui/common/ui.module.css';
import { CLIENT_LINE, S } from '@/ui/strings/zh-CN';
import css from './match.module.css';
import { PauseMenu } from './PauseMenu';

function Ring({ value }: { value: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <svg className={css.ring} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r={r} className={css.ringTrack} />
      <circle cx="20" cy="20" r={r} className={css.ringFill} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} />
    </svg>
  );
}

export function OrderBasket() {
  const items = useRunStore((s) => s.run?.commission.items ?? []);
  const delivered = usePresentationStore(useShallow((s) => s.hud.delivered));
  const pulse = usePresentationStore((s) => s.pulse);
  const delta = useRunStore((s) => (s.preview?.result.valid ? s.preview.result.delta.delivered : null));
  return (
    <div className={css.basket}>
      {items.map((it) => {
        const d = Math.min(it.count, delivered[it.crop] ?? 0);
        const left = it.count - d;
        const plus = delta?.[it.crop] ? Math.min(left, delta[it.crop]!) : 0;
        const bump = pulse?.crop === it.crop ? pulse.n : 0;
        return (
          <div key={it.crop} className={css.item} data-done={left === 0} aria-label={`${CROP_BY_ID[it.crop].name} 还差 ${left}`}>
            <span className={css.iconWrap} key={bump} data-bump={bump > 0} data-crop={it.crop}>
              <Ring value={d / it.count} />
              <CropIcon crop={it.crop} size={26} />
            </span>
            <span className={`${ui.num} ${css.left}`}>{left === 0 ? '✓' : left}</span>
            {plus > 0 && <span className={`${ui.num} ${css.plus}`}>−{plus}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Fades itself out with CSS (no hide state → no extra React commit, TR-2). */
function Banner() {
  const banner = usePresentationStore((s) => s.banner);
  if (!banner) return null;
  return (
    <div key={banner.id} className={css.banner} data-tone={banner.tone}>
      {banner.text}
    </div>
  );
}

const ICON_PATH: Record<CropId, string> = {
  carrot: 'M16 30 C13 22 10.5 16 11 12.5 C11.4 10 13.4 9.2 16 9.2 C18.6 9.2 20.6 10 21 12.5 C21.5 16 19 22 16 30Z',
  tomato: 'M4.5 18.5 A11.5 9.5 0 1 0 27.5 18.5 A11.5 9.5 0 1 0 4.5 18.5Z',
  corn: 'M11.5 8.5 A4.5 4.5 0 0 1 20.5 8.5 V20.5 A4.5 4.5 0 0 1 11.5 20.5Z',
  eggplant: 'M12.5 11 C7 15 6.5 25 12.5 28.5 C18.5 31.5 25 27 23.5 20 C22.5 15.5 20 12 18 10.5Z',
  blueberry: 'M4.5 20 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M15.5 20 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M10 11.5 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0',
};

/** Yield icons flying into the basket — imperative DOM, zero React commits (TR-2). */
function YieldFlyers() {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      usePresentationStore.subscribe((s, prev) => {
        const el = layer.current;
        if (!el || s.flyers === prev.flyers) return;
        for (const f of s.flyers) {
          if (prev.flyers.some((p) => p.id === f.id)) continue;
          launch(el, f.id, f.crop, f.x, f.y);
        }
      }),
    [],
  );
  return <div ref={layer} aria-hidden />;
}

function launch(layer: HTMLDivElement, id: number, crop: CropId, x: number, y: number) {
  const target = document.querySelector(`[data-crop="${crop}"]`)?.getBoundingClientRect();
  const node = document.createElement('span');
  node.className = css.flyer!;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.innerHTML = `<svg width="26" height="26" viewBox="0 0 32 32"><path d="${ICON_PATH[crop]}" fill="var(--c-${crop})"/></svg>`;
  layer.appendChild(node);
  const done = () => {
    node.remove();
    landFlyer(id);
  };
  if (!target || !node.animate) return done();
  const tx = target.left + target.width / 2 - x;
  const ty = target.top + target.height / 2 - y;
  const lift = -Math.min(120, Math.abs(ty) * 0.35);
  node.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      { transform: `translate(calc(-50% + ${tx * 0.35}px), calc(-50% + ${ty * 0.25 + lift}px)) scale(1.15)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0.55)`, opacity: 0.9 },
    ],
    { duration: 520, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' },
  ).onfinish = done;
}

export function MatchHud({ onSkip }: { onSkip?: () => void }) {
  const client = useRunStore((s) => s.run?.commission.clientId ?? 'amai');
  const text = useRunStore((s) => s.run?.commission.text ?? '');
  const movesLeft = usePresentationStore((s) => s.hud.movesLeft);
  const dew = usePresentationStore((s) => s.hud.dewdrops);
  const undoLeft = useRunStore((s) => s.run?.undoLeft ?? 0);
  const canUndo = useRunStore((s) => s.phase === 'idle' && !!s.run?.undoSnapshot && s.run.undoLeft > 0 && s.run.status === 'playing');
  const busy = usePresentationStore((s) => s.busy);
  const paused = useRunStore((s) => s.paused);
  const guide = useRunStore((s) => s.guide);
  const pulse = usePresentationStore((s) => (s.pulse?.crop === 'moves' ? s.pulse.n : 0));
  const rush = useUiStore((s) => s.rush);
  const dewPulse = usePresentationStore((s) => (s.pulse?.crop === 'dew' ? s.pulse.n : 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') runController.setPaused(!useRunStore.getState().paused);
      else if (e.key === 'z' || e.key === 'Z') runController.undo();
      else if (e.key === ' ') runController.fastForward();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={css.hud}>
      <div className={css.top}>
        <div className={`${ui.glass} ${css.orderBar}`} data-testid="hud-top">
          <div className={css.client} title={text}>
            <span className={css.clientName}>{CLIENT_LINE[client]}</span>
          </div>
          <OrderBasket />
          <div className={css.divider} />
          <div className={css.moves} data-low={movesLeft <= 3}>
            <span className={`${ui.num} ${css.movesNum}`} key={pulse}>
              {movesLeft}
            </span>
            <span className={css.movesLabel}>{S.moves}</span>
          </div>
        </div>
        <div className={css.side} data-testid="hud-side">
          <div className={`${ui.glass} ${css.dew}`} key={dewPulse} data-bump={dewPulse > 0}>
            <DewIcon />
            <span className={ui.num}>{dew}</span>
          </div>
          <button className={ui.icon} aria-label={S.pause} onClick={() => runController.setPaused(true)}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <rect x="4" y="3" width="3.2" height="12" rx="1.6" fill="currentColor" />
              <rect x="10.8" y="3" width="3.2" height="12" rx="1.6" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
      <Banner />
      <YieldFlyers />
      <div className={css.bottom} data-testid="hud-bottom">
        {guide && !busy && <div className={`${ui.glass} ${css.guide}`}>{S.guideT1}</div>}
        {busy && !rush && <div className={css.skipHint}>{S.tapToSkip}</div>}
        {rush && (
          <button className={ui.primary} onClick={() => onSkip?.()}>
            {S.skip}
          </button>
        )}
        <button className={ui.secondary} disabled={!canUndo} onClick={() => runController.undo()}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M6 3 L2.5 6.5 L6 10 M3 6.5 H10 A3.5 3.5 0 0 1 10 13.5 H7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {S.undo}
          <span className={`${ui.num} ${css.undoN}`}>×{undoLeft}</span>
        </button>
      </div>
      {paused && <PauseMenu />}
    </div>
  );
}
