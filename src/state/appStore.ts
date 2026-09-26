import { create } from 'zustand';
import type { AppState } from '@/core/flow/appFsm';
import type { Settlement } from '@/core/homestead/homestead';
import type { HomesteadState } from '@/core/homestead/state';

export interface Settings {
  reducedMotion: boolean;
  volume: { master: number; music: number; sfx: number };
  quality: 'auto' | 'high' | 'low';
}

export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'warn';
}

export interface AppStore {
  app: AppState;
  home: HomesteadState | null;
  settings: Settings;
  settlement: Settlement | null;
  notices: Notice[];
}

export const DEFAULT_SETTINGS: Settings = {
  reducedMotion: false,
  volume: { master: 0.8, music: 0.6, sfx: 0.8 },
  quality: 'auto',
};

export const useAppStore = create<AppStore>(() => ({
  app: 'boot',
  home: null,
  settings: DEFAULT_SETTINGS,
  settlement: null,
  notices: [],
}));

let noticeId = 0;
export function pushNotice(text: string, tone: Notice['tone'] = 'info'): void {
  const n = { id: ++noticeId, text, tone };
  useAppStore.setState((s) => ({ notices: [...s.notices.slice(-2), n] }));
}
export function dismissNotice(id: number): void {
  useAppStore.setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
}
