import { describe, expect, it } from 'vitest';
import { createWorkflowSetFromGraph, leadQualificationWorkflow, projectWorkflowToVisualGraph, type Project } from '@awm/shared';
import { useEditorStore } from './editor-store';

describe('editor workflow layout isolation', () => {
  it('lays out only nodes owned by the selected workflow', () => {
    const now = new Date().toISOString();
    const secondTrigger = {
      ...leadQualificationWorkflow.nodes[0]!,
      id: '70000000-0000-4000-8000-000000000001',
      name: 'Receive renewal reminder',
    };
    const secondAction = {
      ...leadQualificationWorkflow.nodes[1]!,
      id: '70000000-0000-4000-8000-000000000002',
      name: 'Prepare renewal offer',
    };
    const secondConnection = {
      ...leadQualificationWorkflow.connections[0]!,
      id: '70000000-0000-4000-8000-000000000003',
      sourceNodeId: secondTrigger.id,
      targetNodeId: secondAction.id,
    };
    const workflow = {
      ...leadQualificationWorkflow,
      nodes: [...leadQualificationWorkflow.nodes, secondTrigger, secondAction],
      connections: [...leadQualificationWorkflow.connections, secondConnection],
    };
    const workflowSet = createWorkflowSetFromGraph(workflow);
    const project: Project = {
      id: '70000000-0000-4000-8000-000000000010',
      name: 'Layout isolation',
      clientName: '',
      description: '',
      platform: 'make',
      status: 'ready',
      originalScope: '',
      workflow,
      workflowSet,
      visualGraph: projectWorkflowToVisualGraph(workflow),
      createdAt: now,
      updatedAt: now,
    };

    useEditorStore.getState().initialize(project);
    const secondWorkflowId = workflowSet.workflows.find((item) => item.name === secondTrigger.name)!.id;
    const secondDomainIds = new Set(workflowSet.nodeReferences
      .filter((reference) => reference.owningWorkflowId === secondWorkflowId)
      .map((reference) => reference.resourceId));
    const firstDomainIds = new Set(workflowSet.nodeReferences
      .filter((reference) => reference.owningWorkflowId !== secondWorkflowId)
      .map((reference) => reference.resourceId));
    const before = new Map(useEditorStore.getState().nodes
      .filter((node) => secondDomainIds.has(node.data.domainNodeId))
      .map((node) => [node.id, node.position]));

    useEditorStore.getState().autoLayout('TB', firstDomainIds);

    const after = useEditorStore.getState().nodes
      .filter((node) => secondDomainIds.has(node.data.domainNodeId));
    expect(after.every((node) => JSON.stringify(node.position) === JSON.stringify(before.get(node.id)))).toBe(true);
  });
});
