import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES } from '@/core/config/tunables';
import { newHomestead } from '@/core/homestead/homestead';
import { useAppStore } from '@/state/appStore';
import { useUiStore } from '@/state/uiStore';
import { S } from '@/ui/strings/zh-CN';
import { HubHud } from './HubHud';

beforeEach(() => {
  useAppStore.setState({ app: 'hub', home: newHomestead(1, DEFAULT_TUNABLES) });
  useUiStore.setState({ tomorrow: false, careMode: 'none' });
});
afterEach(() => {
  cleanup();
  useAppStore.setState({ app: 'boot', home: null });
});

describe('HubHud tomorrow preview (P2-19)', () => {
  it('holds while pressed, releases on up and on cancel, never touches home', () => {
    const home = useAppStore.getState().home;
    render(<HubHud />);
    const moon = screen.getByRole('button', { name: S.tomorrow });
    fireEvent.pointerDown(moon);
    expect(useUiStore.getState().tomorrow).toBe(true);
    fireEvent.pointerUp(moon);
    expect(useUiStore.getState().tomorrow).toBe(false);
    fireEvent.pointerDown(moon);
    fireEvent.pointerCancel(moon);
    expect(useUiStore.getState().tomorrow).toBe(false);
    expect(fireEvent.contextMenu(moon)).toBe(false);
    expect(useAppStore.getState().home).toBe(home);
  });
});

describe('HubHud bee button (P2-14)', () => {
  it('shows the unlock condition visibly while the hive is not bought', () => {
    render(<HubHud />);
    expect(screen.getByText(S.beeLocked)).toBeTruthy();
  });
});
