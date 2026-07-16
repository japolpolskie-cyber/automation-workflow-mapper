import { describe, expect, it } from 'vitest';
import { leadQualificationWorkflow } from './fixtures.js';
import { createDefaultWorkflowSet, createWorkflowSetFromGraph, normalizeWorkflowSet, workflowIdsForResource } from './workflow-set.js';

describe('workflow sets', () => {
  it('creates one backward-compatible default set without changing the canonical graph', () => {
    const set = createDefaultWorkflowSet(leadQualificationWorkflow);
    expect(set.workflows).toHaveLength(1);
    expect(set.workflows[0]).toMatchObject({ id: leadQualificationWorkflow.id, name: leadQualificationWorkflow.name });
    expect(set.nodeReferences).toHaveLength(leadQualificationWorkflow.nodes.length);
    expect(set.connectionReferences).toHaveLength(leadQualificationWorkflow.connections.length);
    expect(leadQualificationWorkflow.nodes).toHaveLength(9);
  });

  it('persists disconnected workflows as separate first-class entries', () => {
    const secondTrigger = { ...leadQualificationWorkflow.nodes[0]!, id: '70000000-0000-4000-8000-000000000001', name: 'Receive renewal reminder' };
    const workflow = { ...leadQualificationWorkflow, nodes: [...leadQualificationWorkflow.nodes, secondTrigger] };
    const set = createWorkflowSetFromGraph(workflow);
    expect(set.workflows).toHaveLength(2);
    expect(set.workflows.map((item) => item.name)).toContain('Receive renewal reminder');
    expect(new Set(set.nodeReferences.map((item) => item.resourceId)).size).toBe(workflow.nodes.length);
  });

  it('keeps shared nodes as explicit references to one canonical resource', () => {
    const set = createWorkflowSetFromGraph({
      ...leadQualificationWorkflow,
      nodes: [...leadQualificationWorkflow.nodes, { ...leadQualificationWorkflow.nodes[0]!, id: '70000000-0000-4000-8000-000000000001', name: 'Receive renewal reminder' }],
    });
    const sharedNode = set.nodeReferences[0]!;
    const secondWorkflowId = set.workflows[1]!.id;
    const normalized = normalizeWorkflowSet(leadQualificationWorkflow, {
      ...set,
      nodeReferences: [{ ...sharedNode, referencedByWorkflowIds: [secondWorkflowId] }, ...set.nodeReferences.slice(1)],
    });
    expect(workflowIdsForResource(normalized.nodeReferences[0]!)).toEqual([sharedNode.owningWorkflowId, secondWorkflowId]);
    expect(normalized.nodeReferences.filter((item) => item.resourceId === sharedNode.resourceId)).toHaveLength(1);
  });
});
