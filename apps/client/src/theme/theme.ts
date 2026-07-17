import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;
export const THEME_STORAGE_KEY = 'awm.themePreference';
export const THEME_EVENT = 'awm-theme-change';

export const workflowCanvasThemeTokens = {
  grid: 'var(--canvas-grid)',
  minimapNode: 'var(--canvas-minimap-node)',
  minimapMask: 'var(--canvas-minimap-mask)',
} as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}
export function getStoredThemePreference(storage: Pick<Storage, 'getItem'> = localStorage): ThemePreference {
  const value = storage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : 'system';
}
export function systemPrefersDark(): boolean { return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches; }
export function resolveTheme(preference: ThemePreference, matchesDark = systemPrefersDark()): ResolvedTheme {
  return preference === 'system' ? (matchesDark ? 'dark' : 'light') : preference;
}
export function applyTheme(preference: ThemePreference, root: HTMLElement = document.documentElement, matchesDark?: boolean): ResolvedTheme {
  const resolved = resolveTheme(preference, matchesDark);
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  return resolved;
}
export function setThemePreference(preference: ThemePreference): void {
  localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyTheme(preference);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: preference }));
}
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getStoredThemePreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(preference));
  useEffect(() => {
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const update = () => setResolvedTheme(applyTheme(preference, document.documentElement, media?.matches ?? false));
    const onPreferenceChange = (event: Event) => {
      const next = (event as CustomEvent<ThemePreference>).detail;
      if (isThemePreference(next)) setPreferenceState(next);
    };
    update();
    media?.addEventListener('change', update);
    window.addEventListener(THEME_EVENT, onPreferenceChange);
    return () => { media?.removeEventListener('change', update); window.removeEventListener(THEME_EVENT, onPreferenceChange); };
  }, [preference]);
  return { preference, resolvedTheme, setPreference: (next: ThemePreference) => { setPreferenceState(next); setThemePreference(next); } };
}
