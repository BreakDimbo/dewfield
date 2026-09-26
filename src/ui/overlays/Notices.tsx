import { useEffect } from 'react';
import { dismissNotice, useAppStore } from '@/state/appStore';
import css from './overlays.module.css';

export function Notices() {
  const notices = useAppStore((s) => s.notices);
  useEffect(() => {
    if (!notices.length) return;
    const timers = notices.map((n) => setTimeout(() => dismissNotice(n.id), 3600));
    return () => timers.forEach(clearTimeout);
  }, [notices]);
  return (
    <div className={css.toasts} role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={css.toast} data-tone={n.tone}>
          {n.text}
        </div>
      ))}
    </div>
  );
}
