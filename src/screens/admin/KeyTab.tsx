import { useEffect, useState } from 'preact/hooks';
import { deleteApiKey, loadApiKey, maskKey, saveApiKey } from '../../config/secrets';
import { getKeyInfo, KeyInfo, OpenRouterError } from '../../ai/openrouter';

type Check =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'ok'; info: KeyInfo; ms: number }
  | { state: 'error'; message: string };

const usd = (n: number | null | undefined) => (n == null ? '–' : `$${n.toFixed(2)}`);

export function KeyTab({ onKeyChanged }: { onKeyChanged: () => void }) {
  const [savedKey, setSavedKey] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [check, setCheck] = useState<Check>({ state: 'idle' });

  useEffect(() => {
    loadApiKey().then(setSavedKey);
  }, []);

  async function save() {
    if (!input.trim()) return;
    await saveApiKey(input);
    setSavedKey(input.trim());
    setInput('');
    setCheck({ state: 'idle' });
    onKeyChanged();
  }

  async function remove() {
    if (!confirm('API-Key von diesem Gerät löschen?')) return;
    await deleteApiKey();
    setSavedKey(undefined);
    setCheck({ state: 'idle' });
    onKeyChanged();
  }

  async function test() {
    if (!savedKey) return;
    setCheck({ state: 'running' });
    const t0 = performance.now();
    try {
      const info = await getKeyInfo(savedKey);
      setCheck({ state: 'ok', info, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      const message =
        e instanceof OpenRouterError ? `HTTP ${e.status}: ${e.message}` : `Netzwerkfehler: ${(e as Error).message}`;
      setCheck({ state: 'error', message });
    }
  }

  return (
    <section class="card">
      <h2>OpenRouter-API-Key</h2>
      <p class="muted">Wird nur auf diesem Gerät gespeichert. Empfehlung: eigener Key mit Kreditlimit.</p>
      {savedKey ? (
        <p>
          Gespeichert: <code>{maskKey(savedKey)}</code>
        </p>
      ) : (
        <p class="warn">Noch kein Key gespeichert.</p>
      )}
      <div class="row">
        <input
          type="password"
          placeholder="sk-or-v1-…"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          value={input}
          onInput={(e) => setInput(e.currentTarget.value)}
        />
        <button onClick={save} disabled={!input.trim()}>
          Speichern
        </button>
      </div>
      <div class="row">
        <button class="primary" onClick={test} disabled={!savedKey || check.state === 'running'}>
          {check.state === 'running' ? 'Teste …' : 'Verbindung testen'}
        </button>
        {savedKey && (
          <button class="danger" onClick={remove}>
            Key löschen
          </button>
        )}
      </div>
      {check.state === 'ok' && (
        <dl class="result ok">
          <dt>Status</dt>
          <dd>✓ Verbindung ok ({check.ms} ms)</dd>
          <dt>Label</dt>
          <dd>{check.info.label ?? '–'}</dd>
          <dt>Verbraucht</dt>
          <dd>{usd(check.info.usage)}</dd>
          <dt>Limit</dt>
          <dd>{check.info.limit == null ? 'kein Limit (Empfehlung: Limit setzen!)' : usd(check.info.limit)}</dd>
          <dt>Verbleibend</dt>
          <dd>{usd(check.info.limit_remaining)}</dd>
        </dl>
      )}
      {check.state === 'error' && <p class="result error">✗ {check.message}</p>}
    </section>
  );
}
