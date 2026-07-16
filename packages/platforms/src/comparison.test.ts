import { leadQualificationWorkflow } from '@awm/shared';
import { describe, expect, it } from 'vitest';
import { comparePlatforms, generateImplementationChecklist, generateImplementationMarkdown } from './index.js';

describe('comparison and documentation exports', () => {
  it('compares all supported platforms and recommends the highest score', () => {
    const result = comparePlatforms(leadQualificationWorkflow);
    expect(result.entries.map((entry) => entry.platform).sort()).toEqual(['make', 'n8n', 'zapier']);
    expect(result.entries[0]?.platform).toBe(result.recommendedPlatform);
    expect(result.entries[0]?.score).toBeGreaterThanOrEqual(result.entries[1]?.score ?? 0);
  });

  it('creates a reviewable technical handoff and checklist', () => {
    const handoff = generateImplementationMarkdown(leadQualificationWorkflow, 'n8n');
    const checklist = generateImplementationChecklist(leadQualificationWorkflow, 'n8n');
    expect(handoff).toContain(leadQualificationWorkflow.name);
    expect(handoff).toContain('Draft export — review required');
    expect(handoff).toContain('## Testing plan');
    expect(checklist).toContain('implementation checklist');
    expect(checklist).toContain('- [ ]');
  });
});
