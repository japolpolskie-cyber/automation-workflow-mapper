import { afterEach, describe, expect, it, vi } from 'vitest';
import { leadQualificationWorkflow } from '@awm/shared';
import { OllamaAnalysisProvider } from './ollama-provider.js';

afterEach(() => vi.unstubAllGlobals());

describe('OllamaAnalysisProvider', () => {
  it('reports configured models that are installed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }), { status: 200 })));
    const provider = new OllamaAnalysisProvider({ baseUrl: 'http://127.0.0.1:11434', models: ['qwen3:8b', 'llama3.2:3b'] });
    await expect(provider.getStatus()).resolves.toMatchObject({ available: true, models: ['qwen3:8b'] });
  });

  it('falls back to the next installed model when the first fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }, { name: 'llama3.2:3b' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('model error', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: JSON.stringify(leadQualificationWorkflow) } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OllamaAnalysisProvider({ baseUrl: 'http://127.0.0.1:11434', models: ['qwen3:8b', 'llama3.2:3b'] });
    const result = await provider.analyze({ scope: 'test', projectName: 'test', platform: 'n8n' });
    expect(result).toContain('Lead Qualification');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not fall back to an unconfigured cloud service', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const provider = new OllamaAnalysisProvider({ baseUrl: 'http://127.0.0.1:11434', models: ['qwen3:8b'] });
    await expect(provider.analyze({ scope: 'test', projectName: 'test', platform: 'n8n' })).rejects.toThrow(/not reachable/i);
  });

  it('serializes simultaneous local analysis requests', async () => {
    let releaseFirst!: () => void;
    const firstDone = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let activeChats = 0; let maximumActiveChats = 0; let chatNumber = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }), { status: 200 });
      activeChats += 1; maximumActiveChats = Math.max(maximumActiveChats, activeChats); chatNumber += 1;
      if (chatNumber === 1) await firstDone;
      activeChats -= 1;
      return new Response(JSON.stringify({ message: { content: JSON.stringify(leadQualificationWorkflow) } }), { status: 200 });
    }));
    const provider = new OllamaAnalysisProvider({ baseUrl: 'http://127.0.0.1:11434', models: ['qwen3:8b'] });
    const first = provider.analyze({ scope: 'one', projectName: 'one', platform: 'make' });
    const second = provider.analyze({ scope: 'two', projectName: 'two', platform: 'n8n' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(maximumActiveChats).toBe(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(maximumActiveChats).toBe(1);
  });

  it('uses the separate modular grounded-planner prompt', async () => {
    const plan = { version: '1.0', objective: 'Test plan', platform: 'n8n', steps: [], clarificationIds: [], warnings: [] };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: JSON.stringify(plan) } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock); const provider = new OllamaAnalysisProvider({ baseUrl: 'http://127.0.0.1:11434', models: ['qwen3:8b'] });
    await expect(provider.planGrounded({ system: 'grounded-system', user: 'grounded-sections', outputSchema: { type: 'object' } })).resolves.toContain('Test plan');
    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.messages[0].content).toBe('grounded-system');
    expect(body.messages[1].content).toContain('grounded-sections');
    expect(body.format).toEqual({ type: 'object' });
  });
});
