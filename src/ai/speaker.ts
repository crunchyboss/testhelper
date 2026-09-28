import { decodeAudio, PlaybackQueue } from '../audio/player';
import { cleanForSpeech, SentenceSplitter } from './sentences';
import { synthesize, TtsConfig } from './tts';

export interface TtsMetrics {
  model: string;
  voice?: string;
  sentences: number;
  chars: number;
  latencies: number[];
  generationIds: string[];
  /** Resolved in the background after the turn finishes (see resolveTtsCost); undefined while still pending. */
  cost?: number | null;
  costSource?: 'generation-api' | 'schaetzung' | 'offen' | 'unbekannt';
}

/**
 * Sends sentences to TTS in parallel and plays them in order. Collects metrics and the encoded
 * audio (for caching). onFirstAudio fires once, when the first sentence starts playing.
 */
export function createSpeaker(apiKey: string, tts: TtsConfig, queue: PlaybackQueue, signal: AbortSignal, onFirstAudio: () => void) {
  const metrics: TtsMetrics = { model: tts.model, voice: tts.voice, sentences: 0, chars: 0, latencies: [], generationIds: [] };
  const clips: Promise<ArrayBuffer | null>[] = [];
  let started = false;
  let error: unknown = null;
  queue.onError = (e) => (error ??= e);
  queue.beginTurn();

  function speak(sentence: string) {
    const text = cleanForSpeech(sentence);
    if (!text) return;
    metrics.sentences++;
    metrics.chars += text.length;
    const job = synthesize(apiKey, tts, text, signal);
    // decodeAudioData detaches its input, so cache and decode separate copies.
    clips.push(job.then((r) => r.audio.slice(0)).catch(() => null));
    const audio = job.then((r) => {
      metrics.latencies.push(r.latencyMs);
      if (r.generationId) metrics.generationIds.push(r.generationId);
      return decodeAudio(r.audio.slice(0));
    });
    queue.enqueue(audio, () => {
      if (started) return;
      started = true;
      onFirstAudio();
    });
  }

  return {
    metrics,
    speak,
    /** Speaks a complete text, split into sentences. */
    speakText(text: string) {
      const splitter = new SentenceSplitter();
      [...splitter.push(text), ...splitter.flush()].forEach(speak);
    },
    get error() {
      return error;
    },
    /** Encoded audio per sentence, only if every sentence succeeded. */
    async clips(): Promise<ArrayBuffer[] | undefined> {
      const encoded = await Promise.all(clips);
      return encoded.every((c) => c) ? (encoded as ArrayBuffer[]) : undefined;
    },
  };
}
