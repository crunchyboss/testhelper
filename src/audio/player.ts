import { audioContext } from './context';

export function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  return audioContext().decodeAudioData(data);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Plays audio buffers strictly in enqueue order while they are still being fetched/decoded
 * in parallel. Plays through the shared AudioContext only, never <audio>, because of the iOS autoplay lock.
 */
export class PlaybackQueue {
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;
  private current: AudioBufferSourceNode | null = null;
  private turnBuffers: AudioBuffer[] = [];
  /** Enqueued items of the current generation that have not started playing yet. */
  private pending = 0;

  /** Pause between sentences; helps slow listeners. */
  gapMs = 250;
  onError?: (e: unknown) => void;

  beginTurn(): void {
    this.turnBuffers = [];
  }

  /** remember=false: not replayed by "Nochmal hören" (greetings, error notices). */
  enqueue(buffer: Promise<AudioBuffer>, onStart?: () => void, remember = true): void {
    const gen = this.generation;
    this.pending++;
    const settle = () => gen === this.generation && this.pending--;
    buffer.catch(() => {}); // handled when the chain reaches it
    this.chain = this.chain.then(async () => {
      if (gen !== this.generation) return;
      let buf: AudioBuffer;
      try {
        buf = await buffer;
      } catch (e) {
        settle();
        if (gen === this.generation) this.onError?.(e);
        return;
      }
      if (gen !== this.generation) return;
      settle();
      if (remember) this.turnBuffers.push(buf);
      onStart?.();
      await this.play(buf);
      if (gen === this.generation) await sleep(this.gapMs);
    });
  }

  /** Resolves when everything enqueued so far has played (or was stopped). */
  drain(): Promise<void> {
    return this.chain;
  }

  /** Changes on every stop(); lets async callers detect that they were cancelled meanwhile. */
  get generationId(): number {
    return this.generation;
  }

  /** Nothing playing and nothing waiting (e.g. no TTS sentence on its way). */
  get isIdle(): boolean {
    return this.pending === 0 && this.current == null;
  }

  stop(): void {
    this.generation++;
    this.pending = 0;
    this.chain = Promise.resolve();
    try {
      this.current?.stop();
    } catch {
      // already stopped
    }
    this.current = null;
  }

  get canReplay(): boolean {
    return this.turnBuffers.length > 0;
  }

  replay(onStart?: () => void): Promise<void> {
    const buffers = this.turnBuffers;
    this.stop();
    this.turnBuffers = [];
    buffers.forEach((b, i) => this.enqueue(Promise.resolve(b), i === 0 ? onStart : undefined));
    return this.drain();
  }

  private play(buf: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const ctx = audioContext();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => {
        if (this.current === src) this.current = null;
        resolve();
      };
      this.current = src;
      src.start();
    });
  }
}
