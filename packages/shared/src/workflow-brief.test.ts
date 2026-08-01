import { describe, expect, it } from 'vitest';
import { websiteEnquiryWorkflowBrief } from './workflow-brief.fixtures.js';
import { canonicalWorkflowBriefSchema, parseCanonicalWorkflowBrief, safeParseCanonicalWorkflowBrief, type CanonicalWorkflowBrief } from './workflow-brief.js';

const minimumBrief = (): CanonicalWorkflowBrief => ({
  schemaVersion: '1.0' as const,
  id: 'brief-1',
  name: 'Minimum brief',
  summary: 'Complete one business task.',
  objective: 'Complete the requested task.',
  sourceRequirement: 'When work arrives, complete it.',
  actors: [],
  applications: [],
  triggers: [{ id: 'trigger-1', name: 'Work received', description: 'Work becomes available.', triggerType: 'event' as const }],
  actions: [{ id: 'action-1', name: 'Complete work', description: 'Complete the requested work.', inputs: [], outputs: [] }],
  assumptions: [],
  missingInformation: [],
  warnings: [],
  completionCriteria: [],
});

describe('canonical Workflow Brief schema', () => {
  it('parses a minimum valid brief without inventing defaults', () => {
    expect(parseCanonicalWorkflowBrief(minimumBrief())).toEqual(minimumBrief());
  });

  it('parses the complete business-level website enquiry fixture', () => {
    expect(canonicalWorkflowBriefSchema.parse(websiteEnquiryWorkflowBrief)).toEqual(websiteEnquiryWorkflowBrief);
    expect(JSON.stringify(websiteEnquiryWorkflowBrief)).not.toMatch(/n8n|make\.com|zapier|nodeType/i);
  });

  it.each(['actors', 'applications', 'triggers', 'actions'] as const)('rejects duplicate IDs within %s', (collection) => {
    const brief = minimumBrief();
    if (collection === 'actors') brief.actors = [{ id: 'duplicate', name: 'First', role: 'Owner' }, { id: 'duplicate', name: 'Second', role: 'Reviewer' }];
    if (collection === 'applications') brief.applications = [{ id: 'duplicate', name: 'First', explicitlyMentioned: true }, { id: 'duplicate', name: 'Second', explicitlyMentioned: false }];
    if (collection === 'triggers') brief.triggers.push({ ...brief.triggers[0]! });
    if (collection === 'actions') brief.actions.push({ ...brief.actions[0]! });
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(false);
  });

  it('requires at least one trigger', () => {
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), triggers: [] }).success).toBe(false);
  });

  it('requires at least one action', () => {
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), actions: [] }).success).toBe(false);
  });

  it('rejects unknown application references from triggers and actions', () => {
    const triggerResult = safeParseCanonicalWorkflowBrief({ ...minimumBrief(), triggers: [{ ...minimumBrief().triggers[0], applicationId: 'missing-app' }] });
    const actionResult = safeParseCanonicalWorkflowBrief({ ...minimumBrief(), actions: [{ ...minimumBrief().actions[0], applicationId: 'missing-app' }] });
    expect(triggerResult.success).toBe(false);
    expect(actionResult.success).toBe(false);
  });

  it('rejects an unknown actor reference', () => {
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), actions: [{ ...minimumBrief().actions[0], actorId: 'missing-actor' }] }).success).toBe(false);
  });

  it('rejects unknown fields on the brief and nested objects', () => {
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), unexpected: true }).success).toBe(false);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), actors: [{ id: 'actor-1', name: 'Owner', role: 'Owner', unexpected: true }] }).success).toBe(false);
  });

  it('rejects platform-specific implementation fields', () => {
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), platform: 'n8n' }).success).toBe(false);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), actions: [{ ...minimumBrief().actions[0], zapierAction: 'Create Record' }] }).success).toBe(false);
  });

  it.each([
    ['brief id', { id: '   ' }],
    ['brief name', { name: '' }],
    ['objective', { objective: ' ' }],
  ])('rejects an empty %s', (_label, replacement) => {
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), ...replacement }).success).toBe(false);
  });

  it('rejects empty nested IDs and names', () => {
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), triggers: [{ ...minimumBrief().triggers[0], id: '' }] }).success).toBe(false);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), actions: [{ ...minimumBrief().actions[0], name: ' ' }] }).success).toBe(false);
  });
});
