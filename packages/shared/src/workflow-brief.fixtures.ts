import type { CanonicalWorkflowBrief } from './workflow-brief.js';

export const minimumWorkflowBrief: CanonicalWorkflowBrief = {
  schemaVersion: '1.0', id: 'minimum-brief', name: 'Minimum business process',
  summary: 'Complete one business task.', objective: 'Complete the requested work.',
  sourceRequirement: 'When work arrives, complete it.',
  actors: [], applications: [],
  triggers: [{ id: 'work-received', name: 'Work received', description: 'Work becomes available.', triggerType: 'event' }],
  actions: [{ id: 'complete-work', name: 'Complete work', description: 'Complete the requested business work.', inputs: [], outputs: ['completed work'] }],
  routes: [], decisions: [], loops: [], waits: [], approvals: [], merges: [], iterators: [], aggregators: [],
  evidence: [], confidence: [], clarificationQuestions: [], reviewDecisions: [], capabilitySuggestions: [],
  reviewState: { status: 'draft', version: 1, notes: [] },
  assumptions: [], missingInformation: [], warnings: [], completionCriteria: ['The requested work is complete.'],
};

export const websiteEnquiryWorkflowBrief: CanonicalWorkflowBrief = {
  schemaVersion: '1.0',
  id: 'website-enquiry-brief',
  name: 'Website enquiry intake',
  summary: 'Capture a website enquiry, create a lead, and inform sales.',
  objective: 'Ensure every website enquiry becomes a CRM lead and reaches the sales team.',
  sourceRequirement: 'Receive a website enquiry, create a CRM lead, and notify the sales team.',
  actors: [
    { id: 'sales-team', name: 'Sales team', role: 'Lead owner', description: 'Reviews and follows up on new enquiries.' },
  ],
  applications: [
    { id: 'website', name: 'Website', purpose: 'Collect enquiries.', explicitlyMentioned: true },
    { id: 'crm', name: 'CRM', purpose: 'Store sales leads.', explicitlyMentioned: true },
  ],
  triggers: [
    { id: 'enquiry-received', name: 'Website enquiry received', description: 'A visitor submits a website enquiry.', applicationId: 'website', triggerType: 'form' },
  ],
  actions: [
    { id: 'create-lead', name: 'Create CRM lead', description: 'Create a lead from the submitted enquiry.', applicationId: 'crm', inputs: ['enquiry details'], outputs: ['lead record'] },
    { id: 'notify-sales', name: 'Notify sales team', description: 'Inform the sales team that a new lead is available.', actorId: 'sales-team', inputs: ['lead record'], outputs: ['sales notification'] },
  ],
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
  completionCriteria: ['The CRM lead exists.', 'The sales team has been notified.'],
};

export const departmentRoutingWorkflowBrief: CanonicalWorkflowBrief = {
  schemaVersion: '1.0', id: 'department-routing', name: 'Department request routing',
  summary: 'Send each request to the responsible department.', objective: 'Route incoming requests by department.',
  sourceRequirement: 'Receive a request and route it to IT, Marketing, or Customer Support.',
  actors: [], applications: [],
  triggers: [{ id: 'request-received', name: 'Request received', description: 'A business request is received.', triggerType: 'form' }],
  actions: [
    { id: 'handle-it', name: 'Handle IT request', description: 'Send the request to IT.', inputs: ['request'], outputs: ['IT request'] },
    { id: 'handle-marketing', name: 'Handle marketing request', description: 'Send the request to Marketing.', inputs: ['request'], outputs: ['marketing request'] },
    { id: 'handle-support', name: 'Handle support request', description: 'Send the request to Customer Support.', inputs: ['request'], outputs: ['support request'] },
  ],
  routes: [
    { id: 'route-it', decisionId: 'department-decision', label: 'IT', condition: 'The request is for IT.', outcomeDescription: 'IT owns the request.', targetActionId: 'handle-it', isFallback: false },
    { id: 'route-marketing', decisionId: 'department-decision', label: 'Marketing', condition: 'The request is for Marketing.', outcomeDescription: 'Marketing owns the request.', targetActionId: 'handle-marketing', isFallback: false },
    { id: 'route-support', decisionId: 'department-decision', label: 'Customer Support', condition: 'The request is for Customer Support.', outcomeDescription: 'Customer Support owns the request.', targetActionId: 'handle-support', isFallback: false },
  ],
  decisions: [{ id: 'department-decision', name: 'Route by department', description: 'Choose the department responsible for the request.', decisionType: 'multi-route', conditionDescription: 'Which department owns the request?', routeIds: ['route-it', 'route-marketing', 'route-support'] }],
  loops: [], waits: [], approvals: [], merges: [], iterators: [], aggregators: [],
  evidence: [], confidence: [], clarificationQuestions: [], reviewDecisions: [], capabilitySuggestions: [],
  reviewState: { status: 'draft', version: 1, notes: [] },
  assumptions: [], missingInformation: [], warnings: [], completionCriteria: ['The responsible department receives the request.'],
};

export const leadFollowUpWorkflowBrief: CanonicalWorkflowBrief = {
  schemaVersion: '1.0', id: 'lead-follow-up', name: 'Lead follow-up',
  summary: 'Contact a lead, wait for a response, and bound follow-up attempts.', objective: 'Qualify interested leads without unbounded follow-up.',
  sourceRequirement: 'Contact the lead, wait for a response, return interested leads to qualification, otherwise retry up to three times and exit.',
  actors: [], applications: [],
  triggers: [{ id: 'lead-ready', name: 'Lead ready for contact', description: 'A lead becomes ready for outreach.', triggerType: 'record-change' }],
  actions: [
    { id: 'contact-lead', name: 'Contact lead', description: 'Send the lead a business follow-up.', inputs: ['lead'], outputs: ['contact attempt'] },
    { id: 'qualify-lead', name: 'Qualify interested lead', description: 'Return the interested lead to qualification.', inputs: ['lead response'], outputs: ['qualification result'] },
    { id: 'record-no-interest', name: 'Record no interest', description: 'Record the terminal non-interest result.', inputs: ['lead response'], outputs: ['closed lead'] },
  ],
  routes: [
    { id: 'interested-route', decisionId: 'interest-decision', label: 'Interested', condition: 'The lead is interested.', outcomeDescription: 'Return the lead to qualification.', targetActionId: 'qualify-lead', isFallback: false },
    { id: 'not-interested-route', decisionId: 'interest-decision', label: 'Not Interested', condition: 'The lead is not interested or has not responded.', outcomeDescription: 'Continue the bounded follow-up before exit.', targetActionId: 'contact-lead', isFallback: false },
  ],
  decisions: [{ id: 'interest-decision', name: 'Evaluate lead interest', description: 'Determine whether the lead wants to continue.', decisionType: 'binary', conditionDescription: 'Is the lead interested?', routeIds: ['interested-route', 'not-interested-route'] }],
  loops: [{ id: 'follow-up-retry', name: 'Bounded lead follow-up', description: 'Retry contact up to three times before exit.', loopType: 'bounded-retry', entryActionId: 'contact-lead', bodyActionIds: ['contact-lead'], exitCondition: 'The lead responds or three attempts are completed.', maximumIterations: 3 }],
  waits: [{ id: 'response-wait', name: 'Wait for lead response', description: 'Pause until the lead responds.', waitType: 'until-response', boundaryDescription: 'Resume when the lead responds.', resumeActionId: 'qualify-lead', eventDescription: 'Lead response received.' }],
  approvals: [], merges: [], iterators: [], aggregators: [],
  evidence: [], confidence: [], clarificationQuestions: [], reviewDecisions: [], capabilitySuggestions: [],
  reviewState: { status: 'draft', version: 1, notes: [] },
  assumptions: [], missingInformation: [], warnings: [], completionCriteria: ['Interested leads return to qualification.', 'Follow-up stops after three attempts.'],
};

const departmentRequirement = departmentRoutingWorkflowBrief.sourceRequirement;
export const lockedDepartmentRoutingWorkflowBrief: CanonicalWorkflowBrief = {
  ...structuredClone(departmentRoutingWorkflowBrief),
  id: 'locked-department-routing',
  evidence: [{
    id: 'department-routing-evidence', sourceType: 'requirement-text', sourceText: departmentRequirement,
    sourceStart: 0, sourceEnd: departmentRequirement.length,
    explanation: 'The requirement explicitly names routing to three departments.',
    relatedEntityType: 'decision', relatedEntityId: 'department-decision',
  }],
  confidence: [{ id: 'department-routing-confidence', entityType: 'capability', entityId: 'department-routing-capability', score: 1, level: 'confirmed', reason: 'The user confirmed the explicit routing requirement.' }],
  clarificationQuestions: [],
  reviewDecisions: [{ id: 'department-routing-review', entityType: 'capability', entityId: 'department-routing-capability', state: 'confirmed', reason: 'The three-way business routing is accepted.', reviewedBy: 'user', reviewedAt: '2026-08-01T00:00:00.000Z' }],
  capabilitySuggestions: [{
    id: 'department-routing-capability', capabilityType: 'multi-route-decision', name: 'Route requests by department',
    description: 'Choose IT, Marketing, or Customer Support according to request ownership.',
    relatedEntityIds: ['department-decision', 'route-it', 'route-marketing', 'route-support'],
    evidenceIds: ['department-routing-evidence'], confidenceId: 'department-routing-confidence',
    reviewDecisionId: 'department-routing-review', configurationQuestions: [],
  }],
  reviewState: { status: 'locked', lockedAt: '2026-08-01T00:00:00.000Z', lockedBy: 'user', version: 1, notes: ['Department routing reviewed and accepted.'] },
};

const chatbotRequirement = 'Provide a chatbot that can answer customer questions and escalate uncertain requests.';
export const aiChatbotDraftWorkflowBrief: CanonicalWorkflowBrief = {
  schemaVersion: '1.0', id: 'ai-chatbot-draft', name: 'Customer question chatbot',
  summary: 'Answer customer questions and escalate uncertain requests.', objective: 'Provide responsive customer assistance.',
  sourceRequirement: chatbotRequirement,
  actors: [{ id: 'support-team', name: 'Support team', role: 'Escalation owner' }], applications: [],
  triggers: [{ id: 'question-received', name: 'Customer question received', description: 'A customer submits a question.', triggerType: 'message' }],
  actions: [{ id: 'answer-question', name: 'Answer customer question', description: 'Provide a relevant answer or escalate the question.', actorId: 'support-team', inputs: ['customer question'], outputs: ['answer or escalation'] }],
  routes: [], decisions: [], loops: [], waits: [], approvals: [], merges: [], iterators: [], aggregators: [],
  evidence: [{ id: 'chatbot-inference-evidence', sourceType: 'system-inference', sourceText: 'chatbot', explanation: 'The chatbot wording may imply conversational capability.', relatedEntityType: 'capability', relatedEntityId: 'chatbot-capability' }],
  confidence: [{ id: 'chatbot-confidence', entityType: 'capability', entityId: 'chatbot-capability', score: 0.65, level: 'medium', reason: 'The requirement suggests conversation but does not define autonomous tool selection.' }],
  clarificationQuestions: [{ id: 'chatbot-scope-question', question: 'Are free-form conversation and autonomous tool selection required?', reason: 'The requested chatbot scope is not explicit.', relatedEntityType: 'capability', relatedEntityId: 'chatbot-capability', priority: 'high', status: 'open', createdFromEvidenceIds: ['chatbot-inference-evidence'] }],
  reviewDecisions: [{ id: 'chatbot-review', entityType: 'capability', entityId: 'chatbot-capability', state: 'suggested', reason: 'The system proposes a conceptual conversational capability for review.', reviewedBy: 'system' }],
  capabilitySuggestions: [{ id: 'chatbot-capability', capabilityType: 'ai-agent', name: 'Conversational customer assistance', description: 'Interpret customer questions and choose whether to answer or escalate.', relatedEntityIds: ['answer-question'], evidenceIds: ['chatbot-inference-evidence'], confidenceId: 'chatbot-confidence', reviewDecisionId: 'chatbot-review', configurationQuestions: ['Whether free-form conversation is required.', 'Whether autonomous tool selection is required.'] }],
  reviewState: { status: 'needs-clarification', version: 1, notes: ['Conversational scope requires clarification.'] },
  assumptions: [], missingInformation: ['Whether free-form conversation and autonomous tool selection are required.'], warnings: [], completionCriteria: ['Customer questions receive an answer or escalation.'],
};

export const collectionProcessingWorkflowBrief: CanonicalWorkflowBrief = {
  schemaVersion: '1.0', id: 'collection-processing', name: 'Document collection processing',
  summary: 'Retrieve documents, process each one, collect results, and notify operations.',
  objective: 'Process every available document and report completion.',
  sourceRequirement: 'Retrieve new documents, process each document, collect the results, and notify operations when complete.',
  actors: [{ id: 'operations-team', name: 'Operations team', role: 'Completion recipient' }],
  applications: [{ id: 'document-store', name: 'Document store', purpose: 'Provide business documents.', explicitlyMentioned: false }],
  triggers: [{ id: 'processing-scheduled', name: 'Processing window starts', description: 'The scheduled collection-processing window starts.', triggerType: 'schedule' }],
  actions: [
    { id: 'retrieve-documents', name: 'Retrieve new documents', description: 'Retrieve the available business documents.', applicationId: 'document-store', inputs: [], outputs: ['documents'] },
    { id: 'process-document', name: 'Process document', description: 'Process one retrieved document.', inputs: ['document'], outputs: ['document result'] },
    { id: 'notify-operations', name: 'Notify operations', description: 'Inform operations that collection processing is complete.', actorId: 'operations-team', inputs: ['collected results'], outputs: ['completion notification'] },
  ],
  routes: [], decisions: [], loops: [], waits: [], approvals: [], merges: [],
  iterators: [{ id: 'document-iterator', name: 'Process each document', description: 'Apply processing to every retrieved document.', sourceActionId: 'retrieve-documents', itemDescription: 'One retrieved document.', bodyActionIds: ['process-document'], aggregatorId: 'result-aggregator' }],
  aggregators: [{ id: 'result-aggregator', name: 'Collect document results', description: 'Collect the result produced for each document.', aggregationType: 'collect', sourceIteratorId: 'document-iterator', targetActionId: 'notify-operations', outputDescription: 'Collected document-processing results.' }],
  evidence: [], confidence: [], clarificationQuestions: [], reviewDecisions: [], capabilitySuggestions: [],
  reviewState: { status: 'draft', version: 1, notes: [] }, assumptions: [], missingInformation: [], warnings: [],
  completionCriteria: ['Every retrieved document is processed.', 'Operations receives the completion notification.'],
};

export const humanApprovalWorkflowBrief: CanonicalWorkflowBrief = {
  schemaVersion: '1.0', id: 'human-approval', name: 'Expense approval',
  summary: 'Request a manager decision on an expense and follow the selected outcome.', objective: 'Obtain an explicit manager approval or rejection before payment.',
  sourceRequirement: 'Send the expense to the manager for approval. If approved, pay it; otherwise return it for revision.',
  actors: [{ id: 'manager', name: 'Manager', role: 'Expense approver' }], applications: [],
  triggers: [{ id: 'expense-submitted', name: 'Expense submitted', description: 'An expense is submitted for review.', triggerType: 'record-change' }],
  actions: [
    { id: 'request-approval', name: 'Request manager approval', description: 'Send the expense to the manager for an approval decision.', actorId: 'manager', inputs: ['expense'], outputs: ['approval decision'] },
    { id: 'pay-expense', name: 'Pay approved expense', description: 'Pay the expense after approval.', inputs: ['approved expense'], outputs: ['payment'] },
    { id: 'return-expense', name: 'Return expense for revision', description: 'Return the rejected expense for revision.', inputs: ['rejected expense'], outputs: ['revision request'] },
  ],
  routes: [
    { id: 'expense-approved', decisionId: 'expense-decision', label: 'Approved', condition: 'The manager approves the expense.', outcomeDescription: 'Continue to payment.', targetActionId: 'pay-expense', isFallback: false },
    { id: 'expense-rejected', decisionId: 'expense-decision', label: 'Rejected', condition: 'The manager rejects the expense.', outcomeDescription: 'Return the expense for revision.', targetActionId: 'return-expense', isFallback: false },
  ],
  decisions: [{ id: 'expense-decision', name: 'Evaluate manager decision', description: 'Choose the approved or rejected business outcome.', decisionType: 'binary', conditionDescription: 'Did the manager approve the expense?', routeIds: ['expense-approved', 'expense-rejected'] }],
  loops: [], waits: [],
  approvals: [{ id: 'expense-approval', name: 'Request expense approval', description: 'Ask the manager to approve or reject the expense.', approverActorId: 'manager', requestActionId: 'request-approval', approvedRouteId: 'expense-approved', rejectedRouteId: 'expense-rejected' }],
  merges: [], iterators: [], aggregators: [], evidence: [], confidence: [], clarificationQuestions: [], reviewDecisions: [], capabilitySuggestions: [],
  reviewState: { status: 'draft', version: 1, notes: [] }, assumptions: [], missingInformation: [], warnings: [],
  completionCriteria: ['The expense is paid only after approval or returned after rejection.'],
};

export interface InvalidWorkflowBriefFixture {
  name: string;
  input: unknown;
  expectedPath: (string | number)[];
}

const invalidFixture = (name: string, mutate: (brief: Record<string, any>) => void, expectedPath: (string | number)[], source: CanonicalWorkflowBrief = minimumWorkflowBrief): InvalidWorkflowBriefFixture => {
  const input = structuredClone(source) as Record<string, any>;
  mutate(input);
  return { name, input, expectedPath };
};

export const invalidWorkflowBriefFixtures: readonly InvalidWorkflowBriefFixture[] = [
  invalidFixture('generic multi-route label', (brief) => { brief.routes[0].label = 'Route 1'; }, ['routes', 0, 'label'], departmentRoutingWorkflowBrief),
  invalidFixture('orphan route', (brief) => { brief.decisions[0].routeIds = brief.decisions[0].routeIds.slice(1); }, ['routes', 0, 'decisionId'], departmentRoutingWorkflowBrief),
  invalidFixture('invalid reference', (brief) => { brief.actions[0].applicationId = 'missing-application'; }, ['actions', 0, 'applicationId']),
  invalidFixture('duplicate IDs', (brief) => { brief.triggers.push({ ...brief.triggers[0] }); }, ['triggers', 1, 'id']),
  invalidFixture('invalid confidence band', (brief) => { brief.confidence[0].score = 0.2; }, ['confidence', 0, 'score'], aiChatbotDraftWorkflowBrief),
  invalidFixture('invalid source offsets', (brief) => { brief.evidence[0].sourceEnd = 999; }, ['evidence', 0, 'sourceEnd'], lockedDepartmentRoutingWorkflowBrief),
  invalidFixture('locked with blocking clarification', (brief) => { brief.clarificationQuestions = [{ id: 'blocking-question', question: 'Who owns unmatched requests?', reason: 'Fallback ownership is unclear.', priority: 'blocking', status: 'open', createdFromEvidenceIds: ['department-routing-evidence'] }]; }, ['clarificationQuestions'], lockedDepartmentRoutingWorkflowBrief),
  invalidFixture('locked with suggested-only capability', (brief) => { brief.reviewDecisions[0].state = 'suggested'; brief.reviewDecisions[0].reviewedBy = 'system'; delete brief.reviewDecisions[0].reviewedAt; }, ['capabilitySuggestions', 0, 'reviewDecisionId'], lockedDepartmentRoutingWorkflowBrief),
  invalidFixture('locked with rejected active control flow', (brief) => { brief.reviewDecisions.push({ id: 'rejected-decision-review', entityType: 'decision', entityId: 'department-decision', state: 'rejected', reason: 'The route decision was rejected.', reviewedBy: 'user', reviewedAt: '2026-08-01T00:00:00.000Z' }); }, ['reviewDecisions'], lockedDepartmentRoutingWorkflowBrief),
  invalidFixture('mismatched iterator and aggregator', (brief) => { brief.aggregators.push({ ...brief.aggregators[0], id: 'other-aggregator' }); brief.iterators[0].aggregatorId = 'other-aggregator'; }, ['aggregators', 0, 'sourceIteratorId'], collectionProcessingWorkflowBrief),
  invalidFixture('platform-specific node field', (brief) => { brief.actions[0].n8nNodeType = 'n8n-nodes-base.httpRequest'; }, ['actions', 0]),
  invalidFixture('runtime AI configuration field', (brief) => { brief.capabilitySuggestions[0].model = 'provider-model'; }, ['capabilitySuggestions', 0], aiChatbotDraftWorkflowBrief),
  invalidFixture('unsupported schema version', (brief) => { brief.schemaVersion = '2.0'; }, ['schemaVersion']),
  invalidFixture('unknown top-level field', (brief) => { brief.runtimeState = 'ready'; }, []),
];
