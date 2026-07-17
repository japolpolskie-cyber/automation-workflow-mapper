import { describe, expect, it } from 'vitest';
import { EXPORT_THEME_CLASS } from './ComparisonExportPanel';
describe('workflow export theme isolation', () => {
  it('uses a deterministic export-only theme class', () => { expect(EXPORT_THEME_CLASS).toBe('kaizen-export-surface'); });
});
