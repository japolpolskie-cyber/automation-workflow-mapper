import { isAiAttachmentNode, workflowIdsForResource, type CanonicalWorkflow, type PlatformBuildPlan, type WorkflowSet, type WorkflowNode } from '@awm/shared';

export interface WorkflowSlice {
  id: string;
  label: string;
  workflow: CanonicalWorkflow;
}

export type ReadinessStatus = 'Draft' | 'Needs Clarification' | 'Platform Limited' | 'Build Ready';
export interface ReadinessItem { priority: 'high' | 'medium' | 'low'; label: string; nodeId: string | null }
export interface WorkflowReadiness {
  status: ReadinessStatus;
  completed: number;
  total: number;
  estimatedEffort: 'Low' | 'Medium' | 'High';
  items: ReadinessItem[];
}

const isTrigger = (node: WorkflowNode) => ['trigger', 'start', 'webhook'].includes(node.category);

export function splitIndependentWorkflows(workflow: CanonicalWorkflow, workflowSet?: WorkflowSet): WorkflowSlice[] {
  if (workflowSet) {
    return workflowSet.workflows.filter((item) => item.status === 'active').map((item) => {
      const nodeIds = new Set(workflowSet.nodeReferences.filter((reference) => workflowIdsForResource(reference).includes(item.id)).map((reference) => reference.resourceId));
      const connectionIds = new Set(workflowSet.connectionReferences.filter((reference) => workflowIdsForResource(reference).includes(item.id)).map((reference) => reference.resourceId));
      return {
        id: item.id,
        label: item.name,
        workflow: {
          ...workflow,
          name: item.name,
          summary: item.description || workflow.summary,
          nodes: workflow.nodes.filter((node) => nodeIds.has(node.id)),
          connections: workflow.connections.filter((edge) => connectionIds.has(edge.id) && nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)),
          branches: workflow.branches.filter((branch) => nodeIds.has(branch.sourceNodeId) || Boolean(branch.destinationNodeId && nodeIds.has(branch.destinationNodeId))),
          errorHandling: workflow.errorHandling.filter((rule) => nodeIds.has(rule.nodeId)),
          clarificationQuestions: workflow.clarificationQuestions.filter((question) => !question.relatedNodeId || nodeIds.has(question.relatedNodeId)),
          risks: workflow.risks.filter((risk) => !risk.nodeId || nodeIds.has(risk.nodeId)),
        },
      };
    });
  }
  if (!workflow.nodes.length) return [{ id: workflow.id, label: workflow.name, workflow }];
  const incoming = new Set(workflow.connections.map((edge) => edge.targetNodeId));
  const roots = workflow.nodes.filter((node) => isTrigger(node) || !incoming.has(node.id));
  if (roots.length <= 1) return [{ id: roots[0]?.id ?? workflow.id, label: workflow.name, workflow }];
  const outgoing = new Map<string, string[]>();
  for (const edge of workflow.connections) outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
  const rootIds = new Set(roots.map((root) => root.id));
  const assigned = new Set<string>();
  const slices = roots.map((root, index) => {
    const ids = new Set<string>();
    const queue = [root.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (ids.has(id) || assigned.has(id)) continue;
      ids.add(id); assigned.add(id);
      for (const target of outgoing.get(id) ?? []) if (!rootIds.has(target)) queue.push(target);
    }
    const nodes = workflow.nodes.filter((node) => ids.has(node.id));
    const connections = workflow.connections.filter((edge) => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId));
    const label = root.name || `Workflow ${index + 1}`;
    return {
      id: root.id,
      label,
      workflow: {
        ...workflow, name: label, nodes, connections,
        branches: workflow.branches.filter((branch) => ids.has(branch.sourceNodeId) || Boolean(branch.destinationNodeId && ids.has(branch.destinationNodeId))),
        errorHandling: workflow.errorHandling.filter((rule) => ids.has(rule.nodeId)),
        clarificationQuestions: workflow.clarificationQuestions.filter((item) => !item.relatedNodeId || ids.has(item.relatedNodeId)),
        risks: workflow.risks.filter((risk) => !risk.nodeId || ids.has(risk.nodeId)),
      },
    };
  });
  const unassigned = workflow.nodes.filter((node) => !assigned.has(node.id));
  if (unassigned.length) {
    const ids = new Set(unassigned.map((node) => node.id));
    slices.push({
      id: `${workflow.id}-shared`, label: 'Shared and unconnected steps',
      workflow: { ...workflow, name: 'Shared and unconnected steps', nodes: unassigned, connections: workflow.connections.filter((edge) => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId)), branches: [], errorHandling: [], clarificationQuestions: [], risks: [] },
    });
  }
  return slices;
}

export function evaluateWorkflowReadiness(workflow: CanonicalWorkflow, plan: PlatformBuildPlan): WorkflowReadiness {
  const items: ReadinessItem[] = [];
  for (const question of workflow.clarificationQuestions.filter((item) => item.required && !item.answer)) items.push({ priority: 'high', label: question.question, nodeId: question.relatedNodeId });
  for (const recommendation of plan.nodes) {
    if (recommendation.limitations.length) items.push({ priority: 'high', label: `${recommendation.appName}: ${recommendation.limitations[0]}`, nodeId: recommendation.sourceNodeId });
    if (/connected app|workflow|configure/i.test(`${recommendation.appName} ${recommendation.event}`)) items.push({ priority: 'high', label: `Choose a supported application and operation for ${recommendation.stepType}.`, nodeId: recommendation.sourceNodeId });
    if (recommendation.decisionsRequired.length) items.push(...recommendation.decisionsRequired.map((label) => ({ priority: 'medium' as const, label, nodeId: recommendation.sourceNodeId })));
  }
  for (const node of workflow.nodes.filter((item) => !isAiAttachmentNode(item) && (item.status !== 'configured' || item.configurationCompleteness < 100))) {
    if (!items.some((item) => item.nodeId === node.id)) items.push({ priority: 'low', label: `Complete configuration for ${node.name}.`, nodeId: node.id });
  }
  const hasClarification = workflow.clarificationQuestions.some((item) => item.required && !item.answer);
  const hasLimitation = plan.nodes.some((item) => item.limitations.length || /connected app|workflow|configure/i.test(`${item.appName} ${item.event}`));
  const executionNodes = workflow.nodes.filter((node) => !isAiAttachmentNode(node));
  const complete = executionNodes.length > 0 && executionNodes.every((node) => node.status === 'configured' && node.configurationCompleteness === 100);
  const status: ReadinessStatus = hasClarification ? 'Needs Clarification' : hasLimitation ? 'Platform Limited' : complete ? 'Build Ready' : 'Draft';
  const completed = executionNodes.filter((node) => node.status === 'configured' && node.configurationCompleteness === 100).length;
  return { status, completed, total: executionNodes.length, estimatedEffort: executionNodes.length > 12 || workflow.complexity === 'enterprise' ? 'High' : executionNodes.length > 6 || workflow.complexity === 'advanced' ? 'Medium' : 'Low', items };
}
