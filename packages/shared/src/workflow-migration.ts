import { canonicalWorkflowSchema, type CanonicalWorkflow } from './domain.js';
import { resolveApplication } from './application-registry.js';

export function migrateWorkflow(value: unknown): CanonicalWorkflow {
  const workflow = removeLegacyFailureScaffolding(canonicalWorkflowSchema.parse(value));
  const nodes = workflow.nodes.map((node) => {
    const app = resolveApplication(node);
    const purpose = node.purpose || node.description || describePurpose(node.name, node.operation);
    return {
      ...node,
      purpose,
      expectedResult: node.expectedResult || `The ${node.name.toLowerCase()} step completes and makes its result available to the next step.`,
      icon: node.icon === 'generic-action' ? app.icon : node.icon,
      estimatedExecution: node.estimatedExecution || 'Under 1 minute',
      decisionRule: node.decisionRule ?? decisionFromLegacy(node, workflow),
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const connections = workflow.connections.map((edge) => {
    const source = nodeById.get(edge.sourceNodeId);
    const decisionSource = source && ['condition', 'filter', 'router', 'split', 'human_approval', 'loop'].includes(source.category);
    const routineSuccess = !decisionSource && edge.routeType === 'success' && ['SUCCESS', 'DONE'].includes((edge.branchLabel || edge.label).trim().toUpperCase());
    const branchLabel = routineSuccess ? null : edge.branchLabel ?? inferBranchLabel(edge.label, edge.routeType, source?.category);
    const label = routineSuccess ? '' : edge.label || branchLabel || '';
    return { ...edge, branchLabel, label, style: edge.style === 'default' ? styleFor(edge.routeType, branchLabel) : edge.style };
  });
  return { ...workflow, schemaVersion: '2.0', nodes, connections };
}

function describePurpose(name: string, operation: string | null) { return operation ? `${operation} so the workflow can complete “${name}”.` : `Complete the “${name}” stage of the automation.`; }
function decisionFromLegacy(node: CanonicalWorkflow['nodes'][number], workflow: CanonicalWorkflow) {
  if (!['condition', 'filter'].includes(node.category)) return null;
  const rule = node.conditions[0]?.rules[0] ?? workflow.branches.find((branch) => branch.sourceNodeId === node.id)?.condition?.rules[0];
  if (!rule) return null;
  return { decisionQuestion: node.name.endsWith('?') ? node.name : `${node.name}?`, field: rule.field, operator: rule.operator, comparisonValue: rule.value, trueLabel: 'TRUE' as const, falseLabel: 'FALSE' as const };
}
function inferBranchLabel(label: string, routeType: CanonicalWorkflow['connections'][number]['routeType'], sourceCategory?: string) {
  const value = label.trim().toUpperCase();
  const labels = ['TRUE', 'FALSE', 'SUCCESS', 'FAILED', 'FOUND', 'NOT FOUND', 'APPROVED', 'REJECTED', 'PAID', 'UNPAID', 'QUALIFIED', 'NOT QUALIFIED', 'DEFAULT', 'LOOP', 'DONE'] as const;
  const exact = labels.find((item) => value === item || value.includes(item));
  if (exact) return exact;
  if (routeType === 'failure' || routeType === 'error') return 'FAILED' as const;
  if (sourceCategory === 'condition' || sourceCategory === 'filter') return null;
  return null;
}

function removeLegacyFailureScaffolding(workflow: CanonicalWorkflow): CanonicalWorkflow {
  const generated = new Set(workflow.nodes.filter((node) => node.notes === 'Automatically added by the architecture compiler.' && (
    node.category === 'retry' ||
    (node.category === 'notification' && node.name.startsWith('Notify admin —')) ||
    (node.category === 'human_approval' && node.name.startsWith('Manual review —')) ||
    (node.category === 'end' && (node.name.includes('retry — Recovered') || node.name.startsWith('Manual review —')))
  )).map((node) => node.id));
  if (!generated.size) return workflow;
  return { ...workflow, nodes: workflow.nodes.filter((node) => !generated.has(node.id)), connections: workflow.connections.filter((edge) => !generated.has(edge.sourceNodeId) && !generated.has(edge.targetNodeId)), warnings: [...workflow.warnings, 'Legacy auto-generated failure branches were simplified. Retry and error guidance remains available in the node details.'] };
}
function styleFor(routeType: CanonicalWorkflow['connections'][number]['routeType'], label: string | null) {
  if (label === 'LOOP') return 'loop' as const;
  if (routeType === 'failure' || routeType === 'error' || label === 'FALSE' || label === 'FAILED' || label === 'REJECTED') return 'failure' as const;
  if (routeType === 'conditional') return 'conditional' as const;
  if (routeType === 'success') return 'success' as const;
  return 'default' as const;
}
