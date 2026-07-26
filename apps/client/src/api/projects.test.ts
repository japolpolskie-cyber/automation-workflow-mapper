import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectApi, request } from './projects';

describe('API error handling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('turns a network failure into actionable local-service guidance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(request('/health')).rejects.toThrow('Confirm the server is running');
  });

  it('does not attempt to parse a non-JSON server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, headers: { get: () => 'text/html' } }));
    await expect(request('/health')).rejects.toThrow('(502)');
  });

  it('sends the explicit single-workflow analysis mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: {}, error: null, meta: { requestId: 'test' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await projectApi.analyze('00000000-0000-4000-8000-000000000001', 'single');

    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      projectId: '00000000-0000-4000-8000-000000000001',
      workflowMode: 'single',
    });
  });

  it('submits only provided normalized clarification answers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: {}, error: null, meta: { requestId: 'test' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await projectApi.analyze('00000000-0000-4000-8000-000000000001', 'auto', [
      { recommendationId: 'process-clarification-actor-owner', answerType: 'actor', value: 'Operations', sourceRecommendationCategory: 'actor-owner' },
    ]);

    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toMatchObject({
      clarificationAnswers: [{ recommendationId: 'process-clarification-actor-owner', answerType: 'actor', value: 'Operations' }],
    });

    await projectApi.analyze('00000000-0000-4000-8000-000000000001', 'auto', []);
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).not.toHaveProperty('clarificationAnswers');
  });
});
