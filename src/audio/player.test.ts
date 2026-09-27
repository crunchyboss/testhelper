import { describe, expect, it, vi } from 'vitest';

const played: string[] = [];

// Fake AudioContext: a source "plays" for 5 ms and records its buffer's label.
vi.mock('./context', () => ({
  audioContext: () => ({
    destination: {},
    createBufferSource: () => {
      const src: { buffer?: { label: string }; onended?: () => void; connect(): void; start(): void; stop(): void } = {
        connect() {},
        start() {
          played.push(src.buffer!.label);
          setTimeout(() => src.onended?.(), 5);
        },
        stop() {
          src.onended?.();
        },
      };
      return src;
    },
  }),
}));

const { PlaybackQueue } = await import('./player');
const buf = (label: string, delay = 0) =>
  new Promise<AudioBuffer>((r) => setTimeout(() => r({ label } as unknown as AudioBuffer), delay));

describe('PlaybackQueue', () => {
  it('plays in enqueue order even if later buffers are ready first', async () => {
    played.length = 0;
    const q = new PlaybackQueue();
    q.gapMs = 0;
    q.enqueue(buf('a', 30));
    q.enqueue(buf('b', 0));
    expect(q.isIdle).toBe(false);
    await q.drain();
    expect(played).toEqual(['a', 'b']);
    expect(q.isIdle).toBe(true);
  });

  it('stop skips pending items and resets the idle state', async () => {
    played.length = 0;
    const q = new PlaybackQueue();
    q.gapMs = 0;
    q.enqueue(buf('x', 20));
    q.stop();
    expect(q.isIdle).toBe(true);
    await new Promise((r) => setTimeout(r, 40));
    expect(played).toEqual([]);
  });

  it('replays the remembered turn but not notices', async () => {
    played.length = 0;
    const q = new PlaybackQueue();
    q.gapMs = 0;
    q.beginTurn();
    q.enqueue(buf('s1'));
    q.enqueue(buf('s2'));
    q.enqueue(buf('notice'), undefined, false);
    await q.drain();
    await q.replay();
    expect(played).toEqual(['s1', 's2', 'notice', 's1', 's2']);
  });

  it('reports failed items and keeps playing the rest', async () => {
    played.length = 0;
    const q = new PlaybackQueue();
    q.gapMs = 0;
    const errors: unknown[] = [];
    q.onError = (e) => errors.push(e);
    q.enqueue(Promise.reject(new Error('tts 502')));
    q.enqueue(buf('ok'));
    await q.drain();
    expect(played).toEqual(['ok']);
    expect(errors).toHaveLength(1);
    expect(q.isIdle).toBe(true);
  });
});
