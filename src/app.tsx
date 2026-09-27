import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PlaybackQueue } from './audio/player';
import { Recorder } from './audio/recorder';
import { loadConfig } from './config/loader';
import { loadOverrides, saveOverrides } from './config/overrides';
import { loadApiKey } from './config/secrets';
import type { Config, Language as Lang, Overrides, Test } from './config/types';
import { allowScreenSleep, keepScreenAwake } from './device';
import { SessionLogger } from './log/logger';
import { Admin } from './screens/admin/Admin';
import { Language } from './screens/Language';
import { Start } from './screens/Start';
import { Task } from './screens/Task';
import { applyLanguageToDocument, Session } from './session';
import { PinPad } from './ui/PinPad';

type Screen = 'start' | 'language' | 'task';
type Overlay = null | 'pin' | 'admin';

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [configError, setConfigError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | undefined>();
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>('start');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [session, setSession] = useState<Session | null>(null);
  const queue = useMemo(() => new PlaybackQueue(), []);
  const recorder = useMemo(() => new Recorder(), []);
  const logger = useRef<SessionLogger | null>(null);
  const interruptTask = useRef<(() => void) | null>(null);

  const refreshKey = async () => {
    const key = await loadApiKey();
    setApiKey(key);
    setKeyLoaded(true);
    // Without a key nothing works: open the admin area directly (no PIN at first setup).
    if (!key) setOverlay('admin');
  };

  useEffect(() => {
    loadOverrides()
      .then(async (o) => {
        setOverrides(o);
        try {
          return await loadConfig(o);
        } catch (e) {
          // A broken device override must not lock the app: fall back to the files in public/.
          if (!Object.keys(o).length) throw e;
          setConfigError(`Lokale Änderungen ignoriert: ${(e as Error).message}`);
          return loadConfig();
        }
      })
      .then(setConfig)
      .catch((e) => setConfigError((e as Error).message));
    void refreshKey();
  }, []);

  /** Validates by loading the full config with the new overrides; only then persists and applies them. */
  async function changeOverrides(next: Overrides): Promise<string | null> {
    try {
      const nextConfig = await loadConfig(next);
      await saveOverrides(next);
      setOverrides(next);
      setConfig(nextConfig);
      setConfigError(null);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  function openAdmin() {
    // Abort a running answer too, otherwise its remaining sentences would play behind the admin area.
    interruptTask.current?.();
    queue.stop();
    recorder.cancel();
    setOverlay('pin');
  }

  async function start(pseudonym: string, test: Test) {
    try {
      logger.current = await SessionLogger.start(config!, pseudonym, test);
    } catch (e) {
      alert(`Sitzungsprotokoll konnte nicht angelegt werden: ${(e as Error).message}`);
      return;
    }
    setSession({ pseudonym, test });
    keepScreenAwake();
    setScreen('language');
  }

  function chooseLanguage(language: Lang) {
    logger.current?.setLanguage(language.id);
    setSession((s) => s && { ...s, language });
    applyLanguageToDocument(language);
    setScreen('task');
  }

  function endSession() {
    queue.stop();
    recorder.cancel();
    recorder.release();
    applyLanguageToDocument(undefined);
    allowScreenSleep();
    logger.current?.end();
    logger.current = null;
    setSession(null);
    setOverlay(null);
    setScreen('start');
  }

  if (!config) {
    return configError ? (
      <main class="setup">
        <h1>Konfiguration fehlerhaft</h1>
        <p class="result error">{configError}</p>
        <button onClick={() => location.reload()}>Neu laden</button>
      </main>
    ) : null;
  }
  if (!keyLoaded) return null;

  // Always use the current config objects (admin changes replace them), matched by id.
  const test = session && config.tests.find((t) => t.id === session.test.id);
  const language = session?.language && config.languages.find((l) => l.id === session.language!.id);

  let view;
  if (screen === 'language' && session) {
    view = <Language config={config} apiKey={apiKey!} queue={queue} onChoose={chooseLanguage} onExit={openAdmin} />;
  } else if (screen === 'task' && test && language && logger.current) {
    view = (
      <Task
        key={`${test.id}-${language.id}`}
        config={config}
        apiKey={apiKey!}
        test={test}
        language={language}
        queue={queue}
        recorder={recorder}
        logger={logger.current}
        onExit={openAdmin}
        registerInterrupt={(fn) => (interruptTask.current = fn)}
      />
    );
  } else {
    view = <Start config={config} onAdmin={openAdmin} onStart={start} />;
  }

  return (
    <>
      {apiKey && view}
      {configError && <p class="config-warning">{configError}</p>}
      {overlay === 'pin' && apiKey && (
        <PinPad pin={String(config.app.admin_pin)} onSuccess={() => setOverlay('admin')} onCancel={() => setOverlay(null)} />
      )}
      {overlay === 'admin' && (
        <Admin
          config={config}
          overrides={overrides}
          apiKey={apiKey}
          queue={queue}
          recorder={recorder}
          sessionActive={!!session}
          initialTab={apiKey ? undefined : 'key'}
          onClose={apiKey ? () => setOverlay(null) : undefined}
          onEndSession={endSession}
          onKeyChanged={refreshKey}
          onOverridesChanged={changeOverrides}
        />
      )}
    </>
  );
}
