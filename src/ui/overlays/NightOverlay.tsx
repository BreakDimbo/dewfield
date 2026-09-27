import { useEffect } from 'react';
import { useAppStore } from '@/state/appStore';
import { gameCfg } from '@/state/config';
import { gameController } from '@/state/controllers/gameController';
import { useUiStore } from '@/state/uiStore';
import { motionScale } from '@/ui/common/motion';
import { S } from '@/ui/strings/zh-CN';
import css from './overlays.module.css';

/** 01 §8 / 02 §7: veil falls, the night holds a beat, then dawn reveals the grown field. Tap skips ahead. */
export function NightOverlay() {
  const phase = useUiStore((s) => s.nightPhase);
  const day = useAppStore((s) => s.home?.day ?? 1);
  useEffect(() => {
    if (phase !== 'dark') return;
    const t = setTimeout(() => gameController.revealMorning(), (gameCfg().anim.nightFade + 700) / motionScale());
    return () => clearTimeout(t);
  }, [phase]);
  return (
    <div className={css.night} data-phase={phase} onClick={() => phase === 'dark' && gameController.revealMorning()}>
      <div className={css.stars} />
      <div className={css.nightText}>
        {phase === 'dark' ? (
          <>
            <h2>{S.nightTitle}</h2>
            <p>{S.nightSub}</p>
          </>
        ) : (
          <h2 className={css.morning}>{S.morningTitle(day)}</h2>
        )}
      </div>
    </div>
  );
}
