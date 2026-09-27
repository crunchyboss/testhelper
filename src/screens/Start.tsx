import { useState } from 'preact/hooks';
import { audioContext, unlockAudio } from '../audio/context';
import type { Config, Test } from '../config/types';
import { defaultPseudonym } from '../session';

interface Props {
  config: Config;
  onAdmin: () => void;
  onStart: (pseudonym: string, test: Test) => void;
}

type Check = 'idle' | 'running' | 'ok' | 'error';

function beep() {
  const ctx = audioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 660;
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
}

/** S1: for the Lernbegleitung. Pseudonym, test, sound/mic check, then hand over the iPad. */
export function Start({ config, onAdmin, onStart }: Props) {
  const [pseudonym, setPseudonym] = useState('');
  const [test, setTest] = useState<Test | null>(config.tests.length === 1 ? config.tests[0] : null);
  const [micCheck, setMicCheck] = useState<Check>('idle');
  const [micError, setMicError] = useState('');

  async function checkSoundAndMic() {
    unlockAudio();
    beep();
    setMicCheck('running');
    try {
      // Asks for the mic permission now, while the Lernbegleitung is still holding the iPad.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicCheck('ok');
    } catch (e) {
      setMicError((e as Error).message);
      setMicCheck('error');
    }
  }

  // A failed mic check only warns: explaining still works without a microphone.
  const ready = test && (micCheck === 'ok' || micCheck === 'error');

  return (
    <main class="setup">
      <header class="row-between">
        <h1>Neue Sitzung</h1>
        <button class="link" onClick={onAdmin}>
          ⚙ Admin
        </button>
      </header>

      <section class="card">
        <h2>Pseudonym</h2>
        <input
          placeholder={`leer = ${defaultPseudonym()}`}
          value={pseudonym}
          autocapitalize="characters"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setPseudonym(e.currentTarget.value)}
        />
      </section>

      <section class="card">
        <h2>Test</h2>
        <div class="test-tiles">
          {config.tests.map((t) => (
            <button key={t.id} class={`test-tile ${test?.id === t.id ? 'selected' : ''}`} onClick={() => setTest(t)}>
              <span class="test-tile-nr">{t.kachel_nr}</span>
              <span>{t.titel}</span>
              <span class="muted">
                {t.aufgaben.length} Aufgaben · {t.domaene}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section class="card">
        <h2>Ton & Mikrofon</h2>
        <div class="row">
          <button onClick={checkSoundAndMic} disabled={micCheck === 'running'}>
            🔊🎤 Ton & Mikro testen
          </button>
          <span class={micCheck === 'error' ? 'warn' : ''}>
            {micCheck === 'ok' && '✓ Piepton gehört? Mikrofon ok'}
            {micCheck === 'running' && 'Bitte Mikrofon erlauben …'}
            {micCheck === 'error' && `✗ Mikrofon: ${micError}`}
          </span>
        </div>
      </section>

      <button class="primary wide" disabled={!ready} onClick={() => onStart(pseudonym.trim() || defaultPseudonym(), test!)}>
        Weitergeben ▶
      </button>
      {!ready && <p class="muted center">Test wählen und Ton & Mikro testen.</p>}
    </main>
  );
}
