// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, getStoredThemePreference, resolveTheme, setThemePreference, THEME_STORAGE_KEY, workflowCanvasThemeTokens } from './theme';
describe('Kaizen theme behavior', () => {
  afterEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); document.documentElement.removeAttribute('data-theme-preference'); document.documentElement.removeAttribute('style'); vi.restoreAllMocks(); });
  it('defaults to system and resolves its preference', () => { expect(getStoredThemePreference()).toBe('system'); expect(resolveTheme('system', true)).toBe('dark'); expect(resolveTheme('system', false)).toBe('light'); });
  it('restores valid preferences and ignores invalid values', () => { localStorage.setItem(THEME_STORAGE_KEY, 'dark'); expect(getStoredThemePreference()).toBe('dark'); localStorage.setItem(THEME_STORAGE_KEY, 'other'); expect(getStoredThemePreference()).toBe('system'); });
  it('applies theme tokens to the root', () => { expect(applyTheme('light')).toBe('light'); expect(document.documentElement.dataset.theme).toBe('light'); expect(applyTheme('dark')).toBe('dark'); expect(document.documentElement.dataset.theme).toBe('dark'); });
  it('exposes workflow canvas colors through semantic CSS tokens', () => { expect(workflowCanvasThemeTokens.grid).toBe('var(--canvas-grid)'); expect(workflowCanvasThemeTokens.minimapMask).toBe('var(--canvas-minimap-mask)'); });
  it('persists an explicit selection', () => { setThemePreference('dark'); expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark'); expect(document.documentElement.dataset.theme).toBe('dark'); });
});
