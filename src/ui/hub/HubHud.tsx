import { useState } from 'react';
import { tutorialGate, type HubAction } from '@/core/flow/gates';
import { effectiveModifiers, terraceLevel } from '@/core/homestead/decor';
import { useAppStore } from '@/state/appStore';
import { gameCfg } from '@/state/config';
import { gameController } from '@/state/controllers/gameController';
import { useUiStore } from '@/state/uiStore';
import { DewIcon } from '@/ui/common/CropIcon';
import ui from '@/ui/common/ui.module.css';
import { S } from '@/ui/strings/zh-CN';
import css from './hub.module.css';

export function HubHud() {
  const home = useAppStore((s) => s.home);
  const careMode = useUiStore((s) => s.careMode);
  const guideRow = useUiStore((s) => s.guideRow);
  const tooltip = useUiStore((s) => s.tooltip);
  const [confirmSleep, setConfirmSleep] = useState(false);
  if (!home) return null;
  const gate = tutorialGate(home);
  const can = (a: HubAction) => gate.allow.includes(a);
  const pts = home.care.pointsLeft;
  const maxPts = gameCfg().care.pointsBase + effectiveModifiers(home).carePointsMax;
  const beeUnlocked = effectiveModifiers(home).careVerbs.includes('bee');
  const canBrief = !!home.commissions.active && home.phase === 'morning' && can('openCommission');
  const level = terraceLevel(home, gameCfg());
  const sleep = () => {
    if (pts > 0 && !confirmSleep) return setConfirmSleep(true);
    setConfirmSleep(false);
    gameController.sleep();
  };
  return (
    <div className={css.hud}>
      <div className={`${ui.glass} ${css.day}`}>
        <span className={`${ui.display} ${css.dayN}`}>{S.day(home.day)}</span>
        <span className={css.phase} data-phase={home.phase}>
          {home.phase === 'morning' ? S.morning : S.dusk}
        </span>
        <span className={css.level} title={S.terraceLevel(level)}>
          {'✦'.repeat(level)}
        </span>
      </div>
      <div className={css.topRight}>
        <div className={`${ui.glass} ${css.wallet}`}>
          <DewIcon />
          <span className={ui.num} data-testid="wallet">
            {home.wallet.dewdrop}
          </span>
        </div>
        <button className={ui.icon} aria-label={S.settings} onClick={() => gameController.openPanel('settings')}>
          <GearIcon />
        </button>
      </div>

      {careMode !== 'none' ? (
        <div className={css.dock}>
          <div className={`${ui.glass} ${css.careHint}`}>
            <Dots n={pts} max={maxPts} />
            {careMode === 'bee' ? S.beeHint : guideRow !== null ? S.waterGuide : S.waterHint}
          </div>
          {guideRow === null && (
            <button className={ui.secondary} onClick={() => gameController.setCareMode('none')}>
              {S.cancel}
            </button>
          )}
        </div>
      ) : (
        <div className={`${ui.glass} ${css.dock} ${css.dockBar}`}>
          <button className={ui.primary} disabled={!canBrief} onClick={() => gameController.openBrief()}>
            {home.phase === 'dusk' ? S.comeTomorrow : S.commission}
          </button>
          <button className={ui.secondary} disabled={pts <= 0 || !can('water')} onClick={() => gameController.setCareMode('water')}>
            <WaterIcon />
            {S.water}
            <Dots n={pts} max={maxPts} />
          </button>
          <button
            className={ui.secondary}
            disabled={!beeUnlocked || !can('bee') || !gameController.canPlaceBee()}
            title={beeUnlocked ? S.bee : S.beeLocked}
            onClick={() => gameController.setCareMode('bee')}
          >
            <BeeIcon />
            {beeUnlocked ? S.bee : S.beeLockedShort}
          </button>
          <button className={ui.secondary} disabled={!can('shop')} onClick={() => gameController.openPanel('shop')}>
            <ShopIcon />
            {S.shop}
          </button>
          <button className={ui.icon} disabled={!can('photo')} aria-label={S.photo} onClick={() => gameController.enterPhoto()}>
            <CameraIcon />
          </button>
          <button
            className={ui.icon}
            aria-label={S.tomorrow}
            title={S.tomorrow}
            onPointerDown={() => gameController.setTomorrow(true)}
            onPointerUp={() => gameController.setTomorrow(false)}
            onPointerLeave={() => gameController.setTomorrow(false)}
          >
            <MoonIcon />
          </button>
          <button className={ui.secondary} disabled={!can('sleep')} onClick={sleep}>
            {S.sleep}
          </button>
        </div>
      )}
      {confirmSleep && careMode === 'none' && (
        <div className={`${ui.glass} ${css.confirm}`} role="alertdialog" aria-label={S.sleepConfirm}>
          <span>{S.sleepConfirm}</span>
          <button className={ui.secondary} onClick={() => setConfirmSleep(false)}>
            {S.notYet}
          </button>
          <button className={ui.primary} onClick={sleep} autoFocus>
            {S.sleep}
          </button>
        </div>
      )}
      {tooltip && (
        <div className={`${ui.glass} ${css.tip}`} style={{ left: tooltip.x, top: tooltip.y }} key={`${tooltip.x},${tooltip.y}`}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function Dots({ n, max = 3 }: { n: number; max?: number }) {
  return (
    <span className={css.dots} aria-label={`照料点 ${n}`}>
      {Array.from({ length: Math.max(max, n) }, (_, i) => (
        <i key={i} data-on={i < n} />
      ))}
    </span>
  );
}

const WaterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path d="M12 3 C15.5 8 18 11 18 14.5 A6 6 0 0 1 6 14.5 C6 11 8.5 8 12 3Z" fill="var(--c-mist)" />
  </svg>
);
const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path d="M19 14.5 A7.5 7.5 0 1 1 9.5 5 A6 6 0 0 0 19 14.5Z" fill="var(--c-night)" />
  </svg>
);
const BeeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <ellipse cx="12" cy="14" rx="5.5" ry="4.5" fill="var(--c-honey)" />
    <path d="M9.5 10.5 V17.5 M13 10 V18" stroke="var(--c-charcoal)" strokeWidth="1.6" />
    <ellipse cx="9" cy="8" rx="3" ry="2" fill="var(--c-linen)" stroke="var(--c-ink-3)" strokeWidth="0.8" />
    <ellipse cx="15" cy="8" rx="3" ry="2" fill="var(--c-linen)" stroke="var(--c-ink-3)" strokeWidth="0.8" />
  </svg>
);
const ShopIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path d="M4 10 L6 4 H18 L20 10 Z" fill="var(--c-clay)" />
    <rect x="5" y="10" width="14" height="10" rx="2" fill="var(--c-linen-shade)" />
    <rect x="10" y="14" width="4" height="6" rx="1" fill="var(--c-sage)" />
  </svg>
);
const CameraIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <rect x="3" y="7" width="18" height="12" rx="3" fill="var(--c-charcoal)" opacity="0.85" />
    <circle cx="12" cy="13" r="3.4" fill="var(--c-linen)" />
    <rect x="8" y="4.5" width="6" height="3" rx="1" fill="var(--c-charcoal)" opacity="0.85" />
  </svg>
);
const GearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
