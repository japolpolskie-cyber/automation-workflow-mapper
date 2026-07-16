import { describe, expect, it } from 'vitest';
import { getApplicationPack, getOperation } from './application-packs.js';
import { getCanonicalFunction } from './canonical-registry.js';

describe('real-world catalog benchmark: Asana CRM lifecycle', () => {
  it('represents the operations and control semantics needed by the scope', () => {
    const requiredOperations = [
      ['asana', 'task-moved-to-section'],
      ['asana', 'get-task-details'],
      ['google-drive', 'find-folder'],
      ['google-drive', 'create-folder'],
      ['asana', 'find-subtask'],
      ['asana', 'create-subtask'],
      ['asana', 'update-subtask'],
      ['gmail', 'send-email'],
      ['google-sheets', 'add-row'],
    ] as const;
    for (const [applicationId, operationId] of requiredOperations) expect(getOperation(applicationId, operationId), `${applicationId}.${operationId}`).toBeDefined();

    expect(getCanonicalFunction('binary-condition')).toMatchObject({ compatibilityRules: expect.arrayContaining([expect.objectContaining({ value: '2' })]) });
    expect(getCanonicalFunction('multi-route-decision')).toMatchObject({ compatibilityRules: expect.arrayContaining([expect.objectContaining({ value: '3+' })]) });
    expect(getCanonicalFunction('iterator')).toMatchObject({ acceptedCardinality: ['collection'] });
    expect(getCanonicalFunction('merge')?.purpose).toMatch(/rejoin/i);
    expect(getCanonicalFunction('aggregator')?.purpose).toMatch(/combine multiple item results/i);
    expect(getCanonicalFunction('filter')?.compatibilityRules).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'unmatched_behavior', value: 'stop' })]));

    const addRow = getOperation('google-sheets', 'add-row');
    const batchRows = getOperation('google-sheets', 'append-rows-batch');
    expect(addRow).toMatchObject({ acceptedInputCardinality: ['single'], producedOutputCardinality: 'single', batchSupported: false });
    expect(batchRows).toMatchObject({ acceptedInputCardinality: ['collection'], batchSupported: true });
    expect(batchRows?.knownPlatformMappings.find((item) => item.platform === 'zapier')).toMatchObject({ support: 'unsupported', limitation: expect.any(String), alternative: expect.any(String) });

    expect(getApplicationPack('asana')?.operations.length).toBeGreaterThanOrEqual(5);
    expect(getApplicationPack('google-drive')?.operations.map((item) => item.operationId)).toEqual(expect.arrayContaining(['find-folder', 'create-folder']));
  });
});
