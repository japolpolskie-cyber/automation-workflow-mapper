import { describe, expect, it } from 'vitest';
import { aiChatbotDraftWorkflowBrief, departmentRoutingWorkflowBrief, leadFollowUpWorkflowBrief, lockedDepartmentRoutingWorkflowBrief, websiteEnquiryWorkflowBrief } from './workflow-brief.fixtures.js';
import { canonicalWorkflowBriefSchema, parseCanonicalWorkflowBrief, safeParseCanonicalWorkflowBrief, workflowBriefConfidenceSchema, type CanonicalWorkflowBrief } from './workflow-brief.js';

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
  routes: [],
  decisions: [],
  loops: [],
  waits: [],
  approvals: [],
  merges: [],
  iterators: [],
  aggregators: [],
  evidence: [],
  confidence: [],
  clarificationQuestions: [],
  reviewDecisions: [],
  capabilitySuggestions: [],
  reviewState: { status: 'draft', version: 1, notes: [] },
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

  it('accepts a binary decision with TRUE and FALSE routes', () => {
    const brief = minimumBrief();
    brief.actions.push({ id: 'action-2', name: 'Alternate work', description: 'Complete alternate work.', inputs: [], outputs: [] });
    brief.routes = [
      { id: 'true-route', decisionId: 'decision-1', label: 'TRUE', condition: 'The condition is true.', outcomeDescription: 'Complete normal work.', targetActionId: 'action-1', isFallback: false },
      { id: 'false-route', decisionId: 'decision-1', label: 'FALSE', condition: 'The condition is false.', outcomeDescription: 'Complete alternate work.', targetActionId: 'action-2', isFallback: false },
    ];
    brief.decisions = [{ id: 'decision-1', name: 'Evaluate condition', description: 'Choose the matching outcome.', decisionType: 'binary', conditionDescription: 'Is the condition true?', routeIds: ['true-route', 'false-route'] }];
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(true);
  });

  it('accepts the semantic multi-route department fixture and rejects generic labels', () => {
    expect(safeParseCanonicalWorkflowBrief(departmentRoutingWorkflowBrief).success).toBe(true);
    const generic = structuredClone(departmentRoutingWorkflowBrief);
    generic.routes[0]!.label = 'Output 1';
    expect(safeParseCanonicalWorkflowBrief(generic).success).toBe(false);
  });

  it('rejects orphan routes and duplicate fallbacks', () => {
    const orphan = structuredClone(departmentRoutingWorkflowBrief);
    orphan.decisions[0]!.routeIds = orphan.decisions[0]!.routeIds.slice(1);
    expect(safeParseCanonicalWorkflowBrief(orphan).success).toBe(false);
    const duplicateFallback = structuredClone(departmentRoutingWorkflowBrief);
    duplicateFallback.routes[0]!.isFallback = true;
    duplicateFallback.routes[1]!.isFallback = true;
    duplicateFallback.decisions[0]!.fallbackRouteId = duplicateFallback.routes[0]!.id;
    expect(safeParseCanonicalWorkflowBrief(duplicateFallback).success).toBe(false);
  });

  it.each([1, 3])('rejects a binary decision with %s routes', (count) => {
    const brief = structuredClone(departmentRoutingWorkflowBrief);
    brief.decisions[0]!.decisionType = 'binary';
    brief.decisions[0]!.routeIds = brief.decisions[0]!.routeIds.slice(0, count);
    brief.routes = brief.routes.slice(0, count);
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(false);
  });

  it('accepts a bounded retry and rejects one without maximumIterations', () => {
    expect(safeParseCanonicalWorkflowBrief(leadFollowUpWorkflowBrief).success).toBe(true);
    const invalid = structuredClone(leadFollowUpWorkflowBrief);
    delete invalid.loops[0]!.maximumIterations;
    expect(safeParseCanonicalWorkflowBrief(invalid).success).toBe(false);
  });

  it('validates return-to-step and polling loop requirements', () => {
    const returnLoop = { id: 'return-loop', name: 'Return for revision', description: 'Return work to the prior business step.', loopType: 'return-to-step' as const, entryActionId: 'action-1', bodyActionIds: ['action-1'], exitCondition: 'Revision is accepted.', loopBackActionId: 'action-1' };
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), loops: [returnLoop] }).success).toBe(true);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), loops: [{ ...returnLoop, loopBackActionId: undefined }] }).success).toBe(false);
    const polling = { id: 'poll-loop', name: 'Poll for result', description: 'Check periodically for a result.', loopType: 'polling' as const, entryActionId: 'action-1', bodyActionIds: ['action-1'], exitCondition: 'A result is available.', intervalDescription: 'Every 10 minutes.' };
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), loops: [polling] }).success).toBe(true);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), loops: [{ ...polling, intervalDescription: undefined }] }).success).toBe(false);
  });

  it('validates duration waits and their boundary-specific field', () => {
    const wait = { id: 'wait-1', name: 'Wait two days', description: 'Pause before continuing.', waitType: 'duration' as const, boundaryDescription: 'Resume after two days.', resumeActionId: 'action-1', durationDescription: 'Two days.' };
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), waits: [wait] }).success).toBe(true);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), waits: [{ ...wait, durationDescription: undefined }] }).success).toBe(false);
  });

  it('accepts an active human approval and rejects descriptive approved status', () => {
    const brief = minimumBrief();
    brief.actors = [{ id: 'manager', name: 'Manager', role: 'Approver' }];
    brief.actions.push({ id: 'rejected-action', name: 'Handle rejection', description: 'Return rejected work.', inputs: [], outputs: [] });
    brief.routes = [
      { id: 'approved-route', decisionId: 'approval-decision', label: 'APPROVED', condition: 'The manager approves.', outcomeDescription: 'Continue approved work.', targetActionId: 'action-1', isFallback: false },
      { id: 'rejected-route', decisionId: 'approval-decision', label: 'REJECTED', condition: 'The manager rejects.', outcomeDescription: 'Return rejected work.', targetActionId: 'rejected-action', isFallback: false },
    ];
    brief.decisions = [{ id: 'approval-decision', name: 'Manager decision', description: 'Capture the manager decision.', decisionType: 'binary', conditionDescription: 'Did the manager approve?', routeIds: ['approved-route', 'rejected-route'] }];
    brief.approvals = [{ id: 'approval-1', name: 'Request manager approval', description: 'Ask the manager to approve or reject the work.', approverActorId: 'manager', requestActionId: 'action-1', approvedRouteId: 'approved-route', rejectedRouteId: 'rejected-route' }];
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(true);
    brief.approvals[0] = { ...brief.approvals[0]!, name: 'Approved content', description: 'Content with approved status.' };
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(false);
  });

  it('accepts merge-all and rejects fewer than two incoming routes', () => {
    const brief = structuredClone(departmentRoutingWorkflowBrief);
    brief.merges = [{ id: 'merge-1', name: 'Combine department outcomes', description: 'Continue after all selected department outcomes.', mergeType: 'all', incomingRouteIds: ['route-it', 'route-marketing'], targetActionId: 'handle-support' }];
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(true);
    brief.merges[0]!.incomingRouteIds = ['route-it'];
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(false);
  });

  it('accepts an iterator with aggregator and rejects mismatched references', () => {
    const brief = minimumBrief();
    brief.actions.push({ id: 'process-item', name: 'Process item', description: 'Process one item.', inputs: ['item'], outputs: ['result'] }, { id: 'use-results', name: 'Use results', description: 'Use collected results.', inputs: ['results'], outputs: [] });
    brief.iterators = [{ id: 'iterator-1', name: 'Process each item', description: 'Process every item in the source collection.', sourceActionId: 'action-1', itemDescription: 'One work item.', bodyActionIds: ['process-item'], aggregatorId: 'aggregator-1' }];
    brief.aggregators = [{ id: 'aggregator-1', name: 'Collect results', description: 'Collect every item result.', aggregationType: 'collect', sourceIteratorId: 'iterator-1', targetActionId: 'use-results', outputDescription: 'Collected item results.' }];
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(true);
    brief.iterators[0]!.aggregatorId = 'missing-aggregator';
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(false);
  });

  it('rejects invalid control-flow references and platform-specific fields', () => {
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), waits: [{ id: 'wait-1', name: 'Wait for event', description: 'Wait for a business event.', waitType: 'until-event', boundaryDescription: 'Resume on event.', resumeActionId: 'missing-action', eventDescription: 'Event received.' }] }).success).toBe(false);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), loops: [{ id: 'loop-1', name: 'Repeat work', description: 'Repeat bounded work.', loopType: 'bounded-retry', entryActionId: 'action-1', bodyActionIds: ['missing-action'], exitCondition: 'Work succeeds.', maximumIterations: 2 }] }).success).toBe(false);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), decisions: [{ id: 'decision-1', name: 'Choose outcome', description: 'Choose one outcome.', decisionType: 'binary', conditionDescription: 'Which outcome?', routeIds: ['missing-1', 'missing-2'], n8nSwitch: true }] }).success).toBe(false);
  });

  it('accepts evidence tied to a route with valid requirement offsets', () => {
    const brief = structuredClone(departmentRoutingWorkflowBrief);
    brief.evidence = [{ id: 'evidence-1', sourceType: 'requirement-text', sourceText: 'route it to IT', sourceStart: 22, sourceEnd: 36, explanation: 'The requirement names the IT route.', relatedEntityType: 'route', relatedEntityId: 'route-it' }];
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(true);
  });

  it('rejects partial, reversed, and out-of-range requirement offsets', () => {
    const evidence = { id: 'evidence-1', sourceType: 'requirement-text' as const, sourceText: 'work', sourceStart: 0, sourceEnd: 4, explanation: 'Requirement evidence.', relatedEntityType: 'action' as const, relatedEntityId: 'action-1' };
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), evidence: [{ ...evidence, sourceEnd: undefined }] }).success).toBe(false);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), evidence: [{ ...evidence, sourceStart: 4, sourceEnd: 4 }] }).success).toBe(false);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), evidence: [{ ...evidence, sourceEnd: 999 }] }).success).toBe(false);
  });

  it.each([
    [0.2, 'low'], [0.5, 'medium'], [0.85, 'high'], [1, 'confirmed'],
  ] as const)('accepts confidence score %s as %s', (score, level) => {
    expect(workflowBriefConfidenceSchema.safeParse({ id: 'confidence-1', entityType: 'action', entityId: 'action-1', score, level, reason: 'Deterministic range test.' }).success).toBe(true);
  });

  it('rejects confidence level and score mismatches without coercion', () => {
    expect(workflowBriefConfidenceSchema.safeParse({ id: 'confidence-1', entityType: 'action', entityId: 'action-1', score: 0.5, level: 'low', reason: 'Mismatch.' }).success).toBe(false);
    expect(workflowBriefConfidenceSchema.safeParse({ id: 'confidence-1', entityType: 'action', entityId: 'action-1', score: '1', level: 'confirmed', reason: 'No coercion.' }).success).toBe(false);
  });

  it('accepts an open clarification and enforces answer-state consistency', () => {
    const question = { id: 'question-1', question: 'Who owns this work?', reason: 'Ownership is absent.', priority: 'high' as const, status: 'open' as const, createdFromEvidenceIds: [] };
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), clarificationQuestions: [question] }).success).toBe(true);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), clarificationQuestions: [{ ...question, status: 'answered', answerSource: 'user' }] }).success).toBe(false);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), clarificationQuestions: [{ ...question, answer: 'Sales', answerSource: 'user' }] }).success).toBe(false);
  });

  it('rejects unresolved evidence and entity references', () => {
    const brief = minimumBrief();
    brief.clarificationQuestions = [{ id: 'question-1', question: 'What next?', reason: 'Missing detail.', relatedEntityType: 'action', relatedEntityId: 'missing', priority: 'low', status: 'open', createdFromEvidenceIds: ['missing-evidence'] }];
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(false);
  });

  it('accepts system suggestions, user confirmations, and rejected history', () => {
    const system = { id: 'review-1', entityType: 'action' as const, entityId: 'action-1', state: 'suggested' as const, reason: 'System proposal.', reviewedBy: 'system' as const };
    const confirmed = { ...system, id: 'review-2', state: 'confirmed' as const, reviewedBy: 'user' as const, reviewedAt: '2026-08-01T00:00:00.000Z' };
    const rejected = { ...confirmed, id: 'review-3', state: 'rejected' as const };
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), reviewDecisions: [system, confirmed, rejected] }).success).toBe(true);
  });

  it('accepts an edited decision with a valid replacement and rejects self replacement', () => {
    const brief = minimumBrief();
    brief.actions.push({ id: 'action-2', name: 'Replacement work', description: 'Perform replacement work.', inputs: [], outputs: [] });
    brief.reviewDecisions = [{ id: 'review-1', entityType: 'action', entityId: 'action-1', state: 'edited', reason: 'The user changed the action.', reviewedBy: 'user', replacementEntityId: 'action-2' }];
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(true);
    brief.reviewDecisions[0]!.replacementEntityId = 'action-1';
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(false);
  });

  it('accepts the conceptual AI Agent fixture and rejects runtime or platform fields', () => {
    expect(safeParseCanonicalWorkflowBrief(aiChatbotDraftWorkflowBrief).success).toBe(true);
    const runtime = structuredClone(aiChatbotDraftWorkflowBrief) as CanonicalWorkflowBrief & { capabilitySuggestions: Array<CanonicalWorkflowBrief['capabilitySuggestions'][number] & { model?: string }> };
    runtime.capabilitySuggestions[0]!.model = 'provider-model';
    expect(safeParseCanonicalWorkflowBrief(runtime).success).toBe(false);
    const platform = structuredClone(aiChatbotDraftWorkflowBrief);
    platform.capabilitySuggestions[0]!.name = 'n8n AI Agent';
    expect(safeParseCanonicalWorkflowBrief(platform).success).toBe(false);
  });

  it('accepts a completely reviewed and locked department-routing brief', () => {
    expect(safeParseCanonicalWorkflowBrief(lockedDepartmentRoutingWorkflowBrief).success).toBe(true);
  });

  it('enforces lock metadata and excludes it from non-locked states', () => {
    const missingMetadata = structuredClone(lockedDepartmentRoutingWorkflowBrief);
    delete missingMetadata.reviewState.lockedAt;
    expect(safeParseCanonicalWorkflowBrief(missingMetadata).success).toBe(false);
    expect(safeParseCanonicalWorkflowBrief({ ...minimumBrief(), reviewState: { status: 'draft', version: 1, notes: [], lockedAt: '2026-08-01T00:00:00.000Z', lockedBy: 'user' } }).success).toBe(false);
  });

  it('prevents locking with an open blocking clarification', () => {
    const brief = structuredClone(lockedDepartmentRoutingWorkflowBrief);
    brief.clarificationQuestions = [{ id: 'blocking-question', question: 'Which department owns unmatched requests?', reason: 'Fallback ownership is unknown.', priority: 'blocking', status: 'open', createdFromEvidenceIds: ['department-routing-evidence'] }];
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(false);
  });

  it('requires confirmed or required review and evidence for every locked capability', () => {
    const suggested = structuredClone(lockedDepartmentRoutingWorkflowBrief);
    suggested.reviewDecisions[0]!.state = 'suggested';
    suggested.reviewDecisions[0]!.reviewedBy = 'system';
    delete suggested.reviewDecisions[0]!.reviewedAt;
    expect(safeParseCanonicalWorkflowBrief(suggested).success).toBe(false);
    const required = structuredClone(lockedDepartmentRoutingWorkflowBrief);
    required.reviewDecisions[0]!.state = 'required';
    expect(safeParseCanonicalWorkflowBrief(required).success).toBe(true);
    required.capabilitySuggestions[0]!.evidenceIds = [];
    expect(safeParseCanonicalWorkflowBrief(required).success).toBe(false);
  });

  it('retains rejected capability history in drafts but rejects it in locked briefs', () => {
    const draft = structuredClone(aiChatbotDraftWorkflowBrief);
    draft.reviewDecisions[0] = { ...draft.reviewDecisions[0]!, state: 'rejected', reviewedBy: 'user', reviewedAt: '2026-08-01T00:00:00.000Z' };
    expect(safeParseCanonicalWorkflowBrief(draft).success).toBe(true);
    const locked = structuredClone(lockedDepartmentRoutingWorkflowBrief);
    locked.reviewDecisions[0]!.state = 'rejected';
    expect(safeParseCanonicalWorkflowBrief(locked).success).toBe(false);
  });

  it('keeps all Sprint 1 and Sprint 2 fixtures valid with explicit draft metadata', () => {
    for (const fixture of [websiteEnquiryWorkflowBrief, departmentRoutingWorkflowBrief, leadFollowUpWorkflowBrief]) {
      expect(safeParseCanonicalWorkflowBrief(fixture).success).toBe(true);
      expect(fixture.reviewState.status).toBe('draft');
    }
  });
});
