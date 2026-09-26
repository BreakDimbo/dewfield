import type { ActiveCommission } from '@/core/commission/types';
import { CLIENTS } from '@/core/config/clients';
import { CROP_BY_ID } from '@/core/config/crops';
import { CropIcon } from '@/ui/common/CropIcon';
import ui from '@/ui/common/ui.module.css';
import { S } from '@/ui/strings/zh-CN';
import css from './hub.module.css';

export function CommissionCard({
  commission,
  extraMoves,
  onStart,
  onClose,
  readOnly = false,
}: {
  commission: ActiveCommission;
  extraMoves: number;
  onStart: () => void;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const client = CLIENTS[commission.clientId];
  return (
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-labelledby="brief-title">
      <div className={ui.scrim} onClick={onClose} />
      <div className={`${ui.card} ${css.brief}`}>
        <div className={css.briefHead}>
          <span className={css.avatar} style={{ background: client.tint }} aria-hidden>
            {client.name.slice(0, 1)}
          </span>
          <div>
            <h2 id="brief-title" className={`${ui.display} ${css.briefName}`}>
              {client.name}
            </h2>
            <p className={css.briefShop}>{client.shop}</p>
          </div>
        </div>
        <blockquote className={css.quote}>“{commission.text}”</blockquote>
        <ul className={css.order}>
          {commission.items.map((it) => {
            const d = commission.delivered[it.crop] ?? 0;
            return (
              <li key={it.crop}>
                <CropIcon crop={it.crop} size={30} />
                <span>{CROP_BY_ID[it.crop].name}</span>
                <b className={ui.num}>{d > 0 ? `${d} / ${it.count}` : `× ${it.count}`}</b>
              </li>
            );
          })}
        </ul>
        <p className={css.movesLine}>{S.movesN(commission.moves + extraMoves)}</p>
        {readOnly ? (
          <button className={ui.primary} style={{ width: '100%' }} onClick={onClose} autoFocus>
            {S.goWater}
          </button>
        ) : (
          <div className={css.briefActions}>
            <button className={ui.secondary} onClick={onClose}>
              {S.close}
            </button>
            <button className={ui.primary} onClick={onStart} autoFocus>
              {S.startRun}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
