import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterError, postJson } from './openrouter';

vi.stubGlobal('location', { origin: 'http://test' });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('location', { origin: 'http://test' });
});

describe('postJson', () => {
  it('retries once on 502 and returns the second response', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const res = await postJson('k', '/x', {});
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('no', { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    expect((await postJson('k', '/x', {})).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('turns a hanging request into a timeout error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      ),
    );
    const err = await postJson('k', '/x', {}, undefined, { timeoutMs: 20, retries: 0, stage: 'tts' }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect(err).toMatchObject({ status: 408, stage: 'tts' });
  });

  it('retries a network error once, then reports it', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Load failed'));
    vi.stubGlobal('fetch', fetch);
    const err = await postJson('k', '/x', {}).catch((e) => e);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(err.message).toMatch(/Netzwerkfehler: Load failed/);
  });

  it('passes a user abort through without retry', async () => {
    const ctrl = new AbortController();
    const fetch = vi.fn((_u: string, init: RequestInit) => {
      ctrl.abort();
      return init.signal!.aborted ? Promise.reject(new DOMException('aborted', 'AbortError')) : Promise.resolve(new Response());
    });
    vi.stubGlobal('fetch', fetch);
    const err = await postJson('k', '/x', {}, ctrl.signal).catch((e) => e);
    expect(err.name).toBe('AbortError');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
