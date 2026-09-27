import type { PlaybackQueue } from '../audio/player';
import type { Models } from '../config/types';
import type { SttConfig } from './stt';
import { blobToBase64 } from '../audio/wav';
import { judgeAnswer } from './judge';
import { errorText, Phase, transcribeRecording, TurnMetrics } from './pipeline';
import { createSpeaker } from './speaker';

export interface AnswerCheckInput {
  apiKey: string;
  models: Models;
  /** STT config for answers (usually without language hint, see app.yaml). */
  stt: SttConfig;
  judgeSystem: string;
  recording: { wav: Blob; durationMs: number };
  /** Speak the assessment feedback to the learner? Otherwise playNeutral() ("Danke"). */
  feedback: boolean;
  playNeutral: () => Promise<void>;
  queue: PlaybackQueue;
  onPhase: (p: Phase) => void;
  signal: AbortSignal;
}

/** "Antwort prüfen": recording → STT → judge (structured output) → feedback or neutral thanks. */
export async function runAnswerCheck(input: AnswerCheckInput): Promise<TurnMetrics> {
  const { apiKey, models, queue, onPhase, signal } = input;
  const t0 = performance.now();
  const since = () => Math.round(performance.now() - t0);
  const metrics: TurnMetrics = { action: 'antwort_pruefen', audioMs: input.recording.durationMs };
  onPhase('thinking');

  try {
    const audioMode = models.pipeline === 'audio-llm';
    const answer = audioMode
      ? { wavBase64: await blobToBase64(input.recording.wav) }
      : await transcribeRecording(apiKey, input.stt, input.recording, metrics, signal);
    const judged = await judgeAnswer(apiKey, models.judge, input.judgeSystem, answer, signal);
    if (audioMode) {
      metrics.stt = { model: `${models.judge.model} (audio-llm)`, text: judged.assessment.erkannte_antwort, latencyMs: judged.latencyMs };
    }
    metrics.judge = {
      model: models.judge.model,
      latencyMs: judged.latencyMs,
      tokensIn: judged.usage?.prompt_tokens,
      tokensOut: judged.usage?.completion_tokens,
      cost: judged.usage?.cost,
    };
    metrics.assessment = { ...judged.assessment, feedbackGiven: false };

    if (input.feedback && judged.assessment.rueckmeldung_muttersprache) {
      const speaker = createSpeaker(apiKey, models.tts, queue, signal, () => {
        metrics.firstAudioMs = since();
        onPhase('speaking');
      });
      metrics.tts = speaker.metrics;
      speaker.speakText(judged.assessment.rueckmeldung_muttersprache);
      await queue.drain();
      if (speaker.error) throw speaker.error;
      metrics.assessment.feedbackGiven = true;
    } else {
      metrics.firstAudioMs = since();
      onPhase('speaking');
      await input.playNeutral();
    }
    metrics.totalMs = since();
    onPhase('idle');
  } catch (e) {
    metrics.totalMs = since();
    metrics.error = signal.aborted ? 'abgebrochen' : errorText(e);
    onPhase(signal.aborted ? 'idle' : 'error');
  }
  return metrics;
}
