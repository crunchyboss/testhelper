import { useEffect, useState } from 'preact/hooks';
import { BASE_FILES, fetchDefaultFile } from '../../config/loader';
import type { Config, Overrides } from '../../config/types';
import { shareFile } from '../../log/export';

interface Props {
  config: Config;
  overrides: Overrides;
  /** Validates by reloading the whole config; returns an error message or null. */
  onSave: (next: Overrides) => Promise<string | null>;
}

const LABELS: Record<string, string> = {
  'config/app.yaml': 'App-Einstellungen, Modelle, Flags, PIN',
  'config/languages.yaml': 'Sprachen und feste Sätze',
  'prompts/system.md': 'Systemprompt (Hilfe)',
  'prompts/judge.md': 'Prompt „Antwort prüfen“',
  'tests/index.yaml': 'Liste der Tests (Kacheln)',
};

/**
 * View, edit, import and export the config files. Changes are stored as device overrides and
 * validated by loading the full config before they are kept.
 */
export function ContentTab({ config, overrides, onSave }: Props) {
  const files = [...new Set([...BASE_FILES, ...config.testFiles, ...Object.keys(overrides.files ?? {})])];
  const [path, setPath] = useState(files[0]);
  const [text, setText] = useState('');
  const [original, setOriginal] = useState('');
  const [message, setMessage] = useState('');
  const [newFile, setNewFile] = useState('');
  const overridden = overrides.files?.[path] != null;

  useEffect(() => {
    setMessage('');
    const current = overrides.files?.[path];
    const load = current != null ? Promise.resolve(current) : fetchDefaultFile(path).catch(() => '');
    load.then((t) => {
      setText(t);
      setOriginal(t);
    });
  }, [path, overrides]);

  async function save() {
    const error = await onSave({ ...overrides, files: { ...overrides.files, [path]: text } });
    setMessage(error ? `✗ Nicht gespeichert: ${error}` : '✓ Gespeichert und geladen.');
  }

  async function reset() {
    const { [path]: _, ...rest } = overrides.files ?? {};
    const error = await onSave({ ...overrides, files: rest });
    setMessage(error ? `✗ ${error}` : '✓ Standard-Datei wiederhergestellt.');
  }

  async function importFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    setText(await file.text());
    setMessage(`„${file.name}“ geladen. Prüfen und speichern.`);
  }

  function addTestFile() {
    const name = newFile.trim().replace(/^tests\//, '');
    if (!/^[\w.-]+\.ya?ml$/.test(name)) return setMessage('✗ Dateiname z. B. „einkaufen.yaml“');
    const p = `tests/${name}`;
    void onSave({ ...overrides, files: { ...overrides.files, [p]: overrides.files?.[p] ?? '# neuer Test\n' } }).then(() => {
      setPath(p);
      setNewFile('');
      setMessage('Datei angelegt. Inhalt einfügen, speichern und in tests/index.yaml eintragen.');
    });
  }

  async function exportAll() {
    await shareFile('lernhilfe-overrides.json', JSON.stringify(overrides, null, 2), 'application/json');
  }

  async function importAll(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const error = await onSave(JSON.parse(await file.text()));
      setMessage(error ? `✗ ${error}` : '✓ Overrides importiert.');
    } catch (err) {
      setMessage(`✗ Keine gültige JSON-Datei: ${(err as Error).message}`);
    }
  }

  return (
    <>
      <section class="card">
        <h2>Tests & Prompts</h2>
        <p class="muted">
          Änderungen gelten nur auf diesem Gerät (● = geändert). Dauerhaft für alle Geräte: Datei im Repo unter public/ ändern.
        </p>
        <div class="row">
          <select value={path} onChange={(e) => setPath(e.currentTarget.value)}>
            {files.map((f) => (
              <option key={f} value={f}>
                {overrides.files?.[f] != null ? '● ' : ''}
                {f}
                {LABELS[f] ? ` · ${LABELS[f]}` : ''}
              </option>
            ))}
          </select>
        </div>
        <textarea class="editor" dir="auto" spellcheck={false} value={text} onInput={(e) => setText(e.currentTarget.value)} />
        <div class="row">
          <button class="primary" onClick={save} disabled={text === original && overridden}>
            Speichern
          </button>
          <label class="button">
            Datei importieren
            <input type="file" accept=".yaml,.yml,.md,.txt" hidden onChange={importFile} />
          </label>
          <button onClick={() => shareFile(path.split('/').pop()!, text, 'text/plain')}>Teilen / Sichern</button>
          {overridden && (
            <button class="danger" onClick={reset}>
              Auf Standard zurücksetzen
            </button>
          )}
        </div>
        {message && <p class={message.startsWith('✗') ? 'warn' : 'muted'}>{message}</p>}
      </section>

      <section class="card">
        <h2>Neuer Test</h2>
        <div class="row">
          <input value={newFile} placeholder="einkaufen.yaml" autocapitalize="off" onInput={(e) => setNewFile(e.currentTarget.value)} />
          <button onClick={addTestFile}>Anlegen</button>
        </div>
        <p class="muted">Danach in tests/index.yaml eintragen: „- datei: einkaufen.yaml“ und „kachel_nr: 3“.</p>
      </section>

      <section class="card">
        <h2>Alle Änderungen dieses Geräts</h2>
        <div class="row">
          <button onClick={exportAll}>Export (JSON)</button>
          <label class="button">
            Import (JSON)
            <input type="file" accept=".json" hidden onChange={importAll} />
          </label>
          <button
            class="danger"
            onClick={() => confirm('Alle Änderungen (Dateien und Modelle) auf diesem Gerät verwerfen?') && void onSave({})}
          >
            Alles zurücksetzen
          </button>
        </div>
      </section>
    </>
  );
}
