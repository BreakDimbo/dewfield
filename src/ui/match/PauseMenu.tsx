import { runController } from '@/state/controllers/runController';
import ui from '@/ui/common/ui.module.css';
import { S } from '@/ui/strings/zh-CN';
import css from './match.module.css';

export function PauseMenu() {
  return (
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-label={S.pause}>
      <div className={ui.scrim} onClick={() => runController.setPaused(false)} />
      <div className={ui.card}>
        <h2 className={`${ui.display} ${css.pauseTitle}`}>{S.pause}</h2>
        <div className={css.pauseActions}>
          <button className={ui.primary} autoFocus onClick={() => runController.setPaused(false)}>
            {S.resume}
          </button>
          <button className={ui.secondary} onClick={() => runController.abandon()}>
            {S.abandon}
          </button>
        </div>
        <p className={css.pauseHint}>{S.abandonHint}</p>
      </div>
    </div>
  );
}
