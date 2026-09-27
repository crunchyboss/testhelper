import { fail, postJson } from './openrouter';

export interface SttConfig {
  model: string;
  /** ISO-639-1; omitted → provider auto-detects. */
  language?: string | null;
}

export interface SttResult {
  text: string;
  latencyMs: number;
  cost?: number;
  usage?: Record<string, unknown>;
  generationId: string | null;
}

/** POST /audio/transcriptions with base64 WAV (JSON variant). */
export async function transcribe(
  apiKey: string,
  cfg: SttConfig,
  wavBase64: string,
  signal?: AbortSignal,
): Promise<SttResult> {
  const t0 = performance.now();
  const res = await postJson(
    apiKey,
    '/audio/transcriptions',
    {
      model: cfg.model,
      input_audio: { data: wavBase64, format: 'wav' },
      ...(cfg.language ? { language: cfg.language } : {}),
    },
    signal,
    { timeoutMs: 30_000, stage: 'stt' },
  );
  if (!res.ok) await fail(res, 'stt');
  const body = await res.json();
  return {
    text: (body.text ?? '').trim(),
    latencyMs: Math.round(performance.now() - t0),
    cost: body.usage?.cost,
    usage: body.usage,
    generationId: res.headers.get('X-Generation-Id'),
  };
}
