import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newHomestead, settleRun, startRun } from '@/core/homestead/homestead';
import { VS_TUNABLES } from '@/core/config/tunables';
import { applyMove } from '@/core/run/run';
import { mv } from '@/core/testkit/runs';
import { SettlementScreen } from './SettlementScreen';

afterEach(cleanup);

function t1Settlement(moves: [number, number, number, number][]) {
  const s = startRun(newHomestead(1, VS_TUNABLES), VS_TUNABLES);
  let run = s.run;
  for (const [a, b, c, d] of moves) {
    const r = applyMove(run, mv(a, b, c, d), VS_TUNABLES);
    if (r.ok) run = r.run;
  }
  return settleRun(s.home, run, VS_TUNABLES, run.status === 'playing').settlement;
}

describe('SettlementScreen (P1-19)', () => {
  it('shows exactly what settleRun computed on a win', () => {
    const st = t1Settlement([
      [6, 5, 6, 6],
      [2, 2, 2, 3],
      [3, 5, 2, 5],
    ]);
    const onClose = vi.fn();
    render(<SettlementScreen settlement={st} commission={{ clientId: 'amai', text: '' }} onClose={onClose} />);
    expect(screen.getByRole('heading', { name: '委托完成' })).toBeTruthy();
    expect(screen.getByTestId('settle-carrot').textContent).toContain('10 / 10');
    expect(screen.getByTestId('settle-total').textContent).toContain(String(st.total));
    expect(screen.getByText(`+${st.tutorialBonus}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '回到露台' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('on abandon shows how many are still missing and that delivered ones count', () => {
    const st = t1Settlement([[6, 5, 6, 6]]);
    render(<SettlementScreen settlement={st} commission={{ clientId: 'amai', text: '' }} onClose={() => {}} />);
    expect(screen.getByTestId('settle-carrot').textContent).toContain('3 / 10');
    expect(screen.getByText('还差 7 个，交了的都算数。')).toBeTruthy();
    expect(screen.queryByText('委托报酬')).toBeNull();
  });
});
