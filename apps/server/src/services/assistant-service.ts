import { assistWorkflowRequestSchema, validateWorkflow, workflowPatchProposalSchema, type CanonicalWorkflow, type WorkflowNode, type WorkflowPatchChange, type WorkflowPatchProposal } from '@awm/shared';
import type { ProjectRepository } from '../repositories/project-repository.js';
import { AnalysisError } from './analysis-service.js';

const node = (category: WorkflowNode['category'], name: string, service: string | null, operation: string): WorkflowNode => ({ id: crypto.randomUUID(), category, name, description: '', service, operation, purpose: '', expectedResult: '', icon: `generic-${category}`, estimatedExecution: 'Under 1 minute', inputs: [], outputs: [], credentials: service ? [`${service} connection`] : [], configuration: {}, status: 'incomplete', configurationCompleteness: 30, conditions: [], decisionRule: null, notes: 'Proposed by workflow assistant.', bestPractices: [], potentialErrors: [], alternativeImplementations: [], performanceNotes: [], securityNotes: [], riskLevel: 'low' });
const connection = (sourceNodeId: string, targetNodeId: string, routeType: 'success' | 'error' = 'success') => ({ id: crypto.randomUUID(), sourceNodeId, targetNodeId, sourcePort: 'output', targetPort: 'input', label: routeType === 'error' ? 'FAILED' : 'SUCCESS', branchLabel: routeType === 'error' ? 'FAILED' as const : 'SUCCESS' as const, style: routeType === 'error' ? 'failure' as const : 'success' as const, condition: null, routeType, mappings: [] });
const tokens = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
const findTarget = (workflow: CanonicalWorkflow, command: string, selectedNodeId: string | null) => {
  const selected = workflow.nodes.find((item) => item.id === selectedNodeId); if (selected) return selected;
  const commandTokens = tokens(command);
  return [...workflow.nodes].sort((a, b) => tokens(b.name).filter((word) => commandTokens.includes(word)).length - tokens(a.name).filter((word) => commandTokens.includes(word)).length)[0] ?? null;
};

export class AssistantService {
  public constructor(private readonly repository: ProjectRepository) {}
  public propose(input: unknown): WorkflowPatchProposal {
    const request = assistWorkflowRequestSchema.parse(input);
    const project = this.repository.findById(request.projectId);
    if (!project) throw new AnalysisError('PROJECT_NOT_FOUND', 'The workflow project was not found.', 404);
    let workflow = structuredClone(request.workflow); const changes: WorkflowPatchChange[] = []; const warnings: string[] = [];
    const target = findTarget(workflow, request.command, request.selectedNodeId);
    const replace = request.command.match(/replace\s+(.+?)\s+with\s+(.+?)(?:\.|$)/i);
    if (replace) {
      const from = replace[1]!.trim(); const to = replace[2]!.trim(); let count = 0;
      workflow.nodes = workflow.nodes.map((item) => item.service?.toLowerCase() === from.toLowerCase() ? (count += 1, { ...item, service: to, credentials: [`${to} connection`], status: 'incomplete' as const, configurationCompleteness: Math.min(item.configurationCompleteness, 50) }) : item);
      if (count) changes.push({ type: 'update', nodeId: null, label: `Replace ${from} with ${to}`, detail: `${count} node${count === 1 ? '' : 's'} will use ${to}.` }); else warnings.push(`No nodes currently use ${from}.`);
    } else if (/add\s+(?:an?\s+)?error handler/i.test(request.command)) {
      if (!target) warnings.push('Select the node that needs an error handler.'); else { const added = node('error_handler', `Handle ${target.name} failure`, null, 'Handle error'); workflow.nodes.push(added); workflow.connections.push(connection(target.id, added.id, 'error')); workflow.errorHandling.push({ id: crypto.randomUUID(), nodeId: target.id, strategy: 'fallback', retryAttempts: 0, fallbackNodeId: added.id, notificationNodeId: null, notes: 'Assistant-proposed failure route.' }); changes.push({ type: 'add', nodeId: added.id, label: 'Add error handler', detail: `Adds an error route after ${target.name}.` }); }
    } else if (/slack|notification|notify/i.test(request.command)) {
      const added = node('notification', /slack/i.test(request.command) ? 'Send Slack Notification' : 'Send Notification', /slack/i.test(request.command) ? 'Slack' : null, 'Send message'); workflow.nodes.push(added); if (target) workflow.connections.push(connection(target.id, added.id, /fail|error/i.test(request.command) ? 'error' : 'success')); changes.push({ type: 'add', nodeId: added.id, label: `Add ${added.name}`, detail: target ? `Connects after ${target.name}${/fail|error/i.test(request.command) ? ' on its error route' : ''}.` : 'Adds an unconnected notification for review.' });
    } else if (/human approval|approval step|approve/i.test(request.command)) {
      if (!target) warnings.push('Select the node that should follow approval.'); else { const added = node('human_approval', `Approve before ${target.name}`, null, 'Request approval'); const incoming = workflow.connections.filter((edge) => edge.targetNodeId === target.id); workflow.connections = workflow.connections.map((edge) => edge.targetNodeId === target.id ? { ...edge, targetNodeId: added.id } : edge); workflow.nodes.push(added); workflow.connections.push(connection(added.id, target.id)); changes.push({ type: 'add', nodeId: added.id, label: 'Add human approval', detail: `Inserts approval before ${target.name} and preserves ${incoming.length} incoming route${incoming.length === 1 ? '' : 's'}.` }); }
    } else if (/add logging|add logger|log (?:every|important|execution)/i.test(request.command)) {
      const added = node('logger', 'Log Workflow Execution', null, 'Write log entry'); const last = workflow.nodes.findLast((item) => !['end', 'logger'].includes(item.category)); workflow.nodes.push(added); if (last) workflow.connections.push(connection(last.id, added.id)); changes.push({ type: 'add', nodeId: added.id, label: 'Add execution logger', detail: last ? `Adds logging after ${last.name}.` : 'Adds a logging step.' });
    } else if (/remove|delete/i.test(request.command) && target) {
      workflow.nodes = workflow.nodes.filter((item) => item.id !== target.id); workflow.connections = workflow.connections.filter((edge) => edge.sourceNodeId !== target.id && edge.targetNodeId !== target.id); changes.push({ type: 'remove', nodeId: target.id, label: `Remove ${target.name}`, detail: 'Removes the node and its connections.' });
    } else warnings.push('This command needs a more specific instruction. Try adding an error handler, notification, approval, logger, removing the selected node, or replacing one app with another.');
    workflow = { ...workflow, updatedAt: new Date().toISOString() };
    const validation = validateWorkflow(workflow, workflow.targetPlatform);
    return workflowPatchProposalSchema.parse({ id: crypto.randomUUID(), command: request.command, summary: changes.length ? `${changes.length} proposed workflow change${changes.length === 1 ? '' : 's'}.` : 'No workflow changes proposed.', changes, proposedWorkflow: workflow, warnings, validation: { valid: validation.valid, errorCount: validation.issues.filter((issue) => issue.severity === 'error').length, warningCount: validation.issues.filter((issue) => issue.severity === 'warning').length } });
  }
}
