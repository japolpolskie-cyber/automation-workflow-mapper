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
});
