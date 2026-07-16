import { describe, expect, it } from 'vitest';
import { createWorkflowSetFromGraph, leadQualificationWorkflow } from '@awm/shared';
import { buildPlatformPlan } from '@awm/platforms';
import { evaluateWorkflowReadiness, splitIndependentWorkflows } from './workflow-product';

describe('workflow product projections', () => {
  it('separates independent trigger chains without changing the canonical workflow', () => {
    const secondTrigger = {
      ...leadQualificationWorkflow.nodes[0]!,
      id: '70000000-0000-4000-8000-000000000001',
      name: 'Receive renewal reminder',
    };
    const workflow = {
      ...leadQualificationWorkflow,
      nodes: [...leadQualificationWorkflow.nodes, secondTrigger],
    };

    const workflowSet = createWorkflowSetFromGraph(workflow);
    const slices = splitIndependentWorkflows(workflow, workflowSet);

    expect(slices).toHaveLength(2);
    expect(slices.map((slice) => slice.label)).toContain('Receive renewal reminder');
    expect(slices.flatMap((slice) => slice.workflow.nodes)).toHaveLength(workflow.nodes.length);
    expect(workflow.nodes).toHaveLength(leadQualificationWorkflow.nodes.length + 1);
  });

  it('shows one shared canonical node in every workflow that references it', () => {
    const secondTrigger = { ...leadQualificationWorkflow.nodes[0]!, id: '70000000-0000-4000-8000-000000000001', name: 'Receive renewal reminder' };
    const workflow = { ...leadQualificationWorkflow, nodes: [...leadQualificationWorkflow.nodes, secondTrigger] };
    const workflowSet = createWorkflowSetFromGraph(workflow);
    const sharedNodeId = leadQualificationWorkflow.nodes[0]!.id;
    const sharedSet = {
      ...workflowSet,
      nodeReferences: workflowSet.nodeReferences.map((reference) => reference.resourceId === sharedNodeId
        ? { ...reference, referencedByWorkflowIds: [workflowSet.workflows[1]!.id] }
        : reference),
    };

    const slices = splitIndependentWorkflows(workflow, sharedSet);

    expect(slices).toHaveLength(2);
    expect(slices.every((slice) => slice.workflow.nodes.some((node) => node.id === sharedNodeId))).toBe(true);
    expect(workflow.nodes.filter((node) => node.id === sharedNodeId)).toHaveLength(1);
  });

  it('prioritizes required clarifications in readiness status', () => {
    const plan = buildPlatformPlan('n8n', leadQualificationWorkflow);
    expect(evaluateWorkflowReadiness(leadQualificationWorkflow, plan).status).toBe('Needs Clarification');
  });

  it('reports a fully configured supported workflow as build ready', () => {
    const workflow = {
      ...leadQualificationWorkflow,
      nodes: leadQualificationWorkflow.nodes.map((node) => ({
        ...node,
        status: 'configured' as const,
        configurationCompleteness: 100,
      })),
      clarificationQuestions: [],
    };
    const plan = buildPlatformPlan('n8n', workflow);
    const supportedPlan = { ...plan, nodes: plan.nodes.map((node) => ({ ...node, limitations: [], decisionsRequired: [] })) };

    expect(evaluateWorkflowReadiness(workflow, supportedPlan)).toMatchObject({
      status: 'Build Ready',
      completed: workflow.nodes.length,
      total: workflow.nodes.length,
    });
  });
});
