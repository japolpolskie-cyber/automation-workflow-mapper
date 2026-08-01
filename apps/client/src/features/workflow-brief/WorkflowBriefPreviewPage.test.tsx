// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { departmentRoutingWorkflowBrief, minimumWorkflowBrief, type CanonicalWorkflowBrief } from '@awm/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workflowBriefApi } from '../../api/workflow-brief';
import { WorkflowBriefPreviewPage } from './WorkflowBriefPreviewPage';

const generateDraft = vi.fn<typeof workflowBriefApi.generateDraft>();

const noCapabilityResult = () => ({
  brief: structuredClone(minimumWorkflowBrief),
  detectionSummary: { candidateCount: 0, detectedFunctions: [], clarificationCount: 0 },
});

const routerResult = () => {
  const brief: CanonicalWorkflowBrief = {
    ...structuredClone(departmentRoutingWorkflowBrief),
    sourceRequirement: 'Route requests to IT, Marketing, or Customer Support.',
    triggers: [{ id: 'draft-trigger', name: 'Draft requirement intake', description: 'Draft scaffolding; not an extracted client trigger.', triggerType: 'manual' }],
    actions: [{ id: 'draft-action', name: 'Review and refine detected workflow requirements', description: 'Draft scaffolding; not an extracted client action.', inputs: [], outputs: [] }],
    routes: departmentRoutingWorkflowBrief.routes.map((route) => ({ ...route, targetActionId: undefined })).map(({ targetActionId: _targetActionId, ...route }) => route),
    evidence: [{ id: 'router-evidence', sourceType: 'requirement-text', sourceText: 'Route requests to IT, Marketing, or Customer Support.', sourceStart: 0, sourceEnd: 54, explanation: 'Explicit department routing.', relatedEntityType: 'capability', relatedEntityId: 'router-capability' }],
    confidence: [{ id: 'router-confidence', entityType: 'capability', entityId: 'router-capability', score: 0.96, level: 'high', reason: 'Three routes are explicit.' }],
    reviewDecisions: [{ id: 'router-review', entityType: 'capability', entityId: 'router-capability', state: 'required', reason: 'Explicit routing.', reviewedBy: 'system' }],
    capabilitySuggestions: [{ id: 'router-capability', capabilityType: 'multi-route-decision', name: 'Route requests by department', description: 'Route requests to the stated departments.', relatedEntityIds: ['department-decision'], evidenceIds: ['router-evidence'], confidenceId: 'router-confidence', reviewDecisionId: 'router-review', configurationQuestions: [] }],
    assumptions: ['Draft scaffolding is included only for review.'],
    warnings: ['Draft trigger and action are scaffolding.'],
  };
  return { brief, detectionSummary: { candidateCount: 1, detectedFunctions: ['multi-route-decision'], clarificationCount: 0 } };
};

beforeEach(() => generateDraft.mockReset());
afterEach(cleanup);

async function submit(requirement = 'Route requests to IT, Marketing, or Customer Support.') {
  fireEvent.change(screen.getByLabelText('Raw requirement'), { target: { value: requirement } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate Draft Brief' }));
}

describe('WorkflowBriefPreviewPage', () => {
  it('shows empty validation and disables generation', () => {
    render(<WorkflowBriefPreviewPage generateDraft={generateDraft} />);
    expect(screen.getByRole('button', { name: 'Generate Draft Brief' })).toBeDisabled();
    expect(screen.getByText('Enter a requirement to generate a draft brief.')).toBeInTheDocument();
  });

  it('shows loading, prevents repeat submission, and trims input', async () => {
    let resolve!: (value: ReturnType<typeof noCapabilityResult>) => void;
    generateDraft.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<WorkflowBriefPreviewPage generateDraft={generateDraft} />);
    await submit('  Review the request.  ');
    expect(screen.getByRole('button', { name: 'Generating draft…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Generating and validating');
    expect(generateDraft).toHaveBeenCalledWith('Review the request.');
    resolve(noCapabilityResult());
    await screen.findByText('No capabilities detected by the current decision detectors.');
  });

  it('preserves input and shows a server error', async () => {
    const unavailable = async () => Promise.reject(new Error('The service is unavailable.'));
    render(<WorkflowBriefPreviewPage generateDraft={unavailable} />);
    await submit('Review this requirement.');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The service is unavailable.'));
    expect(screen.getByLabelText('Raw requirement')).toHaveValue('Review this requirement.');
  });

  it('renders Router capabilities, semantic labels, evidence, scaffolding, and raw JSON', async () => {
    generateDraft.mockResolvedValue(routerResult());
    render(<WorkflowBriefPreviewPage generateDraft={generateDraft} />);
    await submit();
    expect((await screen.findAllByText('multi-route-decision')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('high (0.96)')).toBeInTheDocument();
    expect(screen.getAllByText('IT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Marketing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Customer Support').length).toBeGreaterThan(0);
    expect(screen.getByText('Explicit department routing.')).toBeInTheDocument();
    expect(screen.getAllByText(/Draft trigger and action are scaffolding/).length).toBeGreaterThan(0);
    expect(screen.getByText('Raw JSON')).toBeInTheDocument();
    expect(screen.getByText(/"candidateCount": 1/)).toBeInTheDocument();
  });

  it('renders a Binary Decision and clarification details', async () => {
    const result = routerResult();
    result.brief.decisions = [{ ...result.brief.decisions[0]!, id: 'binary-decision', name: 'Decide whether payment succeeds', decisionType: 'binary', routeIds: ['success-route', 'failure-route'], fallbackRouteId: 'failure-route' }];
    result.brief.routes = [
      { id: 'success-route', decisionId: 'binary-decision', label: 'Success', condition: 'Payment succeeds', outcomeDescription: 'Send a receipt.', isFallback: false },
      { id: 'failure-route', decisionId: 'binary-decision', label: 'Failure', condition: 'Payment does not succeed', outcomeDescription: 'Notify finance.', isFallback: true },
    ];
    result.brief.capabilitySuggestions[0] = { ...result.brief.capabilitySuggestions[0]!, capabilityType: 'binary-decision', relatedEntityIds: ['binary-decision'] };
    result.brief.clarificationQuestions = [{ id: 'clarify-payment', question: 'Which payment result counts as success?', reason: 'The success boundary is unclear.', relatedEntityType: 'capability', relatedEntityId: 'router-capability', priority: 'high', status: 'open', createdFromEvidenceIds: ['router-evidence'] }];
    result.detectionSummary = { candidateCount: 1, detectedFunctions: ['binary-decision'], clarificationCount: 1 };
    generateDraft.mockResolvedValue(result);
    render(<WorkflowBriefPreviewPage generateDraft={generateDraft} />);
    await submit('If payment succeeds, send a receipt; otherwise notify finance.');
    expect((await screen.findAllByText('binary-decision')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Failure')).toBeInTheDocument();
    expect(screen.getByText('Which payment result counts as success?')).toBeInTheDocument();
    expect(screen.getByText(/Priority:/).closest('p')).toHaveTextContent('high');
  });

  it('renders complete Wait details and confidence', async () => {
    const result = routerResult();
    result.brief.decisions = [];
    result.brief.routes = [];
    result.brief.waits = [{ id: 'customer-response-wait', name: 'Wait for customer response', description: 'Pause until the customer replies.', waitType: 'until-response', boundaryDescription: 'the customer replies', resumeActionId: 'draft-action', eventDescription: 'the customer replies' }];
    result.brief.capabilitySuggestions[0] = { ...result.brief.capabilitySuggestions[0]!, capabilityType: 'wait', name: 'Wait for customer response', relatedEntityIds: ['customer-response-wait'] };
    result.detectionSummary = { candidateCount: 1, detectedFunctions: ['wait'], clarificationCount: 0 };
    generateDraft.mockResolvedValue(result);
    render(<WorkflowBriefPreviewPage generateDraft={generateDraft} />);
    await submit('Wait until the customer replies.');
    expect(await screen.findByText('Wait Boundaries')).toBeInTheDocument();
    expect(screen.getByText('until-response')).toBeInTheDocument();
    expect(screen.getAllByText('the customer replies').length).toBeGreaterThan(0);
    expect(screen.getByText('Review and refine detected workflow requirements')).toBeInTheDocument();
  });

  it('renders complete Approval subject, approver, outcomes, and confidence', async () => {
    const result = routerResult();
    result.brief.actors = [{ id: 'client', name: 'client', role: 'Approver' }];
    result.brief.decisions = [];
    result.brief.routes = [
      { id: 'approved', decisionId: 'approval-decision', label: 'Approved', condition: 'design is approved', outcomeDescription: 'Approved design.', isFallback: false },
      { id: 'rejected', decisionId: 'approval-decision', label: 'Rejected', condition: 'design is rejected', outcomeDescription: 'Rejected design.', isFallback: true },
    ];
    result.brief.decisions = [{ id: 'approval-decision', name: 'Decide design approval', description: 'Client decision.', decisionType: 'binary', conditionDescription: 'Client approves or rejects design', routeIds: ['approved', 'rejected'], fallbackRouteId: 'rejected' }];
    result.brief.approvals = [{ id: 'design-approval', name: 'Approval for design', description: 'Request active human approval for design.', approverActorId: 'client', requestActionId: 'draft-action', approvedRouteId: 'approved', rejectedRouteId: 'rejected' }];
    result.brief.capabilitySuggestions[0] = { ...result.brief.capabilitySuggestions[0]!, capabilityType: 'approval', name: 'Approve design', relatedEntityIds: ['design-approval'] };
    result.detectionSummary = { candidateCount: 1, detectedFunctions: ['approval'], clarificationCount: 0 };
    generateDraft.mockResolvedValue(result);
    render(<WorkflowBriefPreviewPage generateDraft={generateDraft} />);
    await submit('Wait for the client to approve or reject the design.');
    expect(await screen.findByText('Approval Boundaries')).toBeInTheDocument();
    expect(screen.getByText('design')).toBeInTheDocument();
    expect(screen.getByText('client')).toBeInTheDocument();
    expect(screen.getByText('Approved / Rejected')).toBeInTheDocument();
    expect(screen.getAllByText('high (0.96)').length).toBeGreaterThan(0);
  });

  it('clears the requirement and response', async () => {
    generateDraft.mockResolvedValue(noCapabilityResult());
    render(<WorkflowBriefPreviewPage generateDraft={generateDraft} />);
    await submit('Review the request.');
    await screen.findByText('Detection Summary');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Raw requirement')).toHaveValue('');
    expect(screen.queryByText('Detection Summary')).not.toBeInTheDocument();
  });
});
