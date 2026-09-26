import { dismissTip } from '@/state/controllers/tips';
import { useUiStore } from '@/state/uiStore';
import ui from '@/ui/common/ui.module.css';
import { S } from '@/ui/strings/zh-CN';
import css from './overlays.module.css';

/** 02 §16.5 contextual tip, one at a time. */
export function TipCard() {
  const tip = useUiStore((s) => s.tips[0]);
  if (!tip) return null;
  return (
    <div className={`${ui.glass} ${css.tipCard}`} role="status" key={tip.id} data-testid={`tip-${tip.id}`}>
      <span className={css.tipMark} aria-hidden>
        ✿
      </span>
      <p>{tip.text}</p>
      <button className={ui.secondary} onClick={dismissTip} autoFocus>
        {S.gotIt}
      </button>
    </div>
  );
}
