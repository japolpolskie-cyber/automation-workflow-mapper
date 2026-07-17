import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from './projects';

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
});
