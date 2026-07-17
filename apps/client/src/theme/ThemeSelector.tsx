import { Laptop, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from './theme';

const options: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();
  const current = options.find((item) => item.value === preference) ?? options[2]!;
  const Icon = current.icon;
  return <label className={`theme-selector ${compact ? 'compact' : ''}`} title={`Theme: ${current.label}`}>
    <span className="sr-only">Theme</span>
    <span className="theme-selector-icon" aria-hidden="true"><Icon size={16} /></span>
    <select aria-label={`Theme: ${current.label}`} value={preference} onChange={(event) => setPreference(event.target.value as ThemePreference)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}
