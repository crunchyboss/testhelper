import { useEffect, useState } from 'preact/hooks';
import { fetchModels, ModelInfo, ModelKind, priceHint } from '../ai/models';

interface Props {
  kind: ModelKind;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  /** Called with the model info once the list is loaded and whenever the value changes. */
  onInfo?: (info: ModelInfo | undefined) => void;
}

let counter = 0;

/** Free-text model id with suggestions from OpenRouter model discovery (datalist works on iPad Safari). */
export function ModelInput({ kind, value, placeholder, onChange, onInfo }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [listId] = useState(() => `models-${kind}-${++counter}`);

  useEffect(() => {
    fetchModels(kind)
      .then(setModels)
      .catch(() => setModels([]));
  }, [kind]);

  useEffect(() => {
    onInfo?.(models.find((m) => m.id === (value || placeholder)));
  }, [models, value, placeholder]);

  const known = !value || models.length === 0 || models.some((m) => m.id === value);
  return (
    <>
      <input
        list={listId}
        value={value}
        placeholder={placeholder}
        autocapitalize="off"
        autocomplete="off"
        spellcheck={false}
        class={known ? '' : 'input-warn'}
        onInput={(e) => onChange(e.currentTarget.value.trim())}
      />
      <datalist id={listId}>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {[m.name, priceHint(m, kind)].filter(Boolean).join(' · ')}
          </option>
        ))}
      </datalist>
    </>
  );
}
