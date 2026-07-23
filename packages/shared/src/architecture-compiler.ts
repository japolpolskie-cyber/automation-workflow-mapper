import { canonicalWorkflowSchema, type CanonicalWorkflow, type WorkflowConnection, type WorkflowNode } from './domain.js';
import { isAiAttachmentConnection } from './ai-agent-attachments.js';
import { isExternalAction, resolveApplication } from './application-registry.js';
import { migrateWorkflow } from './workflow-migration.js';

const terminal = new Set(['end']);

export function compileAutomationArchitecture(input: CanonicalWorkflow): CanonicalWorkflow {
  let workflow = migrateWorkflow(input);
  const nodes = [...workflow.nodes];
  let edges = [...workflow.connections];

  for (const node of nodes) enrichNode(node);
  ({ nodes: workflow.nodes, edges } = insertExplicitMerges(nodes, edges));
  workflow = { ...workflow, nodes: workflow.nodes, connections: edges };
  workflow = enforceConditionBranches(workflow);
  workflow = enforceExternalFailurePaths(workflow);
  workflow = enforceCompletion(workflow);
  return canonicalWorkflowSchema.parse({
    ...workflow,
    schemaVersion: '2.0',
    estimatedExecutionTime: workflow.estimatedExecutionTime || estimateWorkflowTime(workflow),
    completionCriteria: workflow.completionCriteria.length ? workflow.completionCriteria : ['Every branch reaches a defined End or manual-review outcome.', 'Failures are logged or routed for human attention.', 'The expected business record or notification is produced.'],
    updatedAt: new Date().toISOString(),
  });
}

function enrichNode(node: WorkflowNode) {
  const app = resolveApplication(node);
  if (!node.service && app.id !== 'internal') node.service = app.name;
  node.icon = app.icon;
  node.purpose = node.purpose || node.description || `Perform ${node.operation || node.name} as part of the automation.`;
  node.expectedResult = node.expectedResult || `${node.name} completes successfully and exposes its result to downstream steps.`;
  node.bestPractices = unique(node.bestPractices.concat(bestPractices(node)));
  node.potentialErrors = unique(node.potentialErrors.concat(potentialErrors(node)));
  node.alternativeImplementations = unique(node.alternativeImplementations.concat(alternatives(node)));
  node.performanceNotes = unique(node.performanceNotes.concat(performanceNotes(node)));
  node.securityNotes = unique(node.securityNotes.concat(securityNotes(node)));
  if (['condition', 'filter'].includes(node.category) && !node.decisionRule) {
    const rule = node.conditions[0]?.rules[0];
    node.decisionRule = { decisionQuestion: node.name.endsWith('?') ? node.name : `${node.name}?`, field: rule?.field ?? 'result', operator: rule?.operator ?? 'equals', comparisonValue: rule?.value ?? true, trueLabel: 'TRUE', falseLabel: 'FALSE' };
  }
  if (['condition', 'filter'].includes(node.category) && node.decisionRule && !node.conditions.length) node.conditions = [{ combinator: 'and', rules: [{ field: node.decisionRule.field, operator: node.decisionRule.operator, value: node.decisionRule.comparisonValue }] }];
}

function enforceConditionBranches(workflow: CanonicalWorkflow): CanonicalWorkflow {
  const nodes = [...workflow.nodes]; const connections = [...workflow.connections];
  for (const condition of nodes.filter((node) => ['condition', 'filter'].includes(node.category))) {
    const outgoing = connections.filter((edge) => edge.sourceNodeId === condition.id && edge.routeType !== 'error');
    const trueLabel = condition.decisionRule?.trueLabel || 'TRUE';
    const falseLabel = condition.decisionRule?.falseLabel || 'FALSE';
    const isGeneric = (connection: WorkflowConnection) => !connection.branchLabel || ['SUCCESS', 'NEXT'].includes(connection.branchLabel);
    const explicitLabels = new Set(outgoing.filter((connection) => !isGeneric(connection)).map((connection) => (connection.branchLabel || connection.label).toUpperCase()));
    const availableLabels = [trueLabel, falseLabel].filter((label) => !explicitLabels.has(label.toUpperCase()));
    for (const [index, connection] of outgoing.filter(isGeneric).entries()) {
      const label = availableLabels[index];
      if (!label) continue;
      Object.assign(connection, { label, branchLabel: label, routeType: 'conditional', style: label.toUpperCase() === falseLabel.toUpperCase() ? 'failure' : 'conditional' });
    }
    const labels = new Set(outgoing.map((connection) => (connection.branchLabel || connection.label).toUpperCase()));
    for (const label of [trueLabel, falseLabel].filter((candidate) => !labels.has(candidate))) {
      const end = architectureNode('end', `${label === 'TRUE' ? 'Condition met' : 'Condition not met'} — End`, null, 'Complete branch', 'Finish this decision branch with a defined outcome.');
      nodes.push(end); connections.push(edge(condition.id, end.id, label, 'conditional', label === 'FALSE' ? 'failure' : 'conditional'));
    }
  }
  return { ...workflow, nodes, connections };
}

function enforceExternalFailurePaths(workflow: CanonicalWorkflow): CanonicalWorkflow {
  return { ...workflow, nodes: workflow.nodes.map((node) => isExternalAction(node) ? { ...node, retryPolicy: node.retryPolicy ?? { attempts: 2, backoff: 'exponential' as const }, bestPractices: unique([...node.bestPractices, 'Keep failure handling in platform settings unless failure changes the business path.']) } : node) };
}

function insertExplicitMerges(nodes: WorkflowNode[], edges: WorkflowConnection[]) {
  const nextNodes = [...nodes]; let nextEdges = [...edges];
  for (const target of nodes) {
    const incoming = nextEdges.filter((edge) => edge.targetNodeId === target.id && edge.routeType !== 'error' && !isAiAttachmentConnection(edge));
    if (incoming.length < 2 || target.category === 'merge') continue;
    const merge = architectureNode('merge', `Merge before ${target.name}`, null, 'Wait for incoming route', `Combine converging routes before ${target.name}.`);
    nextNodes.push(merge);
    nextEdges = nextEdges.map((edge) => incoming.some((item) => item.id === edge.id) ? { ...edge, targetNodeId: merge.id } : edge);
    nextEdges.push(edge(merge.id, target.id, null, 'success', 'success'));
  }
  return { nodes: nextNodes, edges: nextEdges };
}

function enforceCompletion(workflow: CanonicalWorkflow): CanonicalWorkflow {
  const nodes = [...workflow.nodes]; const connections = [...workflow.connections];
  for (const node of [...nodes]) {
    if (terminal.has(node.category) || ['condition', 'filter'].includes(node.category) || connections.some((item) => item.sourceNodeId === node.id)) continue;
    const end = architectureNode('end', `${node.name} — Completed`, null, 'Complete workflow', `Confirm the ${node.name.toLowerCase()} path has finished.`);
    nodes.push(end); connections.push(edge(node.id, end.id, null, 'success', 'success'));
  }
  return { ...workflow, nodes, connections };
}

function architectureNode(category: WorkflowNode['category'], name: string, service: string | null, operation: string, purpose: string): WorkflowNode {
  return { id: crypto.randomUUID(), category, name, description: purpose, service, operation, purpose, expectedResult: `${name} completes with a traceable result.`, icon: `generic-${category}`, estimatedExecution: category === 'human_approval' ? 'Depends on reviewer response' : 'Under 1 minute', inputs: [], outputs: [], credentials: [], configuration: {}, status: 'incomplete', configurationCompleteness: 20, conditions: [], decisionRule: null, notes: 'Automatically added by the architecture compiler.', bestPractices: [], potentialErrors: [], alternativeImplementations: [], performanceNotes: [], securityNotes: [], riskLevel: 'low' };
}
function edge(sourceNodeId: string, targetNodeId: string, label: WorkflowConnection['branchLabel'], routeType: WorkflowConnection['routeType'], style: WorkflowConnection['style']): WorkflowConnection { return { id: crypto.randomUUID(), sourceNodeId, targetNodeId, sourcePort: 'output', targetPort: 'input', label: label ?? '', branchLabel: label, condition: null, routeType, style, mappings: [] }; }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }
function bestPractices(node: WorkflowNode) { return isExternalAction(node) ? ['Use the native connector when it supports the required operation.', 'Test with representative non-production data before activation.'] : []; }
function potentialErrors(node: WorkflowNode) { return isExternalAction(node) ? ['Authentication or connection failure', 'Rate limit or temporary service outage', 'Invalid or incomplete input data'] : []; }
function alternatives(node: WorkflowNode) { return isExternalAction(node) ? [`Use an HTTP/API request if the native ${node.service || 'application'} connector cannot perform this operation.`] : []; }
function performanceNotes(node: WorkflowNode) { return ['loop', 'api_request', 'ai'].includes(node.category) ? ['Review volume, concurrency, timeouts, and usage before production activation.'] : []; }
function securityNotes(node: WorkflowNode) { return isExternalAction(node) ? ['Use a least-privilege connection and avoid placing secrets in node descriptions or notes.'] : []; }
function estimateWorkflowTime(workflow: CanonicalWorkflow) { const waits = workflow.nodes.filter((node) => node.category === 'delay').length; return waits ? `Execution time includes ${waits} configured wait step${waits === 1 ? '' : 's'}.` : workflow.nodes.length > 20 ? 'Usually several minutes, depending on connected applications.' : 'Usually under a few minutes.'; }
