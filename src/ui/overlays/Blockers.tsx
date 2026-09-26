import { useUiStore } from '@/state/uiStore';
import ui from '@/ui/common/ui.module.css';
import { S } from '@/ui/strings/zh-CN';

/** 02 §12.8 tab lock and 03 §12 WebGL context loss: full-screen, calm, one action. */
export function Blockers() {
  const locked = useUiStore((s) => s.locked);
  const lost = useUiStore((s) => s.contextLost);
  if (!locked && !lost) return null;
  return (
    <div className={ui.overlay} role="alertdialog" aria-modal="true" style={{ zIndex: 60 }}>
      <div className={ui.scrim} />
      <div className={ui.card} style={{ textAlign: 'center' }}>
        <h2 className={ui.display} style={{ margin: '0 0 12px' }}>
          {lost ? S.contextLostTitle : S.lockedTitle}
        </h2>
        <p style={{ margin: '0 0 20px', color: 'var(--c-ink-2)' }}>{lost ? S.contextLostBody : S.lockedBody}</p>
        <button className={ui.primary} onClick={() => location.reload()}>
          {S.reload}
        </button>
      </div>
    </div>
  );
}
