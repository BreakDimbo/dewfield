import { lazy, Suspense, useEffect, useState } from 'react';
import { browserTabLockDeps, createTabLock } from '@/platform/tabLock';
import { now } from '@/platform/clock';
import { contextLost, fieldRuntime, photoApi, renderStats } from '@/render/runtime';
import { Stage } from '@/render/Stage';
import { useAppStore } from '@/state/appStore';
import { gameController } from '@/state/controllers/gameController';
import { useRunStore } from '@/state/runStore';
import { telemetry } from '@/state/telemetryLogger';
import { useUiStore } from '@/state/uiStore';
import { CommissionCard } from '@/ui/hub/CommissionCard';
import { HubHud } from '@/ui/hub/HubHud';
import { MatchHud } from '@/ui/match/MatchHud';
import { Blockers } from '@/ui/overlays/Blockers';
import { NightOverlay } from '@/ui/overlays/NightOverlay';
import { Notices } from '@/ui/overlays/Notices';
import { PhotoMode } from '@/ui/overlays/PhotoMode';
import { TipCard } from '@/ui/overlays/TipCard';
import { SettingsPanel } from '@/ui/settings/SettingsPanel';
import { SettlementScreen } from '@/ui/settlement/SettlementScreen';
import { ShopPanel } from '@/ui/shop/ShopPanel';
import { TitleScreen } from '@/ui/title/TitleScreen';
import { installAudio } from './audio';
import { installTestHooks } from './testHooks';

const params = new URLSearchParams(location.search);
const DebugPanel = lazy(() => import('@/debug/DebugPanel'));

function seedFromUrl(): number {
  const s = params.get('seed');
  return s !== null && import.meta.env.DEV ? Number(s) >>> 0 : now() >>> 0;
}

function installPlatform(): void {
  const tabId = `${now().toString(36)}${Math.floor(performance.now()).toString(36)}`;
  createTabLock(tabId, browserTabLockDeps(now), () => gameController.lockedByOtherTab());
  contextLost.handler = () => useUiStore.setState({ contextLost: true });
  const stop = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('visibilitychange', () => {
    const rt = fieldRuntime.current;
    if (rt) rt.choreo.frozen = document.hidden;
  });
}

export function App() {
  const app = useAppStore((s) => s.app);
  const settlement = useAppStore((s) => s.settlement);
  const home = useAppStore((s) => s.home);
  const panel = useUiStore((s) => s.panel);
  const readOnly = useUiStore((s) => s.briefReadOnly);
  const paused = useRunStore((s) => s.paused);
  const lastCommission = useRunStore((s) => s.run?.commission);
  const [commissionAtEnd, setCommissionAtEnd] = useState(lastCommission);

  useEffect(() => {
    telemetry.start({
      build: __BUILD__,
      ua: navigator.userAgent,
      dpr: window.devicePixelRatio,
      quality: useAppStore.getState().settings.quality,
      w: window.innerWidth,
      h: window.innerHeight,
    });
    gameController.boot();
    installAudio();
    installPlatform();
    if (import.meta.env.DEV && params.has('e2e')) installTestHooks();
    if (import.meta.env.DEV && params.has('autoplay')) void import('@/debug/autoplay').then((m) => m.startAutoplay());
    if (params.has('bench')) void import('@/debug/bench').then((m) => m.startBench());
    (window as unknown as { __DEWFIELD_STATS__: unknown }).__DEWFIELD_STATS__ = renderStats;
  }, []);

  useEffect(() => {
    if (lastCommission) setCommissionAtEnd(lastCommission);
  }, [lastCommission]);

  return (
    <>
      <Stage />
      {app !== 'photo' && <div className="vignette" aria-hidden />}
      {app === 'title' && (
        <TitleScreen
          build={__BUILD__}
          hasSave={gameController.hasSave()}
          onStart={() => gameController.newGame(seedFromUrl())}
          onContinue={() => gameController.continueGame()}
        />
      )}
      {(app === 'match' || app === 'toMatch') && <MatchHud onSkip={() => fieldRuntime.current?.choreo.skip()} />}
      {app === 'settlement' && settlement && commissionAtEnd && (
        <SettlementScreen settlement={settlement} commission={commissionAtEnd} onClose={() => gameController.closeSettlement()} />
      )}
      {(app === 'hub' || app === 'brief') && <HubHud />}
      {app === 'brief' && home?.commissions.active && (
        <CommissionCard
          commission={home.commissions.active}
          extraMoves={gameController.extraMoves()}
          readOnly={readOnly}
          onStart={() => gameController.startRun()}
          onClose={() => gameController.closeBrief()}
        />
      )}
      {app === 'hub' && panel === 'shop' && <ShopPanel />}
      {panel === 'settings' && <SettingsPanel onClose={() => gameController.openPanel('none')} />}
      {app === 'photo' && <PhotoMode capture={(w) => photoApi.capture?.(w) ?? Promise.resolve('')} />}
      {app === 'night' && <NightOverlay />}
      {(app === 'hub' || app === 'match' || app === 'toHub') && panel === 'none' && !paused && <TipCard />}
      <Notices />
      <Blockers />
      {params.has('debug') && (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      )}
    </>
  );
}
