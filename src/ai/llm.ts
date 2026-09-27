import { fail, OpenRouterError, postJson } from './openrouter';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'input_audio'; input_audio: { data: string; format: 'wav' | 'mp3' } };

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] };

/** User message carrying a WAV recording plus an instruction (for audio-capable chat models). */
export function audioMessage(wavBase64: string, instruction: string): ChatMessage {
  return {
    role: 'user',
    content: [
      { type: 'input_audio', input_audio: { data: wavBase64, format: 'wav' } },
      { type: 'text', text: instruction },
    ],
  };
}

export interface LlmConfig {
  model: string;
  temperature?: number;
  max_tokens?: number;
  /** OpenRouter unified reasoning effort; low values keep latency down. */
  reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
}

export interface LlmUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

export interface ChatResult {
  text: string;
  ttftMs: number | null;
  latencyMs: number;
  usage?: LlmUsage;
  generationId: string | null;
}

export interface JsonSchemaFormat {
  type: 'json_schema';
  json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
}

/** Non-streaming chat completion, e.g. for structured output (response_format json_schema). */
export async function chat(
  apiKey: string,
  cfg: LlmConfig,
  messages: ChatMessage[],
  responseFormat?: JsonSchemaFormat,
  signal?: AbortSignal,
): Promise<ChatResult> {
  const t0 = performance.now();
  const res = await postJson(
    apiKey,
    '/chat/completions',
    {
      model: cfg.model,
      messages,
      temperature: cfg.temperature,
      max_tokens: cfg.max_tokens,
      ...(cfg.reasoning_effort ? { reasoning: { effort: cfg.reasoning_effort } } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
    },
    signal,
    { timeoutMs: 40_000, stage: 'llm' },
  );
  if (!res.ok) await fail(res, 'llm');
  const body = await res.json();
  if (body.error) throw new OpenRouterError(body.error.code ?? 500, body.error.message ?? 'error', 'llm');
  const latencyMs = Math.round(performance.now() - t0);
  return {
    text: body.choices?.[0]?.message?.content ?? '',
    ttftMs: latencyMs,
    latencyMs,
    usage: body.usage,
    generationId: body.id ?? null,
  };
}

/**
 * Streams a chat completion over SSE and calls onDelta for each content token chunk.
 * OpenRouter sends usage (incl. cost) in the last data event.
 */
export async function streamChat(
  apiKey: string,
  cfg: LlmConfig,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<ChatResult> {
  const t0 = performance.now();
  const res = await postJson(
    apiKey,
    '/chat/completions',
    {
      model: cfg.model,
      messages,
      stream: true,
      temperature: cfg.temperature,
      max_tokens: cfg.max_tokens,
      ...(cfg.reasoning_effort ? { reasoning: { effort: cfg.reasoning_effort } } : {}),
    },
    signal,
    { timeoutMs: 60_000, stage: 'llm' },
  );
  if (!res.ok || !res.body) await fail(res, 'llm');

  let text = '';
  let ttftMs: number | null = null;
  let usage: LlmUsage | undefined;
  let generationId: string | null = null;
  let buffered = '';

  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  outer: for (;;) {
    let chunk: ReadableStreamReadResult<string>;
    try {
      chunk = await reader.read();
    } catch (e) {
      // Aborted mid-stream: by the user (signal) or by the postJson timeout.
      if (signal?.aborted) throw e;
      throw new OpenRouterError(408, 'Antwort-Stream abgebrochen (Zeitüberschreitung oder Netzwerk)', 'llm');
    }
    const { value, done } = chunk;
    if (done) break;
    buffered += value;
    let newline: number;
    while ((newline = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      // Lines starting with ":" are SSE comments (OpenRouter keep-alives).
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') break outer;
      const event = JSON.parse(payload);
      if (event.error) throw new OpenRouterError(event.error.code ?? 500, event.error.message ?? 'stream error', 'llm');
      generationId ??= event.id ?? null;
      const delta: string | undefined = event.choices?.[0]?.delta?.content;
      if (delta) {
        ttftMs ??= Math.round(performance.now() - t0);
        text += delta;
        onDelta(delta);
      }
      if (event.usage) usage = event.usage;
    }
  }
  return { text, ttftMs, latencyMs: Math.round(performance.now() - t0), usage, generationId };
}
