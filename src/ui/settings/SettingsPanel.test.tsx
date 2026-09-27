import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, useAppStore } from '@/state/appStore';
import { useMotionAttr } from '@/ui/common/motion';
import { S } from '@/ui/strings/zh-CN';
import { SettingsPanel } from './SettingsPanel';

afterEach(() => {
  cleanup();
  useAppStore.setState({ settings: DEFAULT_SETTINGS });
});

function Harness() {
  useMotionAttr();
  return <SettingsPanel onClose={() => {}} />;
}

describe('SettingsPanel reduced motion (P2-16)', () => {
  it('toggling the switch mirrors the setting onto <html data-rm>', () => {
    render(<Harness />);
    expect(document.documentElement.dataset.rm).toBe('0');
    const sw = screen.getByRole('switch', { name: S.reducedMotion });
    fireEvent.click(sw);
    expect(useAppStore.getState().settings.reducedMotion).toBe(true);
    expect(document.documentElement.dataset.rm).toBe('1');
    fireEvent.click(sw);
    expect(document.documentElement.dataset.rm).toBe('0');
  });
});
