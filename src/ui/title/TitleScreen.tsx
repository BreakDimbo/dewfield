import { useState } from 'react';
import { S } from '@/ui/strings/zh-CN';
import ui from '@/ui/common/ui.module.css';
import css from './title.module.css';

export function TitleScreen({
  onStart,
  onContinue,
  hasSave,
  build,
}: {
  onStart: () => void;
  onContinue: () => void;
  hasSave: boolean;
  build: string;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={css.root}>
      <div className={css.veil} />
      <header className={css.brand}>
        <span className={css.mark} aria-hidden>
          <svg viewBox="0 0 40 40" width="40" height="40">
            <path d="M20 5 C26 13 30 18.5 30 24 A10 10 0 0 1 10 24 C10 18.5 14 13 20 5Z" fill="var(--c-mist)" />
            <path d="M15.5 24.5 A4.5 4.5 0 0 0 20 29" stroke="var(--c-white)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </svg>
        </span>
        <h1 className={`${ui.display} ${css.title}`}>{S.brand}</h1>
        <p className={css.en}>{S.brandEn}</p>
      </header>
      <div className={css.intro}>
        {S.intro.map((line, i) => (
          <p key={line} style={{ animationDelay: `${420 + i * 260}ms` }}>
            {line}
          </p>
        ))}
      </div>
      <div className={css.actions}>
        {hasSave ? (
          <>
            <button className={`${ui.primary} ${css.start}`} onClick={onContinue} autoFocus>
              {S.continue}
            </button>
            {confirming ? (
              <span className={css.confirm}>
                {S.newGameConfirm}
                <button className={ui.secondary} onClick={onStart}>
                  {S.newGame}
                </button>
                <button className={ui.secondary} onClick={() => setConfirming(false)}>
                  {S.cancel}
                </button>
              </span>
            ) : (
              <button className={ui.secondary} onClick={() => setConfirming(true)}>
                {S.newGame}
              </button>
            )}
          </>
        ) : (
          <button className={`${ui.primary} ${css.start}`} onClick={onStart} autoFocus>
            {S.start}
          </button>
        )}
      </div>
      <footer className={css.footer}>{S.version(build)}</footer>
    </div>
  );
}
