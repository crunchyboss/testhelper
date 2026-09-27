import { useState } from 'preact/hooks';
import { setAudioSessionType, unlockAudio } from '../../audio/context';
import { decodeAudio, PlaybackQueue } from '../../audio/player';
import { Recorder, Recording } from '../../audio/recorder';
import { blobToBase64 } from '../../audio/wav';
import { audioMessage, chat } from '../../ai/llm';
import type { ModelInfo } from '../../ai/models';
import { errorText } from '../../ai/pipeline';
import { transcribe } from '../../ai/stt';
import { synthesize } from '../../ai/tts';
import { modelsFor } from '../../config/loader';
import type { Config } from '../../config/types';
import { generationCost } from '../../log/costs';
import { ModelInput } from '../../ui/ModelInput';

interface Props {
  config: Config;
  apiKey?: string;
  queue: PlaybackQueue;
  recorder: Recorder;
}

interface Row {
  kind: 'TTS' | 'STT' | 'Audio-LLM';
  model: string;
  detail: string;
  text: string;
  ms?: number;
  cost?: number | null;
  error?: string;
}

const TRANSCRIBE_PROMPT = 'Transkribiere diese Aufnahme wörtlich, in der gesprochenen Sprache und Schrift. Gib nur das Transkript aus.';

/** Quick quality check per language: TTS a sentence, record once, compare STT models on the same recording. */
export function VoiceLabTab({ config, apiKey, queue, recorder }: Props) {
  const [langId, setLangId] = useState(config.languages[0].id);
  const lang = config.languages.find((l) => l.id === langId)!;
  const models = modelsFor(config.app, lang);
  const [ttsModel, setTtsModel] = useState('');
  const [voice, setVoice] = useState('');
  const [ttsInfo, setTtsInfo] = useState<ModelInfo | undefined>();
  const [text, setText] = useState('');
  const [sttModel, setSttModel] = useState('');
  const [hint, setHint] = useState(true);
  const [audioModel, setAudioModel] = useState('');
  const [recording, setRecording] = useState<Recording | null>(null);
  const [recState, setRecState] = useState<'idle' | 'recording'>('idle');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const addRow = (row: Row) => setRows((r) => [row, ...r]);
  const patchRow = (row: Row, patch: Partial<Row>) => setRows((r) => r.map((x) => (x === row ? { ...x, ...patch } : x)));
  const effectiveText = text || lang.saetze.begruessung || '';

  async function speak() {
    if (!apiKey || !effectiveText) return;
    unlockAudio();
    setBusy(true);
    const cfg = { ...models.tts, ...(ttsModel && { model: ttsModel }), ...(voice && { voice }) };
    const row: Row = { kind: 'TTS', model: cfg.model, detail: `Stimme ${cfg.voice ?? '–'}`, text: effectiveText };
    try {
      const r = await synthesize(apiKey, cfg, effectiveText);
      row.ms = r.latencyMs;
      row.detail += ` · ${r.format}`;
      addRow(row);
      queue.stop();
      queue.beginTurn();
      queue.enqueue(decodeAudio(r.audio));
      if (r.generationId) setTimeout(() => void generationCost(apiKey, r.generationId!).then((cost) => patchRow(row, { cost })), 3000);
    } catch (e) {
      addRow({ ...row, error: errorText(e) });
    }
    setBusy(false);
  }

  async function toggleRecord() {
    unlockAudio();
    if (recState === 'recording') {
      setRecording(recorder.stop());
      setRecState('idle');
      setAudioSessionType('playback');
      return;
    }
    queue.stop();
    setAudioSessionType('play-and-record');
    try {
      await recorder.start({
        keepMicOpen: false,
        maxMs: 30_000,
        silenceMs: 0,
        noSpeechMs: 30_000,
        speechThreshold: 0.02,
        onAutoStop: () => {
          setRecording(recorder.stop());
          setRecState('idle');
        },
      });
      setRecState('recording');
    } catch (e) {
      addRow({ kind: 'STT', model: '–', detail: 'Mikrofon', text: '', error: (e as Error).message });
    }
  }

  async function playRecording() {
    if (!recording) return;
    unlockAudio();
    queue.stop();
    queue.enqueue(decodeAudio(await recording.wav.arrayBuffer()), undefined, false);
  }

  async function runStt() {
    if (!apiKey || !recording) return;
    setBusy(true);
    const cfg = { model: sttModel || models.stt.model, language: hint ? lang.iso639_1 : null };
    const row: Row = { kind: 'STT', model: cfg.model, detail: cfg.language ? `Hinweis „${cfg.language}“` : 'ohne Hinweis', text: '' };
    try {
      const r = await transcribe(apiKey, cfg, await blobToBase64(recording.wav));
      addRow({ ...row, text: r.text, ms: r.latencyMs, cost: r.cost ?? null });
    } catch (e) {
      addRow({ ...row, error: errorText(e) });
    }
    setBusy(false);
  }

  async function runAudioLlm() {
    if (!apiKey || !recording) return;
    setBusy(true);
    const model = audioModel || models.llm.model;
    const row: Row = { kind: 'Audio-LLM', model, detail: 'Transkription', text: '' };
    try {
      const r = await chat(apiKey, { model, temperature: 0 }, [audioMessage(await blobToBase64(recording.wav), TRANSCRIBE_PROMPT)]);
      addRow({ ...row, text: r.text.trim(), ms: r.latencyMs, cost: r.usage?.cost ?? null });
    } catch (e) {
      addRow({ ...row, error: errorText(e) });
    }
    setBusy(false);
  }

  const voices = ttsInfo?.supported_voices ?? [];
  const noKey = !apiKey;

  return (
    <>
      <section class="card">
        <h2>Sprachlabor</h2>
        {noKey && <p class="warn">Erst einen API-Key speichern.</p>}
        <div class="row">
          <select value={langId} onChange={(e) => setLangId(e.currentTarget.value)}>
            {config.languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name_de} ({l.name_eigen})
              </option>
            ))}
          </select>
        </div>
      </section>

      <section class="card">
        <h2>1 · Sprachausgabe (TTS)</h2>
        <div class="form-grid">
          <label>Modell</label>
          <ModelInput kind="speech" value={ttsModel} placeholder={models.tts.model} onChange={setTtsModel} onInfo={setTtsInfo} />
          <label>Stimme</label>
          {voices.length ? (
            <select value={voice} onChange={(e) => setVoice(e.currentTarget.value)}>
              <option value="">{models.tts.voice ?? 'Standard'}</option>
              {voices.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          ) : (
            <input value={voice} placeholder={models.tts.voice ?? 'Stimme'} onInput={(e) => setVoice(e.currentTarget.value.trim())} />
          )}
        </div>
        <textarea
          class="lab-text"
          dir="auto"
          lang={lang.id}
          value={text}
          placeholder={lang.saetze.begruessung}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button class="primary" disabled={noKey || busy} onClick={speak}>
          ▶ Sprechen
        </button>
      </section>

      <section class="card">
        <h2>2 · Aufnahme</h2>
        <div class="row">
          <button class={recState === 'recording' ? 'primary recording-btn' : 'primary'} onClick={toggleRecord} disabled={busy}>
            {recState === 'recording' ? '⏹ Stopp' : '🎤 Aufnehmen'}
          </button>
          <button onClick={playRecording} disabled={!recording || recState === 'recording'}>
            ▶ Aufnahme anhören
          </button>
          <span class="muted">{recording ? `${(recording.durationMs / 1000).toFixed(1)} s aufgenommen` : 'noch keine Aufnahme'}</span>
        </div>
      </section>

      <section class="card">
        <h2>3 · Erkennung vergleichen (dieselbe Aufnahme)</h2>
        <div class="form-grid">
          <label>STT</label>
          <ModelInput kind="transcription" value={sttModel} placeholder={models.stt.model} onChange={setSttModel} />
          <label>Hinweis</label>
          <label class="check">
            <input type="checkbox" checked={hint} onChange={(e) => setHint(e.currentTarget.checked)} />
            Sprachhinweis „{lang.iso639_1 ?? 'keiner'}“ mitsenden
          </label>
        </div>
        <button class="primary" disabled={noKey || busy || !recording} onClick={runStt}>
          Transkribieren (STT)
        </button>
        <div class="form-grid" style={{ marginBlockStart: '16px' }}>
          <label>Audio-LLM</label>
          <ModelInput kind="audio-text" value={audioModel} placeholder={models.llm.model} onChange={setAudioModel} />
        </div>
        <button class="primary" disabled={noKey || busy || !recording} onClick={runAudioLlm}>
          Transkribieren (Audio-LLM)
        </button>
      </section>

      {rows.length > 0 && (
        <section class="card">
          <h2>Ergebnisse</h2>
          <table class="sessions">
            <thead>
              <tr>
                <th>Stufe</th>
                <th>Modell</th>
                <th>Text</th>
                <th>Zeit</th>
                <th>Kosten</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.kind}</td>
                  <td>
                    {r.model}
                    <div class="muted">{r.detail}</div>
                  </td>
                  <td dir="auto" lang={lang.id}>
                    {r.error ? <span class="warn">{r.error}</span> : r.text}
                  </td>
                  <td>{r.ms != null ? `${(r.ms / 1000).toFixed(2)} s` : ''}</td>
                  <td>{r.cost != null ? `$${r.cost.toFixed(5)}` : r.kind === 'TTS' && !r.error ? '…' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button class="link" onClick={() => setRows([])}>
            Ergebnisse leeren
          </button>
        </section>
      )}
    </>
  );
}
