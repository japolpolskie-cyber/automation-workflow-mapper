// @vitest-environment jsdom
import { minimumWorkflowBrief } from '@awm/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workflowBriefApi } from './workflow-brief';

afterEach(() => vi.unstubAllGlobals());

describe('workflowBriefApi', () => {
  it('posts the trimmed source requirement contract to the internal endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: { brief: minimumWorkflowBrief, detectionSummary: { candidateCount: 0, detectedFunctions: [], clarificationCount: 0 } }, error: null, meta: { requestId: 'test' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await workflowBriefApi.generateDraft('Review the request.');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/internal/workflow-brief/draft',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ sourceRequirement: 'Review the request.' }) }),
    );
  });

  it('rejects a malformed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: { brief: {}, detectionSummary: {} }, error: null, meta: { requestId: 'test' } }),
    }));
    await expect(workflowBriefApi.generateDraft('Review the request.')).rejects.toThrow('invalid Workflow Brief response');
  });
});

