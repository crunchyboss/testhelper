import { clear, createStore, get, set } from 'idb-keyval';
import type { TtsConfig } from '../ai/tts';
import { synthesize } from '../ai/tts';
import { hash } from '../hash';

// Own database: clearing audio never touches the API key, overrides or session logs.
const store = createStore('lernhilfe-audio', 'clips');

export interface CachedExplanation {
  text: string;
  clips: ArrayBuffer[];
  createdAt: string;
}

const phraseKey = (tts: TtsConfig, text: string) => `phrase|${tts.model}|${tts.voice ?? ''}|${hash(text)}`;

/** Fixed phrase audio (greeting, error): synthesized once, then served from IndexedDB. */
export async function phraseAudio(apiKey: string, tts: TtsConfig, text: string): Promise<{ audio: ArrayBuffer; cached: boolean }> {
  const key = phraseKey(tts, text);
  const hit = await get<ArrayBuffer>(key, store);
  if (hit) return { audio: hit.slice(0), cached: true };
  const { audio } = await synthesize(apiKey, tts, text);
  await set(key, audio.slice(0), store);
  return { audio, cached: false };
}

export async function hasPhrase(tts: TtsConfig, text: string): Promise<boolean> {
  return (await get(phraseKey(tts, text), store)) != null;
}

export const explanationKey = (parts: (string | number | undefined)[]) => `explain|${parts.map((p) => p ?? '').join('|')}`;

export async function getExplanation(key: string): Promise<CachedExplanation | undefined> {
  const hit = await get<CachedExplanation>(key, store);
  return hit && { ...hit, clips: hit.clips.map((c) => c.slice(0)) };
}

export const saveExplanation = (key: string, value: CachedExplanation) => set(key, value, store);

export const clearAudioCache = () => clear(store);
