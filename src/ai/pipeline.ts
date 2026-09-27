import { blobToBase64 } from '../audio/wav';
import { PlaybackQueue } from '../audio/player';
import { audioMessage, ChatMessage, LlmConfig, streamChat } from './llm';
import { AUDIO_INSTRUCTION, AUDIO_SYSTEM_ADDON, TranscriptHeaderParser } from './audioLlm';
import type { PipelineMode } from '../config/types';
import { SttConfig, transcribe } from './stt';
import type { TtsConfig } from './tts';
import { SentenceSplitter } from './sentences';
import { OpenRouterError } from './openrouter';
import { createSpeaker, TtsMetrics } from './speaker';
import type { Assessment } from './judge';

export type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface TurnMetrics {
  action: string;
  audioMs?: number;
  stt?: { model: string; text: string; latencyMs: number; cost?: number };
  llm?: {
    model: string;
    text: string;
    ttftMs: number | null;
    latencyMs: number;
    tokensIn?: number;
    tokensOut?: number;
    cost?: number;
  };
  judge?: { model: string; latencyMs: number; tokensIn?: number; tokensOut?: number; cost?: number };
  assessment?: Assessment & { feedbackGiven: boolean };
  tts?: TtsMetrics;
  firstAudioMs?: number;
  totalMs?: number;
  fromCache?: boolean;
  error?: string;
}

export interface TurnInput {
  apiKey: string;
  models: { stt: SttConfig; llm: LlmConfig; tts: TtsConfig; pipeline?: PipelineMode };
  system: string;
  history: ChatMessage[];
  action: string;
  /** Text sent as the user turn when there is no recording (e.g. "explain" button). */
  userText?: string;
  recording?: { wav: Blob; durationMs: number };
  queue: PlaybackQueue;
  onPhase: (p: Phase) => void;
  onText?: (text: string) => void;
  signal: AbortSignal;
}

export interface TurnOutput {
  metrics: TurnMetrics;
  userMessage?: string;
  answer?: string;
  /** Encoded audio per sentence (mp3/wav), only when every sentence succeeded; used for caching. */
  clips?: ArrayBuffer[];
}

export function errorText(e: unknown): string {
  return e instanceof OpenRouterError ? `${e.stage ?? ''} HTTP ${e.status}: ${e.message}` : String(e);
}

/** Transcribes a recording; throws if nothing was recognized. */
export async function transcribeRecording(
  apiKey: string,
  stt: SttConfig,
  recording: { wav: Blob },
  metrics: TurnMetrics,
  signal: AbortSignal,
): Promise<string> {
  const result = await transcribe(apiKey, stt, await blobToBase64(recording.wav), signal);
  metrics.stt = { model: stt.model, text: result.text, latencyMs: result.latencyMs, cost: result.cost };
  if (!result.text) throw new OpenRouterError(0, 'Keine Sprache erkannt', 'stt');
  return result.text;
}

/** One interaction: [recording → STT] → LLM stream → per-sentence TTS → ordered playback. */
export async function runTurn(input: TurnInput): Promise<TurnOutput> {
  const { apiKey, models, queue, onPhase, signal } = input;
  const t0 = performance.now();
  const since = () => Math.round(performance.now() - t0);
  const metrics: TurnMetrics = { action: input.action, audioMs: input.recording?.durationMs };
  onPhase('thinking');

  try {
    const audioMode = models.pipeline === 'audio-llm' && !!input.recording;
    let userMessage = input.userText ?? '';
    let userTurn: ChatMessage;
    if (audioMode) {
      userTurn = audioMessage(await blobToBase64(input.recording!.wav), AUDIO_INSTRUCTION);
    } else {
      if (input.recording) userMessage = await transcribeRecording(apiKey, models.stt, input.recording, metrics, signal);
      userTurn = { role: 'user', content: userMessage };
    }

    const speaker = createSpeaker(apiKey, models.tts, queue, signal, () => {
      metrics.firstAudioMs = since();
      onPhase('speaking');
    });
    metrics.tts = speaker.metrics;

    const splitter = new SentenceSplitter();
    const header = audioMode ? new TranscriptHeaderParser() : null;
    let shown = '';
    const forward = (text: string) => {
      if (!text) return;
      shown += text;
      input.onText?.(shown);
      splitter.push(text).forEach(speaker.speak);
    };
    const messages: ChatMessage[] = [
      { role: 'system', content: audioMode ? input.system + '\n' + AUDIO_SYSTEM_ADDON : input.system },
      ...input.history,
      userTurn,
    ];
    const llm = await streamChat(apiKey, models.llm, messages, (delta) => forward(header ? header.push(delta) : delta), signal);
    if (header) {
      forward(header.flush());
      userMessage = header.transcript;
      metrics.stt = { model: `${models.llm.model} (audio-llm)`, text: header.transcript, latencyMs: llm.ttftMs ?? llm.latencyMs };
    }
    splitter.flush().forEach(speaker.speak);
    metrics.llm = {
      model: models.llm.model,
      text: shown,
      ttftMs: llm.ttftMs,
      latencyMs: llm.latencyMs,
      tokensIn: llm.usage?.prompt_tokens,
      tokensOut: llm.usage?.completion_tokens,
      cost: llm.usage?.cost,
    };

    await queue.drain();
    if (speaker.error) throw speaker.error;
    metrics.totalMs = since();
    onPhase('idle');
    return { metrics, userMessage, answer: shown, clips: await speaker.clips() };
  } catch (e) {
    metrics.totalMs = since();
    if (signal.aborted) {
      metrics.error = 'abgebrochen';
      onPhase('idle');
    } else {
      metrics.error = errorText(e);
      onPhase('error');
    }
    return { metrics };
  }
}
