import type { CanonicalWorkflow, WorkflowSet, WorkflowSetEntry } from './domain.js';

const triggerCategories = new Set(['trigger', 'start', 'webhook']);

function readinessFor(workflow: CanonicalWorkflow, nodeIds: Set<string>): WorkflowSetEntry['readiness'] {
  const clarification = workflow.clarificationQuestions.some((item) => item.required && !item.answer && (!item.relatedNodeId || nodeIds.has(item.relatedNodeId)));
  if (clarification) return 'needs_clarification';
  const nodes = workflow.nodes.filter((node) => nodeIds.has(node.id));
  return nodes.length > 0 && nodes.every((node) => node.status === 'configured' && node.configurationCompleteness === 100) ? 'build_ready' : 'draft';
}

function entry(workflow: CanonicalWorkflow, id: string, name: string, nodeIds: Set<string>, now: string): WorkflowSetEntry {
  const nodes = workflow.nodes.filter((node) => nodeIds.has(node.id));
  const triggers = nodes.filter((node) => triggerCategories.has(node.category));
  return {
    id,
    name,
    description: triggers[0]?.purpose || triggers[0]?.description || workflow.summary,
    triggerSummary: triggers.map((node) => node.name).join('; ') || 'Manual or upstream start',
    platformSummary: workflow.targetPlatform,
    readiness: readinessFor(workflow, nodeIds),
    status: 'active',
    applications: [...new Set(nodes.map((node) => node.service).filter((service): service is string => Boolean(service)))],
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultWorkflowSet(workflow: CanonicalWorkflow, now = workflow.updatedAt): WorkflowSet {
  const workflowId = workflow.id;
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  return {
    schemaVersion: '1.0',
    workflows: [entry(workflow, workflowId, workflow.name, nodeIds, now)],
    nodeReferences: workflow.nodes.map((node) => ({ resourceId: node.id, owningWorkflowId: workflowId, referencedByWorkflowIds: [] })),
    connectionReferences: workflow.connections.map((connection) => ({ resourceId: connection.id, owningWorkflowId: workflowId, referencedByWorkflowIds: [] })),
    createdAt: now,
    updatedAt: now,
  };
}

export function createWorkflowSetFromGraph(workflow: CanonicalWorkflow, now = workflow.updatedAt): WorkflowSet {
  if (!workflow.nodes.length) return createDefaultWorkflowSet(workflow, now);
  const adjacent = new Map<string, Set<string>>();
  for (const node of workflow.nodes) adjacent.set(node.id, new Set());
  for (const edge of workflow.connections) {
    adjacent.get(edge.sourceNodeId)?.add(edge.targetNodeId);
    adjacent.get(edge.targetNodeId)?.add(edge.sourceNodeId);
  }
  const remaining = new Set(workflow.nodes.map((node) => node.id));
  const components: Set<string>[] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as string;
    const component = new Set<string>();
    const queue = [first];
    while (queue.length) {
      const id = queue.shift()!;
      if (component.has(id)) continue;
      component.add(id);
      remaining.delete(id);
      for (const neighbor of adjacent.get(id) ?? []) queue.push(neighbor);
    }
    components.push(component);
  }
  if (components.length === 1) return createDefaultWorkflowSet(workflow, now);
  const workflows = components.map((nodeIds, index) => {
    const trigger = workflow.nodes.find((node) => nodeIds.has(node.id) && triggerCategories.has(node.category));
    const id = trigger?.id ?? crypto.randomUUID();
    return entry(workflow, id, trigger?.name || `Workflow ${index + 1}`, nodeIds, now);
  });
  const ownerByNode = new Map<string, string>();
  components.forEach((nodeIds, index) => nodeIds.forEach((nodeId) => ownerByNode.set(nodeId, workflows[index]!.id)));
  return {
    schemaVersion: '1.0',
    workflows,
    nodeReferences: workflow.nodes.map((node) => ({ resourceId: node.id, owningWorkflowId: ownerByNode.get(node.id)!, referencedByWorkflowIds: [] })),
    connectionReferences: workflow.connections.map((edge) => ({ resourceId: edge.id, owningWorkflowId: ownerByNode.get(edge.sourceNodeId)!, referencedByWorkflowIds: [] })),
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeWorkflowSet(workflow: CanonicalWorkflow, value: WorkflowSet | null | undefined, fallbackWorkflowId?: string): WorkflowSet {
  const existing = value ?? createDefaultWorkflowSet(workflow);
  const workflowIds = new Set(existing.workflows.map((item) => item.id));
  const fallback = workflowIds.has(fallbackWorkflowId ?? '') ? fallbackWorkflowId! : existing.workflows[0]!.id;
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  const connectionIds = new Set(workflow.connections.map((edge) => edge.id));
  const normalize = (references: WorkflowSet['nodeReferences'], resources: Set<string>) => {
    const byId = new Map(references.filter((reference) => resources.has(reference.resourceId) && workflowIds.has(reference.owningWorkflowId)).map((reference) => [reference.resourceId, reference]));
    return [...resources].map((resourceId) => {
      const current = byId.get(resourceId);
      return current ? {
        ...current,
        referencedByWorkflowIds: [...new Set(current.referencedByWorkflowIds.filter((id) => workflowIds.has(id) && id !== current.owningWorkflowId))],
      } : { resourceId, owningWorkflowId: fallback, referencedByWorkflowIds: [] };
    });
  };
  return {
    ...existing,
    nodeReferences: normalize(existing.nodeReferences, nodeIds),
    connectionReferences: normalize(existing.connectionReferences, connectionIds),
    updatedAt: workflow.updatedAt,
  };
}

export function workflowIdsForResource(reference: WorkflowSet['nodeReferences'][number]): string[] {
  return [reference.owningWorkflowId, ...reference.referencedByWorkflowIds];
}
