import type { Settlement } from '@/core/homestead/homestead';
import type { ActiveCommission } from '@/core/commission/types';
import { CropIcon, DewIcon } from '@/ui/common/CropIcon';
import ui from '@/ui/common/ui.module.css';
import { CLIENT_LINE, S } from '@/ui/strings/zh-CN';
import css from './settlement.module.css';

export interface SettlementProps {
  settlement: Settlement;
  commission: Pick<ActiveCommission, 'clientId' | 'text'>;
  onClose: () => void;
}

export function SettlementScreen({ settlement: s, commission, onClose }: SettlementProps) {
  const won = s.result === 'won';
  const missing = s.items.reduce((n, it) => n + (it.count - it.delivered), 0);
  const rows: [string, number][] = [
    [S.unripe, s.unripeDewdrops],
    [S.surplus, s.surplusValue],
    [S.baseReward, s.baseReward],
    [S.starBonus, s.starBonus],
    [S.tutorialBonus, s.tutorialBonus],
  ];
  return (
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-labelledby="settle-title">
      <div className={ui.scrim} />
      <div className={`${ui.card} ${css.card}`} data-won={won}>
        <p className={css.client}>{CLIENT_LINE[commission.clientId]}</p>
        <h2 id="settle-title" className={`${ui.display} ${css.title}`}>
          {won ? S.won : s.result === 'abandoned' ? S.abandoned : S.lost}
        </h2>
        {won && s.stars !== null && (
          <div className={css.stars} aria-label={`${s.stars} 星`}>
            {[1, 2, 3].map((k) => (
              <span key={k} className={css.star} data-on={k <= s.stars!} style={{ animationDelay: `${300 + k * 160}ms` }}>
                ★
              </span>
            ))}
          </div>
        )}
        <ul className={css.items}>
          {s.items.map((it) => (
            <li key={it.crop} data-testid={`settle-${it.crop}`}>
              <CropIcon crop={it.crop} size={26} />
              <span className={`${ui.num} ${css.count}`}>{S.deliveredOf(it.delivered, it.count)}</span>
              <span className={css.bar}>
                <span style={{ width: `${(100 * it.delivered) / it.count}%` }} />
              </span>
            </li>
          ))}
        </ul>
        {s.autoCompleted ? <p className={css.need}>{S.autoComplete}</p> : !won && <p className={css.need}>{S.stillNeed(missing)}</p>}
        <dl className={css.ledger}>
          {rows
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={ui.num}>+{v}</dd>
              </div>
            ))}
          <div className={css.total}>
            <dt>{S.total}</dt>
            <dd className={ui.num} data-testid="settle-total">
              <DewIcon size={18} /> {s.total}
            </dd>
          </div>
        </dl>
        <button className={`${ui.primary} ${css.cta}`} onClick={onClose} autoFocus>
          {S.backToField}
        </button>
      </div>
    </div>
  );
}
