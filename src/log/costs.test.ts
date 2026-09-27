import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeOpenRouter, json } from '../test/fakes';
import type { LogEvent } from './types';

const tts = (over: Partial<NonNullable<LogEvent['tts']>> = {}): NonNullable<LogEvent['tts']> => ({
  modell: 'x-ai/grok-voice-tts-1.0',
  stimme: 'eve',
  zeichen: 100,
  saetze: 2,
  latenzen_ms: [1, 2],
  generation_ids: ['g1', 'g2'],
  kosten_usd: null,
  kosten_quelle: 'offen',
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('location', { origin: 'http://test' });
  vi.resetModules(); // pricing is cached per module instance
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Also routes GET /generation?id=… and GET /models (fakeOpenRouter matches the path only). */
function stubFetch(routes: Parameters<typeof fakeOpenRouter>[0]) {
  const router = fakeOpenRouter(routes);
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => router.fetch(url, init));
  return router;
}

describe('resolveTtsCost', () => {
  it('sums the exact costs from the generation API once available', async () => {
    const { resolveTtsCost } = await import('./costs');
    stubFetch({ '/generation': (_b, n) => (n <= 2 ? json({}, 404) : json({ data: { total_cost: 0.0015 } })) });
    const result = resolveTtsCost('k', tts());
    await vi.advanceTimersByTimeAsync(6000);
    expect(await result).toEqual({ kosten_usd: 0.003, kosten_quelle: 'generation-api' });
  });

  it('falls back to chars × price for character-priced models', async () => {
    const { resolveTtsCost } = await import('./costs');
    stubFetch({
      '/generation': () => json({}, 404),
      '/models': () =>
        json({
          data: [
            { id: 'x-ai/grok-voice-tts-1.0', pricing: { prompt: '0.000015', completion: '0' } },
            { id: 'google/gemini-3.8-flash-tts', pricing: { prompt: '0.0000005', completion: '0.000009' } },
          ],
        }),
    });
    const grok = resolveTtsCost('k', tts());
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await grok).toEqual({ kosten_usd: 0.0015, kosten_quelle: 'schaetzung' });

    const gemini = resolveTtsCost('k', tts({ modell: 'google/gemini-3.8-flash-tts' }));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await gemini).toEqual({ kosten_usd: null, kosten_quelle: 'unbekannt' });
  });
});
