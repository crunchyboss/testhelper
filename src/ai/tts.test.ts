import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeOpenRouter, json } from '../test/fakes';
import { synthesize } from './tts';

vi.stubGlobal('location', { origin: 'http://test' });
afterEach(() => vi.unstubAllGlobals());

describe('synthesize', () => {
  it('falls back to pcm once a model rejects mp3, wraps it as WAV and remembers the model', async () => {
    const router = fakeOpenRouter({
      '/audio/speech': (body) =>
        body.response_format === 'mp3'
          ? json({ error: { message: 'Gemini TTS only supports response_format="pcm". Got "mp3".' } }, 400)
          : new Response(new Uint8Array([1, 0, 2, 0]), { headers: { 'Content-Type': 'audio/pcm;rate=24000' } }),
    });
    vi.stubGlobal('location', { origin: 'http://test' });
    vi.stubGlobal('fetch', router.fetch);

    const first = await synthesize('k', { model: 'google/gemini-tts', voice: 'Kore' }, 'Hallo');
    expect(first.format).toBe('pcm');
    const view = new DataView(first.audio);
    expect(String.fromCharCode(...new Uint8Array(first.audio, 0, 4))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(24000);
    expect(router.calls.map((c) => c.body.response_format)).toEqual(['mp3', 'pcm']);

    await synthesize('k', { model: 'google/gemini-tts' }, 'Nochmal');
    expect(router.calls.map((c) => c.body.response_format)).toEqual(['mp3', 'pcm', 'pcm']);
  });

  it('does not fall back on other 400 errors', async () => {
    const router = fakeOpenRouter({ '/audio/speech': () => json({ error: { message: 'unknown voice' } }, 400) });
    vi.stubGlobal('location', { origin: 'http://test' });
    vi.stubGlobal('fetch', router.fetch);
    const err = await synthesize('k', { model: 'x', voice: 'nope' }, 'Hi').catch((e) => e);
    expect(err).toMatchObject({ status: 400, stage: 'tts', message: 'unknown voice' });
    expect(router.calls).toHaveLength(1);
  });
});
