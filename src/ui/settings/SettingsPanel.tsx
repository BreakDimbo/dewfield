import { useState } from 'react';
import { useAppStore } from '@/state/appStore';
import { gameController } from '@/state/controllers/gameController';
import { persistence } from '@/state/persistence';
import ui from '@/ui/common/ui.module.css';
import { S } from '@/ui/strings/zh-CN';
import css from './settings.module.css';

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** P2-16: volumes, reduced motion (RD-8), quality, reset (double confirm), corrupt-save export. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useAppStore((s) => s.settings);
  const [confirm, setConfirm] = useState(0);
  const corrupt = persistence.corruptSaves();
  const slider = (key: 'master' | 'music' | 'sfx', label: string) => (
    <label className={css.row}>
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={settings.volume[key]}
        aria-label={label}
        onChange={(e) => gameController.updateSettings({ volume: { ...settings.volume, [key]: Number(e.target.value) } })}
      />
      <span className={`${ui.num} ${css.val}`}>{Math.round(settings.volume[key] * 100)}</span>
    </label>
  );
  return (
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className={ui.scrim} onClick={onClose} />
      <div className={`${ui.card} ${css.panel}`}>
        <h2 id="settings-title" className={`${ui.display} ${css.title}`}>
          {S.settings}
        </h2>
        <section className={css.group}>
          {slider('master', S.volMaster)}
          {slider('music', S.volMusic)}
          {slider('sfx', S.volSfx)}
        </section>
        <section className={css.group}>
          <label className={css.row}>
            <span>{S.reducedMotion}</span>
            <input
              type="checkbox"
              role="switch"
              className={css.switch}
              checked={settings.reducedMotion}
              onChange={(e) => gameController.updateSettings({ reducedMotion: e.target.checked })}
            />
          </label>
          <div className={css.row}>
            <span>{S.quality}</span>
            <div className={css.seg} role="radiogroup" aria-label={S.quality}>
              {(['auto', 'high', 'low'] as const).map((q) => (
                <button key={q} role="radio" aria-checked={settings.quality === q} data-on={settings.quality === q} onClick={() => gameController.updateSettings({ quality: q })}>
                  {S.qualityName[q]}
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className={css.group}>
          {corrupt.length > 0 && (
            <button className={ui.secondary} onClick={() => download('dewfield-corrupt-saves.json', JSON.stringify(corrupt, null, 2))}>
              {S.exportCorrupt(corrupt.length)}
            </button>
          )}
          <button
            className={`${ui.secondary} ${css.danger}`}
            onClick={() => {
              if (confirm < 1) return setConfirm(1);
              gameController.resetSave();
              onClose();
            }}
          >
            {confirm ? S.resetConfirm : S.reset}
          </button>
        </section>
        <button className={`${ui.primary} ${css.done}`} onClick={onClose}>
          {S.done}
        </button>
      </div>
    </div>
  );
}
