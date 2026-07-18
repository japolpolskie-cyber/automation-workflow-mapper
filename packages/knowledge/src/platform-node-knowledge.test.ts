import { describe, expect, it } from 'vitest';
import { buildPlatformKnowledgeContext, retrievePlatformNodeKnowledge } from './platform-node-knowledge.js';

describe('platform node knowledge retrieval', () => {
  it.each(['n8n', 'make', 'zapier'] as const)('never leaks another platform into %s retrieval', (platform) => {
    const result = retrievePlatformNodeKnowledge(platform, 'When a webhook arrives, process each attachment, then route by status and wait one day.');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.platform === platform)).toBe(true);
  });

  it('selects the closest n8n collection operation without conflicting loop nodes', () => {
    const split = retrievePlatformNodeKnowledge('n8n', 'Process each attachment from the message.');
    expect(split.map((item) => item.name)).toContain('Split Out');
    expect(split.map((item) => item.name)).not.toContain('Loop Over Items');

    const batch = retrievePlatformNodeKnowledge('n8n', 'Process records in batches with a batch size of 20.');
    expect(batch.map((item) => item.name)).toContain('Loop Over Items');
    expect(batch.map((item) => item.name)).not.toContain('Split Out');
  });

  it('keeps Make Router separate from Iterator and Text Parser', () => {
    const result = retrievePlatformNodeKnowledge('make', 'Process each attachment and route records by status.');
    expect(result.map((item) => item.name)).toEqual(expect.arrayContaining(['Iterator', 'Router']));
    expect(result.map((item) => item.name)).not.toContain('Text Parser');
  });

  it('builds a compact platform-specific context', () => {
    const context = buildPlatformKnowledgeContext('zapier', 'Catch a webhook, process each line item, then notify based on status.');
    expect(context).toContain('Selected platform: zapier');
    expect(context).toContain('Looping by Zapier');
    expect(context).not.toMatch(/n8n|Make Flow Control|Make —/);
    expect(context.length).toBeLessThan(6_000);
  });
});
