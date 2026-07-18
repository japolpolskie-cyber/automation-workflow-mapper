import { describe, expect, it } from 'vitest';
import { compileAutomationArchitecture } from './architecture-compiler.js';
import { leadQualificationWorkflow } from './fixtures.js';
import { validateWorkflowGraph } from './graph.js';
import { migrateWorkflow } from './workflow-migration.js';

describe('automation architecture compiler', () => {
  it('migrates v1 workflows without changing stable identifiers', () => {
    const legacy = { ...structuredClone(leadQualificationWorkflow), schemaVersion: '1.0' as const };
    const migrated = migrateWorkflow(legacy);
    expect(migrated.schemaVersion).toBe('2.0');
    expect(migrated.id).toBe(legacy.id);
    expect(migrated.nodes.map((node) => node.id)).toEqual(legacy.nodes.map((node) => node.id));
    expect(migrated.nodes.every((node) => node.purpose && node.expectedResult && node.icon)).toBe(true);
  });

  it('adds professional decision, merge, retry guidance, and completion architecture', () => {
    const compiled = compileAutomationArchitecture(leadQualificationWorkflow);
    const condition = compiled.nodes.find((node) => node.category === 'condition')!;
    const decisionEdges = compiled.connections.filter((edge) => edge.sourceNodeId === condition.id && edge.routeType !== 'error');
    expect(decisionEdges).toHaveLength(2);
    expect(decisionEdges.map((edge) => edge.branchLabel)).toEqual(expect.arrayContaining(['TRUE', 'FALSE']));
    expect(compiled.nodes.some((node) => node.category === 'merge')).toBe(true);
    expect(compiled.nodes.some((node) => node.category === 'retry')).toBe(false);
    expect(compiled.nodes.filter((node) => ['action', 'api_request', 'database', 'notification'].includes(node.category)).some((node) => node.retryPolicy?.attempts === 2)).toBe(true);
    expect(compiled.nodes.some((node) => node.category === 'end')).toBe(true);
    expect(validateWorkflowGraph(compiled).valid).toBe(true);
  });

  it('keeps a large generated workflow structurally valid', () => {
    const workflow = structuredClone(leadQualificationWorkflow);
    for (let index = 0; index < 40; index += 1) {
      const source = workflow.nodes.at(-1)!;
      const node = { ...structuredClone(workflow.nodes[1]!), id: crypto.randomUUID(), name: `Process batch ${index + 1}`, service: null, category: 'transformation' as const };
      workflow.nodes.push(node);
      workflow.connections.push({ ...workflow.connections[0]!, id: crypto.randomUUID(), sourceNodeId: source.id, targetNodeId: node.id, label: 'SUCCESS', branchLabel: 'SUCCESS' });
    }
    expect(validateWorkflowGraph(compileAutomationArchitecture(workflow)).valid).toBe(true);
  });

  it('turns a generic condition continuation into TRUE and connects a FALSE outcome', () => {
    const workflow = structuredClone(leadQualificationWorkflow);
    const condition = workflow.nodes.find((node) => node.category === 'condition')!;
    const originalTargetId = workflow.connections.find((edge) => edge.sourceNodeId === condition.id)!.targetNodeId;
    const target = workflow.nodes.find((node) => node.id === originalTargetId)!;
    workflow.connections = workflow.connections.filter((edge) => edge.sourceNodeId !== condition.id);
    workflow.connections.push({
      ...workflow.connections[0]!,
      id: crypto.randomUUID(),
      sourceNodeId: condition.id,
      targetNodeId: target.id,
      label: 'SUCCESS',
      branchLabel: 'SUCCESS',
      routeType: 'success',
      style: 'success',
    });

    const compiled = compileAutomationArchitecture(workflow);
    const decisionEdges = compiled.connections.filter((edge) => edge.sourceNodeId === condition.id);

    expect(decisionEdges.map((edge) => edge.branchLabel).sort()).toEqual(['FALSE', 'TRUE']);
    expect(validateWorkflowGraph(compiled).valid).toBe(true);
  });

  it('does not duplicate an explicit FALSE label when another continuation is generic', () => {
    const workflow = structuredClone(leadQualificationWorkflow);
    const condition = workflow.nodes.find((node) => node.category === 'condition')!;
    const target = workflow.nodes.find((node) => node.id === workflow.connections.find((edge) => edge.sourceNodeId === condition.id)!.targetNodeId)!;
    const alternate = { ...structuredClone(target), id: crypto.randomUUID(), name: 'Continue review' };
    workflow.nodes.push(alternate);
    workflow.connections = workflow.connections.filter((edge) => edge.sourceNodeId !== condition.id);
    workflow.connections.push(
      { ...workflow.connections[0]!, id: crypto.randomUUID(), sourceNodeId: condition.id, targetNodeId: target.id, label: 'FALSE', branchLabel: 'FALSE', routeType: 'conditional', style: 'failure' },
      { ...workflow.connections[0]!, id: crypto.randomUUID(), sourceNodeId: condition.id, targetNodeId: alternate.id, label: '', branchLabel: null, routeType: 'success', style: 'default' },
    );

    const compiled = compileAutomationArchitecture(workflow);
    const labels = compiled.connections.filter((edge) => edge.sourceNodeId === condition.id).map((edge) => edge.branchLabel);

    expect(labels.sort()).toEqual(['FALSE', 'TRUE']);
    expect(validateWorkflowGraph(compiled).valid).toBe(true);
  });
});
