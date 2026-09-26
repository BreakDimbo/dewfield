import { DECOR } from '@/core/config/decor';
import { terraceLevel } from '@/core/homestead/decor';
import { useAppStore } from '@/state/appStore';
import { gameCfg } from '@/state/config';
import { gameController } from '@/state/controllers/gameController';
import { useUiStore } from '@/state/uiStore';
import { DewIcon } from '@/ui/common/CropIcon';
import ui from '@/ui/common/ui.module.css';
import { S } from '@/ui/strings/zh-CN';
import css from './shop.module.css';

const EFFECT: Record<string, string> = {
  extraMoves: '每局 +1 步',
  unlockCare: '解锁「放蜂」',
  carePointsMax: '每天照料点 +1',
  rushBonus: '丰收时刻 +2 把镰刀',
};

/** P2-13: three card states — locked / buyable / owned. */
export function ShopPanel() {
  const home = useAppStore((s) => s.home);
  const last = useUiStore((s) => s.lastPurchase);
  if (!home) return null;
  const level = terraceLevel(home, gameCfg());
  return (
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-labelledby="shop-title">
      <div className={ui.scrim} onClick={() => gameController.openPanel('none')} />
      <div className={`${ui.card} ${css.panel}`}>
        <header className={css.head}>
          <div>
            <h2 id="shop-title" className={`${ui.display} ${css.title}`}>
              {S.shop}
            </h2>
            <p className={css.sub}>{S.terraceLevel(level)}</p>
          </div>
          <div className={css.wallet}>
            <DewIcon /> <b className={ui.num}>{home.wallet.dewdrop}</b>
          </div>
        </header>
        <ul className={css.grid}>
          {DECOR.map((d) => {
            const owned = home.decor.owned.includes(d.id);
            const locked = d.level > level;
            const poor = home.wallet.dewdrop < d.price;
            const state = owned ? 'owned' : locked ? 'locked' : 'open';
            return (
              <li key={d.id} className={css.item} data-state={state} data-fresh={last?.id === d.id} data-testid={`decor-${d.id}`}>
                <span className={css.swatch} data-id={d.id} aria-hidden />
                <div className={css.body}>
                  <b>{d.name}</b>
                  <span className={css.blurb}>{d.blurb}</span>
                  {d.effect && <span className={css.effect}>{EFFECT[d.effect.type]}</span>}
                </div>
                {owned ? (
                  <span className={css.owned}>{S.owned}</span>
                ) : locked ? (
                  <span className={css.lock}>{S.needLevel(d.level)}</span>
                ) : (
                  <button className={ui.primary} disabled={poor} onClick={() => gameController.purchase(d.id)}>
                    <DewIcon size={16} />
                    <span className={ui.num}>{d.price}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <button className={`${ui.secondary} ${css.close}`} onClick={() => gameController.openPanel('none')}>
          {S.close}
        </button>
      </div>
    </div>
  );
}
