import { beforeEach, describe, expect, it, vi } from 'vitest';
import { played } from '../test/fakes';

vi.mock('./context', async () => (await import('../test/fakes')).fakeContextModule);
// Phrase audio arrives after 20 ms, like an uncached TTS request.
vi.mock('./cache', () => ({
  phraseAudio: (_k: string, _t: unknown, text: string) =>
    new Promise((r) => setTimeout(() => r({ audio: new TextEncoder().encode(text).buffer, cached: false }), 20)),
}));

const { playPhrase } = await import('./phrases');
const { PlaybackQueue } = await import('./player');
const tts = { model: 't' };

beforeEach(() => {
  played.length = 0;
});

describe('playPhrase', () => {
  it('plays the phrase', async () => {
    const q = new PlaybackQueue();
    await playPhrase('k', tts, 'Hallo', q);
    expect(played).toEqual(['Hallo']);
  });

  it('drops a phrase that arrives after the queue was stopped (e.g. another language was tapped)', async () => {
    const q = new PlaybackQueue();
    q.gapMs = 0;
    const first = playPhrase('k', tts, 'Arabisch?', q);
    q.stop();
    const second = playPhrase('k', tts, 'Türkçe?', q);
    await Promise.all([first, second]);
    expect(played).toEqual(['Türkçe?']);
  });

  it('onlyIfIdle: drops the "one moment" filler if the real answer got queued meanwhile', async () => {
    const q = new PlaybackQueue();
    q.gapMs = 0;
    const filler = playPhrase('k', tts, 'Einen Moment', q, { onlyIfIdle: true });
    q.enqueue(new Promise((r) => setTimeout(() => r({ label: 'Antwort' } as unknown as AudioBuffer), 30)));
    await filler;
    await q.drain();
    expect(played).toEqual(['Antwort']);
  });
});
