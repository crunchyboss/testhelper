import { pcm16ToWav, pcmRateFromContentType } from '../audio/wav';
import { fail, OpenRouterError, postJson } from './openrouter';

export type TtsFormat = 'mp3' | 'pcm';

export interface TtsConfig {
  model: string;
  voice?: string;
  /** Only some providers (e.g. OpenAI) honour speed. */
  speed?: number;
  /** mp3 is smaller; some models (Gemini TTS) only deliver pcm. Omitted → mp3 with automatic pcm fallback. */
  format?: TtsFormat;
}

export interface TtsResult {
  /** mp3 or wav bytes, ready for decodeAudioData. */
  audio: ArrayBuffer;
  format: TtsFormat;
  latencyMs: number;
  generationId: string | null;
}

// Models that rejected mp3 during this app run; skip the failing first attempt next time.
const pcmOnly = new Set<string>();

async function request(apiKey: string, cfg: TtsConfig, input: string, format: TtsFormat, signal?: AbortSignal) {
  return postJson(
    apiKey,
    '/audio/speech',
    {
      model: cfg.model,
      input,
      response_format: format,
      ...(cfg.voice ? { voice: cfg.voice } : {}),
      ...(cfg.speed ? { speed: cfg.speed } : {}),
    },
    signal,
    { timeoutMs: 25_000, stage: 'tts' },
  );
}

/** POST /audio/speech. Prefers mp3; pcm is wrapped into WAV so both play the same way. */
export async function synthesize(apiKey: string, cfg: TtsConfig, input: string, signal?: AbortSignal): Promise<TtsResult> {
  const t0 = performance.now();
  let format: TtsFormat = cfg.format ?? (pcmOnly.has(cfg.model) ? 'pcm' : 'mp3');
  let res = await request(apiKey, cfg, input, format, signal);

  if (!res.ok && res.status === 400 && format === 'mp3' && !cfg.format) {
    const message = await res.clone().text();
    if (/pcm/i.test(message)) {
      pcmOnly.add(cfg.model);
      format = 'pcm';
      res = await request(apiKey, cfg, input, format, signal);
    }
  }
  if (!res.ok) await fail(res, 'tts');

  const raw = await res.arrayBuffer();
  if (raw.byteLength === 0) throw new OpenRouterError(502, 'leere Audioantwort', 'tts');
  const audio = format === 'pcm' ? pcm16ToWav(raw, pcmRateFromContentType(res.headers.get('Content-Type'))) : raw;
  return { audio, format, latencyMs: Math.round(performance.now() - t0), generationId: res.headers.get('X-Generation-Id') };
}
