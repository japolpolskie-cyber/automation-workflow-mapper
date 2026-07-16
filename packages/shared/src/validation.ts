import type { CanonicalWorkflow, Platform } from './domain.js';
import { validateWorkflowGraph } from './graph.js';
import type { PlatformValidationIssue } from './platform.js';
import { isExternalAction } from './application-registry.js';

export type ValidationSeverity = 'error' | 'warning' | 'recommendation';
export interface WorkflowValidationIssue { severity: ValidationSeverity; code: string; message: string; nodeId?: string }
export interface WorkflowValidationResult {
  valid: boolean;
  issues: WorkflowValidationIssue[];
  complexityScore: number;
  complexity: 'simple' | 'moderate' | 'advanced' | 'enterprise';
  usageEstimate: 'low' | 'medium' | 'high';
  statistics: { nodes: number; connections: number; applications: number; branches: number; apiCalls: number; humanSteps: number; configuredPercent: number };
}

const terminalCategories = new Set(['end', 'notification', 'logger', 'error_handler']);
const operationalCategories = new Set(['trigger', 'action', 'api_request', 'database', 'notification']);
const piiPattern = /email|phone|address|customer|client|lead|contact|personal/i;

export function validateWorkflow(workflow: CanonicalWorkflow, platform: Platform, platformIssues: PlatformValidationIssue[] = []): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = validateWorkflowGraph(workflow).issues.map((issue) => ({ severity: issue.severity, code: issue.code, message: issue.message, ...(issue.nodeId ? { nodeId: issue.nodeId } : {}) }));
  const outgoing = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const incoming = new Map(workflow.nodes.map((node) => [node.id, 0]));
  for (const edge of workflow.connections) { outgoing.set(edge.sourceNodeId, (outgoing.get(edge.sourceNodeId) ?? 0) + 1); incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) ?? 0) + 1); }
  const signatures = new Map<string, string>();
  for (const node of workflow.nodes) {
    if (!terminalCategories.has(node.category) && (outgoing.get(node.id) ?? 0) === 0) issues.push({ severity: 'warning', code: 'DEAD_END_NODE', message: `${node.name} has no next step.`, nodeId: node.id });
    if (operationalCategories.has(node.category) && !node.service) issues.push({ severity: 'warning', code: 'APPLICATION_REQUIRED', message: `Choose an application for ${node.name}.`, nodeId: node.id });
    if (operationalCategories.has(node.category) && !node.operation) issues.push({ severity: 'warning', code: 'OPERATION_REQUIRED', message: `Choose an event or operation for ${node.name}.`, nodeId: node.id });
    const requiredInputs = node.inputs.filter((field) => field.required);
    const mappedFields = new Set(workflow.connections.filter((edge) => edge.targetNodeId === node.id).flatMap((edge) => edge.mappings.map((mapping) => mapping.destinationField)));
    for (const field of requiredInputs.filter((input) => !mappedFields.has(input.key))) issues.push({ severity: 'error', code: 'REQUIRED_INPUT_UNMAPPED', message: `${node.name} requires a mapping for ${field.label}.`, nodeId: node.id });
    if (['condition', 'filter'].includes(node.category) && !node.conditions.length) issues.push({ severity: 'error', code: 'EMPTY_CONDITION', message: `${node.name} needs at least one condition.`, nodeId: node.id });
    if (/^(action|trigger|condition) node$/i.test(node.name.trim())) issues.push({ severity: 'error', code: 'GENERIC_NODE_NAME', message: `${node.name} must describe a real application event or automation operation.`, nodeId: node.id });
    if (isExternalAction(node) && !workflow.connections.some((edge) => edge.sourceNodeId === node.id && ['failure', 'error'].includes(edge.routeType)) && !node.retryPolicy) issues.push({ severity: 'recommendation', code: 'FAILURE_HANDLING_REVIEW', message: `Confirm platform retry and error settings for ${node.name}; add a visible failure branch only if it changes the business path.`, nodeId: node.id });
    if (node.riskLevel === 'high' && !workflow.errorHandling.some((rule) => rule.nodeId === node.id)) issues.push({ severity: 'warning', code: 'HIGH_RISK_WITHOUT_HANDLER', message: `${node.name} is high risk and has no error-handling rule.`, nodeId: node.id });
    if (node.category === 'api_request') issues.push({ severity: 'recommendation', code: 'RATE_LIMIT_REVIEW', message: `Confirm rate limits, pagination, timeout, and retry behavior for ${node.name}.`, nodeId: node.id });
    const signature = `${node.category}|${node.service ?? ''}|${node.operation ?? ''}`.toLowerCase();
    if (node.category === 'action' && signatures.has(signature)) issues.push({ severity: 'recommendation', code: 'DUPLICATE_ACTION', message: `${node.name} may duplicate another action.`, nodeId: node.id }); else signatures.set(signature, node.id);
    if (piiPattern.test(`${node.name} ${node.description} ${node.inputs.map((field) => field.key).join(' ')}`)) issues.push({ severity: 'recommendation', code: 'PII_REVIEW', message: `Review personal-data handling and retention for ${node.name}.`, nodeId: node.id });
  }
  if (workflow.nodes.length && !workflow.nodes.some((node) => node.category === 'end')) issues.push({ severity: 'error', code: 'COMPLETION_REQUIRED', message: 'The workflow needs at least one explicit End node.' });
  for (const issue of platformIssues) issues.push({ severity: issue.severity, code: issue.code, message: issue.message, ...(issue.nodeId ? { nodeId: issue.nodeId } : {}) });
  if (workflow.nodes.length > 30) issues.push({ severity: 'recommendation', code: 'SPLIT_WORKFLOW', message: `This ${workflow.nodes.length}-node ${platform} workflow should be split into sub-workflows for maintainability.` });
  const applications = new Set(workflow.nodes.map((node) => node.service).filter(Boolean)).size;
  const apiCalls = workflow.nodes.filter((node) => node.category === 'api_request').length;
  const humanSteps = workflow.nodes.filter((node) => node.category === 'human_approval').length;
  const configuredPercent = workflow.nodes.length ? Math.round(workflow.nodes.reduce((sum, node) => sum + node.configurationCompleteness, 0) / workflow.nodes.length) : 0;
  const complexityScore = Math.min(100, workflow.nodes.length * 2 + workflow.branches.length * 6 + apiCalls * 5 + applications * 2 + humanSteps * 3 + workflow.risks.filter((risk) => ['high', 'critical'].includes(risk.severity)).length * 5);
  const complexity = complexityScore >= 75 ? 'enterprise' : complexityScore >= 45 ? 'advanced' : complexityScore >= 20 ? 'moderate' : 'simple';
  const usageEstimate = workflow.nodes.length > 20 || workflow.nodes.some((node) => node.category === 'loop') ? 'high' : workflow.nodes.length > 8 ? 'medium' : 'low';
  return { valid: !issues.some((issue) => issue.severity === 'error'), issues, complexityScore, complexity, usageEstimate, statistics: { nodes: workflow.nodes.length, connections: workflow.connections.length, applications, branches: workflow.branches.length, apiCalls, humanSteps, configuredPercent } };
}
