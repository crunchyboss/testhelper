import { useEffect, useState } from 'preact/hooks';
import { hasAudioSessionApi } from '../../audio/context';
import { clearAudioCache, hasPhrase, phraseAudio } from '../../audio/cache';
import { modelsFor } from '../../config/loader';
import type { Config, PhraseKey } from '../../config/types';
import { isStandalone, requestPersistentStorage } from '../../device';
import { getDeviceName, setDeviceName } from '../../log/db';

const CHECKLIST = [
  'iPad geladen oder am Netzteil',
  'WLAN verbunden, API-Key getestet (Tab „Schlüssel“)',
  'Lautstärke hoch, Stummschaltung aus, „Nicht stören“ an',
  'Einstellungen → Anzeige & Helligkeit → Automatische Sperre: Nie',
  'Audios vorbereiten (unten), dann Ton & Mikro auf dem Start-Screen testen',
  'Geführter Zugriff: Bedienungshilfen → Geführter Zugriff an; in der App dreimal die Seitentaste → Starten',
  'Nach der Sitzung: Protokolle exportieren',
];

interface Props {
  config: Config;
  apiKey?: string;
  sessionActive: boolean;
  onEndSession: () => void;
}

export function DeviceTab({ config, apiKey, sessionActive, onEndSession }: Props) {
  const [device, setDevice] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [prep, setPrep] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getDeviceName().then(setDevice);
    requestPersistentStorage().then(setPersisted);
  }, []);

  async function prepareAudio() {
    if (!apiKey) return;
    const jobs = config.languages.flatMap((lang) =>
      (Object.entries(lang.saetze) as [PhraseKey, string][]).map(([, text]) => ({ tts: modelsFor(config.app, lang).tts, text })),
    );
    const state = { done: 0, total: jobs.length, failed: 0 };
    setPrep({ ...state });
    const queue = [...jobs];
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          try {
            if (!(await hasPhrase(job.tts, job.text))) await phraseAudio(apiKey, job.tts, job.text);
          } catch {
            state.failed++;
          }
          state.done++;
          setPrep({ ...state });
        }
      }),
    );
  }

  return (
    <>
      {sessionActive && (
        <section class="card">
          <h2>Laufende Sitzung</h2>
          <button class="primary" onClick={onEndSession}>
            Sitzung beenden und zum Start
          </button>
        </section>
      )}

      <section class="card">
        <h2>Checkliste vor der Sitzung</h2>
        <ul class="checklist">
          {CHECKLIST.map((item) => (
            <li key={item}>
              <label class="check">
                <input type="checkbox" /> {item}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section class="card">
        <h2>Gerät</h2>
        <div class="row">
          <input value={device} placeholder="z. B. iPad-1" onInput={(e) => setDevice(e.currentTarget.value)} />
          <button onClick={() => setDeviceName(device).then(() => setMessage('Gerätename gespeichert.'))}>Speichern</button>
        </div>
        <p class="muted">Wird in jedes Sitzungsprotokoll geschrieben.</p>
        {message && <p class="muted">{message}</p>}
      </section>

      <section class="card">
        <h2>Audio</h2>
        <div class="row">
          <button onClick={prepareAudio} disabled={!apiKey || (prep != null && prep.done < prep.total)}>
            Audios vorbereiten
          </button>
          <span class="muted">
            {prep
              ? `${prep.done}/${prep.total}${prep.failed ? `, ${prep.failed} Fehler` : ''}${prep.done === prep.total ? ' ✓' : ' …'}`
              : 'Feste Sätze aller Sprachen einmalig erzeugen'}
          </span>
        </div>
        <div class="row">
          <button
            class="danger"
            onClick={() =>
              confirm('Alle gespeicherten Audios (feste Sätze und Aufgabenerklärungen) löschen?') &&
              void clearAudioCache().then(() => setMessage('Audio-Cache geleert.'))
            }
          >
            Audio-Cache leeren
          </button>
          <span class="muted">Nötig, wenn feste Sätze neu klingen sollen; Erklärungen erneuern sich bei Prompt-Änderungen selbst.</span>
        </div>
      </section>

      <section class="card">
        <h2>Status</h2>
        <dl class="result">
          <dt>Modus</dt>
          <dd>{isStandalone() ? '✓ Home-Bildschirm-App' : <span class="warn">Safari-Tab: „Teilen → Zum Home-Bildschirm“ nutzen</span>}</dd>
          <dt>Speicher dauerhaft</dt>
          <dd>{persisted == null ? '…' : persisted ? '✓ ja' : 'nein (vom Browser nicht gewährt)'}</dd>
          <dt>HTTPS</dt>
          <dd>{window.isSecureContext ? '✓ ja' : <span class="warn">nein: Mikrofon wird nicht funktionieren</span>}</dd>
          <dt>Wake Lock</dt>
          <dd>{'wakeLock' in navigator ? '✓ verfügbar' : 'nicht verfügbar: Auto-Sperre „Nie“ einstellen'}</dd>
          <dt>Aufnahmen speichern</dt>
          <dd>{config.app.flags.audio_aufnahmen_speichern ? 'an (ZIP-Export)' : 'aus'}</dd>
          <dt>Audio Session API</dt>
          <dd>{hasAudioSessionApi() ? '✓ verfügbar' : 'nicht verfügbar'}</dd>
          <dt>Version</dt>
          <dd>{__APP_VERSION__}</dd>
        </dl>
      </section>
    </>
  );
}
