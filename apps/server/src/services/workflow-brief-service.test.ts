import { parseCanonicalWorkflowBrief } from '@awm/shared';
import { describe, expect, it } from 'vitest';
import { generateDraftWorkflowBrief, WorkflowBriefService } from './workflow-brief-service.js';

describe('WorkflowBriefService', () => {
  it('returns a validated brief for a valid source requirement', () => {
    const brief = generateDraftWorkflowBrief({ sourceRequirement: 'If payment succeeds, send a receipt; otherwise notify finance.' });
    expect(parseCanonicalWorkflowBrief(brief)).toEqual(brief);
  });

  it('returns validated Wait and Approval suggestions through the isolated service', () => {
    const wait = generateDraftWorkflowBrief({ sourceRequirement: 'Wait until the customer replies.' });
    const approval = generateDraftWorkflowBrief({ sourceRequirement: 'Send the proposal to the manager for approval.' });
    expect(parseCanonicalWorkflowBrief(wait).capabilitySuggestions[0]?.capabilityType).toBe('wait');
    expect(parseCanonicalWorkflowBrief(approval).capabilitySuggestions[0]?.capabilityType).toBe('approval');
  });

  it.each(['', '   '])('rejects empty source requirements', (sourceRequirement) => {
    expect(() => new WorkflowBriefService().generateDraft({ sourceRequirement })).toThrow();
  });

  it('rejects malformed and unknown input fields', () => {
    expect(() => new WorkflowBriefService().generateDraft({ sourceRequirement: 42 })).toThrow();
    expect(() => new WorkflowBriefService().generateDraft({ sourceRequirement: 'Review it.', provider: 'anything' })).toThrow();
  });
});
