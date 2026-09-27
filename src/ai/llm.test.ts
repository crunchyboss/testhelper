import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeOpenRouter, sse } from '../test/fakes';
import { streamChat } from './llm';
import { OpenRouterError } from './openrouter';

vi.stubGlobal('location', { origin: 'http://test' });
afterEach(() => vi.unstubAllGlobals());

const cfg = { model: 'm' };

describe('streamChat (SSE)', () => {
  it('parses events split across chunks, skips comments, reads usage and id', async () => {
    const router = fakeOpenRouter({
      '/chat/completions': () =>
        sse([
          ': OPENROUTER PROCESSING\n\n',
          'data: {"id":"gen-1","choices":[{"delta":{"content":"Hal"}}]}\n\ndata: {"choices":[{"del',
          'ta":{"content":"lo."}}]}\n\n',
          'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"cost":0.001}}\n\ndata: [DONE]\n\n',
        ]),
    });
    vi.stubGlobal('location', { origin: 'http://test' });
    vi.stubGlobal('fetch', router.fetch);
    const deltas: string[] = [];
    const r = await streamChat('k', cfg, [{ role: 'user', content: 'x' }], (d) => deltas.push(d));
    expect(deltas).toEqual(['Hal', 'lo.']);
    expect(r).toMatchObject({ text: 'Hallo.', generationId: 'gen-1', usage: { cost: 0.001, prompt_tokens: 10 } });
    expect(r.ttftMs).not.toBeNull();
    expect(router.calls[0].body).toMatchObject({ model: 'm', stream: true });
  });

  it('throws an llm error when the stream reports one', async () => {
    const router = fakeOpenRouter({
      '/chat/completions': () =>
        sse(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', 'data: {"error":{"code":502,"message":"upstream"}}\n\n']),
    });
    vi.stubGlobal('location', { origin: 'http://test' });
    vi.stubGlobal('fetch', router.fetch);
    const err = await streamChat('k', cfg, [], () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect(err).toMatchObject({ status: 502, stage: 'llm' });
  });
});
