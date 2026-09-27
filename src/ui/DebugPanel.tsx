import type { TurnMetrics } from '../ai/pipeline';

const ms = (v?: number | null) => (v == null ? '–' : `${(v / 1000).toFixed(2)} s`);
const usd = (v?: number) => (v == null ? '–' : `$${v.toFixed(5)}`);

export function DebugPanel({ metrics, liveText }: { metrics: TurnMetrics | null; liveText: string }) {
  if (!metrics && !liveText) return null;
  return (
    <details class="debug" dir="ltr" open>
      <summary>Debug</summary>
      {liveText && (
        <p class="debug-text" dir="auto">
          {liveText}
        </p>
      )}
      {metrics && (
        <dl class="result">
          {metrics.error && (
            <>
              <dt>Fehler</dt>
              <dd class="warn">{metrics.error}</dd>
            </>
          )}
          {metrics.fromCache && (
            <>
              <dt>Quelle</dt>
              <dd>Erklärungs-Cache</dd>
            </>
          )}
          {metrics.stt && (
            <>
              <dt>Transkript</dt>
              <dd dir="auto">{metrics.stt.text}</dd>
              <dt>STT</dt>
              <dd>
                {ms(metrics.stt.latencyMs)} · {usd(metrics.stt.cost)} · Audio {ms(metrics.audioMs)}
              </dd>
            </>
          )}
          {metrics.llm && (
            <>
              <dt>LLM</dt>
              <dd>
                erstes Token {ms(metrics.llm.ttftMs)} · gesamt {ms(metrics.llm.latencyMs)} · {metrics.llm.tokensIn ?? '–'}→
                {metrics.llm.tokensOut ?? '–'} Tokens · {usd(metrics.llm.cost)}
              </dd>
            </>
          )}
          {metrics.assessment && (
            <>
              <dt>Bewertung</dt>
              <dd>
                <strong>{metrics.assessment.urteil}</strong> · „{metrics.assessment.erkannte_antwort}“ ·{' '}
                {metrics.assessment.feedbackGiven ? 'Rückmeldung gesprochen' : 'nur protokolliert'}
              </dd>
              <dt>Begründung</dt>
              <dd>{metrics.assessment.begruendung_de}</dd>
              <dt>Rückmeldung</dt>
              <dd dir="auto">{metrics.assessment.rueckmeldung_muttersprache}</dd>
            </>
          )}
          {metrics.judge && (
            <>
              <dt>Judge</dt>
              <dd>
                {ms(metrics.judge.latencyMs)} · {metrics.judge.tokensIn ?? '–'}→{metrics.judge.tokensOut ?? '–'} Tokens ·{' '}
                {usd(metrics.judge.cost)}
              </dd>
            </>
          )}
          {metrics.tts && metrics.tts.sentences > 0 && (
            <>
              <dt>TTS</dt>
              <dd>
                {metrics.tts.sentences} Sätze · {metrics.tts.chars} Zeichen · je {metrics.tts.latencies.map((l) => ms(l)).join(', ')}
              </dd>
            </>
          )}
          <dt>Erster Ton</dt>
          <dd>
            <strong>{ms(metrics.firstAudioMs)}</strong> (gesamt {ms(metrics.totalMs)})
          </dd>
        </dl>
      )}
    </details>
  );
}
