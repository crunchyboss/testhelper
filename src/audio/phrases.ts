import type { TtsConfig } from '../ai/tts';
import { phraseAudio } from './cache';
import { decodeAudio, PlaybackQueue } from './player';

/**
 * Plays a fixed, cached phrase without making it the "Nochmal hören" target. Errors are swallowed.
 * If the queue was stopped while the phrase was being fetched (cancel, other language tapped),
 * it is dropped instead of playing late. onlyIfIdle: also drop it if other audio got queued meanwhile.
 */
export async function playPhrase(
  apiKey: string,
  tts: TtsConfig,
  text: string | undefined,
  queue: PlaybackQueue,
  { onlyIfIdle = false } = {},
): Promise<void> {
  if (!text) return;
  const gen = queue.generationId;
  try {
    const { audio } = await phraseAudio(apiKey, tts, text);
    if (queue.generationId !== gen || (onlyIfIdle && !queue.isIdle)) return;
    queue.enqueue(decodeAudio(audio), undefined, false);
    await queue.drain();
  } catch {
    // a missing notice must never block the learner
  }
}
