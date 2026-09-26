import { useState } from 'react';
import { useAppStore } from '@/state/appStore';
import { gameController } from '@/state/controllers/gameController';
import { useUiStore } from '@/state/uiStore';
import ui from '@/ui/common/ui.module.css';
import { S } from '@/ui/strings/zh-CN';
import css from './overlays.module.css';

/** P2-20: hide the HUD, three poses, PNG with the "晨露田园 · 第 N 天" watermark. */
export function PhotoMode({ capture }: { capture: (watermark: string) => Promise<string> }) {
  const pose = useUiStore((s) => s.photoPose);
  const day = useAppStore((s) => s.home?.day ?? 1);
  const [flash, setFlash] = useState(0);
  const shoot = async () => {
    const url = await capture(S.watermark(day));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dewfield-day${day}.png`;
    a.click();
    gameController.logPhoto();
    setFlash((n) => n + 1);
  };
  return (
    <div className={css.photo}>
      {flash > 0 && <div key={flash} className={css.flash} />}
      <div className={`${ui.glass} ${css.photoBar}`}>
        {([0, 1, 2] as const).map((p) => (
          <button key={p} className={pose === p ? ui.primary : ui.secondary} onClick={() => gameController.setPhotoPose(p)}>
            {S.poseName[p]}
          </button>
        ))}
        <button className={ui.primary} onClick={shoot} aria-label={S.shoot}>
          {S.shoot}
        </button>
        <button className={ui.secondary} onClick={() => gameController.exitPhoto()}>
          {S.close}
        </button>
      </div>
    </div>
  );
}
