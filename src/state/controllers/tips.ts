import { TIPS, type TipId } from '@/core/config/tips';
import { useAppStore } from '@/state/appStore';
import { telemetry } from '@/state/telemetryLogger';
import { useUiStore } from '@/state/uiStore';

/** 02 §11.5: each tip once per save; marked seen immediately, persisted with the next safe-point write. */
export function showTip(id: TipId, vars: Record<string, string> = {}): boolean {
  const home = useAppStore.getState().home;
  if (!home || home.tutorial.seenTips.includes(id)) return false;
  useAppStore.setState({ home: { ...home, tutorial: { ...home.tutorial, seenTips: [...home.tutorial.seenTips, id] } } });
  const text = Object.entries(vars).reduce((t, [k, v]) => t.split(`{${k}}`).join(v), TIPS[id]);
  useUiStore.setState((s) => ({ tips: [...s.tips, { id, text }] }));
  telemetry.log('tip_shown', { tip: id });
  return true;
}

export function dismissTip(): void {
  const [first, ...rest] = useUiStore.getState().tips;
  useUiStore.setState({ tips: rest });
  if (first?.id === 'shop') showTip('sleep');
}

export const tipSeen = (id: TipId): boolean => !!useAppStore.getState().home?.tutorial.seenTips.includes(id);
