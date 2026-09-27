import { pickHint } from '@/core/board/hint';
import { DECOR } from '@/core/config/decor';
import { gameCfg } from '@/state/config';
import { useAppStore } from '@/state/appStore';
import { gameController } from '@/state/controllers/gameController';
import { runController } from '@/state/controllers/runController';
import { dismissTip } from '@/state/controllers/tips';
import { usePresentationStore } from '@/state/presentationStore';
import { useRunStore } from '@/state/runStore';
import { useUiStore } from '@/state/uiStore';

export const autoplayStats = { moves: 0, runs: 0 };

/** `?autoplay=1` (03 §16): greedy bot through the whole loop, so choreography consistency is exercised. */
export function startAutoplay(speed = 4): () => void {
  (window as unknown as { __DEWFIELD_AUTOPLAY__: typeof autoplayStats }).__DEWFIELD_AUTOPLAY__ = autoplayStats;
  const id = window.setInterval(() => {
    const app = useAppStore.getState();
    const ui = useUiStore.getState();
    if (ui.tips.length) dismissTip();
    if (app.app === 'title') return gameController.newGame(20260926);
    if (app.app === 'settlement') return gameController.closeSettlement();
    if (app.app === 'brief') return ui.briefReadOnly ? gameController.closeBrief() : gameController.startRun();
    if (app.app === 'hub' && app.home) {
      if (ui.guideRow !== null) return void gameController.waterRow(ui.guideRow);
      if (app.home.commissions.active && app.home.phase === 'morning') return gameController.openBrief();
      const cheap = DECOR.filter((d) => !app.home!.decor.owned.includes(d.id) && d.price <= app.home!.wallet.dewdrop)[0];
      if (cheap && gameController.purchase(cheap.id)) return;
      return gameController.sleep();
    }
    const rs = useRunStore.getState();
    if (app.app !== 'match' || rs.phase !== 'idle' || !rs.run) return;
    const move = rs.guide ?? pickHint(rs.run, gameCfg())?.move;
    if (!move) return;
    runController.commit(move);
    usePresentationStore.setState({ timeScale: speed });
    autoplayStats.moves++;
  }, 120);
  return () => window.clearInterval(id);
}
