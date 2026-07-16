import { describe, expect, it } from 'vitest';
import { repairWorkflowCandidate } from './workflow-repair.js';

describe('repairWorkflowCandidate', () => {
  it('normalizes placeholder IDs and preserves their references', () => {
    const repaired = repairWorkflowCandidate({ id: 'workflow-1', riskLevel: 'low', nodes: [{ id: 'step-1', name: '', timeoutSeconds: 0, retryPolicy: { attempts: 2, backoff: 'linear' } }, { id: 'step-2' }], connections: [{ id: 'edge-1', sourceNodeId: 'step-1', targetNodeId: 'step-2' }] });
    const value = repaired.value as { createdAt: string; updatedAt: string; nodes: Array<{ id: string; timeoutSeconds?: number; retryPolicy?: { backoff: string } }>; connections: Array<{ id: string; sourceNodeId: string; targetNodeId: string }> };
    expect(value.nodes[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(value.connections[0]!.sourceNodeId).toBe(value.nodes[0]!.id);
    expect(value.connections[0]!.targetNodeId).toBe(value.nodes[1]!.id);
    expect(value.nodes[0]!.timeoutSeconds).toBeUndefined();
    expect(value.nodes[0]!.retryPolicy?.backoff).toBe('fixed');
    expect(repaired.repairs).toContain('non-positive timeout removed');
    expect(value.createdAt).toMatch(/T/);
    expect(value.updatedAt).toMatch(/T/);
    expect(repaired.repairs).toContain('misplaced workflow property removed');
    expect(repaired.repairs).toContain('empty node name supplied');
  });

  it('removes harmless null architecture metadata so schema defaults can apply', () => {
    const repaired = repairWorkflowCandidate({ id: crypto.randomUUID(), nodes: [{ id: crypto.randomUUID(), name: 'Send email', expectedResult: null, purpose: null, bestPractices: null }], connections: [{ id: crypto.randomUUID(), label: null, sourcePort: null, targetPort: null, mappings: null }] });
    const node = (repaired.value as { nodes: Array<Record<string, unknown>> }).nodes[0]!;
    expect(node.expectedResult).toBeUndefined();
    expect(node.purpose).toBeUndefined();
    expect(node.bestPractices).toBeUndefined();
    const connection = (repaired.value as { connections: Array<Record<string, unknown>> }).connections[0]!;
    expect(connection.label).toBeUndefined();
    expect(connection.sourcePort).toBeUndefined();
    expect(connection.mappings).toBeUndefined();
  });
});
