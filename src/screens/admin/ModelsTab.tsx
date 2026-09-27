import { useState } from 'preact/hooks';
import type { ModelInfo } from '../../ai/models';
import { modelsFor } from '../../config/loader';
import type { Config, Overrides, PipelineMode, StageOverrides } from '../../config/types';
import { ModelInput } from '../../ui/ModelInput';

interface Props {
  config: Config;
  overrides: Overrides;
  onSave: (next: Overrides) => Promise<string | null>;
}

/** Drops empty strings/objects so "blank = use default" really falls back. */
function clean(o: StageOverrides): StageOverrides | undefined {
  const out: StageOverrides = {};
  if (o.pipeline) out.pipeline = o.pipeline;
  for (const stage of ['stt', 'llm', 'tts', 'judge'] as const) {
    const entries = Object.entries(o[stage] ?? {}).filter(([, v]) => v !== '' && v != null);
    if (entries.length) (out as Record<string, unknown>)[stage] = Object.fromEntries(entries);
  }
  return Object.keys(out).length ? out : undefined;
}

function StageEditor({
  value,
  effective,
  withJudge,
  onChange,
}: {
  value: StageOverrides;
  effective: ReturnType<typeof modelsFor>;
  withJudge: boolean;
  onChange: (v: StageOverrides) => void;
}) {
  const [ttsInfo, setTtsInfo] = useState<ModelInfo | undefined>();
  const set = (stage: 'stt' | 'llm' | 'tts' | 'judge', field: string, v: string) =>
    onChange({ ...value, [stage]: { ...value[stage], [field]: v } });
  const voices = ttsInfo?.supported_voices ?? [];

  return (
    <div class="form-grid">
      <label>Pipeline</label>
      <select
        value={value.pipeline ?? ''}
        onChange={(e) => onChange({ ...value, pipeline: (e.currentTarget.value || undefined) as PipelineMode | undefined })}
      >
        <option value="">Standard ({effective.pipeline})</option>
        <option value="cascade">cascade: STT → LLM</option>
        <option value="audio-llm">audio-llm: Audio direkt ins LLM</option>
      </select>

      <label>STT</label>
      <ModelInput kind="transcription" value={value.stt?.model ?? ''} placeholder={effective.stt.model} onChange={(v) => set('stt', 'model', v)} />

      <label>LLM</label>
      <ModelInput
        kind={(value.pipeline ?? effective.pipeline) === 'audio-llm' ? 'audio-text' : 'text'}
        value={value.llm?.model ?? ''}
        placeholder={effective.llm.model}
        onChange={(v) => set('llm', 'model', v)}
      />

      <label>TTS</label>
      <ModelInput
        kind="speech"
        value={value.tts?.model ?? ''}
        placeholder={effective.tts.model}
        onChange={(v) => set('tts', 'model', v)}
        onInfo={setTtsInfo}
      />

      <label>Stimme</label>
      {voices.length ? (
        <select value={value.tts?.voice ?? ''} onChange={(e) => set('tts', 'voice', e.currentTarget.value)}>
          <option value="">Standard ({effective.tts.voice ?? '–'})</option>
          {voices.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <input value={value.tts?.voice ?? ''} placeholder={effective.tts.voice ?? 'Stimme'} onInput={(e) => set('tts', 'voice', e.currentTarget.value.trim())} />
      )}

      {withJudge && (
        <>
          <label>Bewertung</label>
          <ModelInput kind="text" value={value.judge?.model ?? ''} placeholder={effective.judge.model} onChange={(v) => set('judge', 'model', v)} />
        </>
      )}
    </div>
  );
}

/** Model selection per stage, globally and per language. Blank = value from app.yaml / languages.yaml. */
export function ModelsTab({ config, overrides, onSave }: Props) {
  const [defaults, setDefaults] = useState<StageOverrides>(overrides.models?.defaults ?? {});
  const [perLang, setPerLang] = useState<Record<string, StageOverrides>>(overrides.models?.languages ?? {});
  const [langId, setLangId] = useState(config.languages[0].id);
  const [message, setMessage] = useState('');
  const lang = config.languages.find((l) => l.id === langId)!;

  async function save() {
    const languages = Object.fromEntries(
      Object.entries(perLang)
        .map(([id, o]) => [id, clean(o)] as const)
        .filter(([, o]) => o),
    ) as Record<string, StageOverrides>;
    const error = await onSave({ ...overrides, models: { defaults: clean(defaults), languages } });
    setMessage(error ? `✗ ${error}` : '✓ Gespeichert. Gilt ab der nächsten Aktion.');
  }

  // "effective" shows what applies without this tab's unsaved edits; placeholders explain the fallback.
  const baseApp = config.app;
  return (
    <>
      <section class="card">
        <h2>Standard für alle Sprachen</h2>
        <p class="muted">Leer = Wert aus app.yaml. Vorschläge kommen live von OpenRouter.</p>
        <StageEditor value={defaults} effective={modelsFor(baseApp, { ...lang, pipeline: undefined, stt: {}, llm: {}, tts: {} })} withJudge onChange={setDefaults} />
      </section>

      <section class="card">
        <h2>Abweichung pro Sprache</h2>
        <div class="row">
          <select value={langId} onChange={(e) => setLangId(e.currentTarget.value)}>
            {config.languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name_de} ({l.name_eigen}){perLang[l.id] && clean(perLang[l.id]) ? ' ●' : ''}
              </option>
            ))}
          </select>
          <button class="link" onClick={() => setPerLang(({ [langId]: _, ...rest }) => rest)}>
            Sprache zurücksetzen
          </button>
        </div>
        <StageEditor
          key={langId}
          value={perLang[langId] ?? {}}
          effective={modelsFor(baseApp, lang)}
          withJudge={false}
          onChange={(v) => setPerLang((p) => ({ ...p, [langId]: v }))}
        />
      </section>

      <div class="row">
        <button class="primary" onClick={save}>
          Modelle speichern
        </button>
        <button
          class="danger"
          onClick={() => {
            setDefaults({});
            setPerLang({});
          }}
        >
          Alle Modell-Abweichungen entfernen
        </button>
      </div>
      {message && <p class={message.startsWith('✗') ? 'warn' : 'muted'}>{message}</p>}
    </>
  );
}
