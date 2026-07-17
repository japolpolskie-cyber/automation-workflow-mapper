// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeSelector } from './ThemeSelector';
vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
describe('ThemeSelector', () => {
  it('provides a compact keyboard-accessible brand-neutral theme control', () => {
    render(<ThemeSelector compact />);
    expect(screen.getByRole('combobox', { name: 'Theme: System' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Light' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Dark' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'System' })).toBeTruthy();
  });
});
