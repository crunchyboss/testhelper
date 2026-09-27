import { useState } from 'preact/hooks';
import type { PlaybackQueue } from '../../audio/player';
import type { Recorder } from '../../audio/recorder';
import { countOverrides } from '../../config/overrides';
import type { Config, Overrides } from '../../config/types';
import { ContentTab } from './ContentTab';
import { DeviceTab } from './DeviceTab';
import { KeyTab } from './KeyTab';
import { ModelsTab } from './ModelsTab';
import { ProtocolsTab } from './ProtocolsTab';
import { VoiceLabTab } from './VoiceLabTab';

const TABS = {
  key: 'Schlüssel',
  models: 'Modelle',
  content: 'Tests & Prompts',
  logs: 'Protokolle',
  device: 'Gerät',
  lab: 'Sprachlabor',
} as const;

type Tab = keyof typeof TABS;

interface Props {
  config: Config;
  overrides: Overrides;
  apiKey?: string;
  queue: PlaybackQueue;
  recorder: Recorder;
  sessionActive: boolean;
  initialTab?: Tab;
  onClose?: () => void;
  onEndSession: () => void;
  onKeyChanged: () => void;
  /** Validates (full reload) and persists; returns an error message or null. */
  onOverridesChanged: (next: Overrides) => Promise<string | null>;
}

/** Hidden admin area for the Lernbegleitung (reached via corner long-press + PIN, or ⚙ on the start screen). */
export function Admin(props: Props) {
  const [tab, setTab] = useState<Tab>(props.initialTab ?? 'key');
  const changed = countOverrides(props.overrides);

  return (
    <div class="overlay admin" dir="ltr" lang="de">
      <header class="admin-header">
        <h1>Admin</h1>
        {changed > 0 && <span class="badge">{changed} lokale Änderung(en)</span>}
        {props.onClose && (
          <button class="primary" onClick={props.onClose}>
            {props.sessionActive ? '◀ Zurück zur Sitzung' : '◀ Zurück'}
          </button>
        )}
      </header>
      <nav class="tabs">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button key={t} class={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {TABS[t]}
          </button>
        ))}
      </nav>
      <main class="admin-body">
        {tab === 'key' && <KeyTab onKeyChanged={props.onKeyChanged} />}
        {tab === 'models' && <ModelsTab config={props.config} overrides={props.overrides} onSave={props.onOverridesChanged} />}
        {tab === 'content' && <ContentTab config={props.config} overrides={props.overrides} onSave={props.onOverridesChanged} />}
        {tab === 'logs' && <ProtocolsTab />}
        {tab === 'device' && (
          <DeviceTab config={props.config} apiKey={props.apiKey} sessionActive={props.sessionActive} onEndSession={props.onEndSession} />
        )}
        {tab === 'lab' && <VoiceLabTab config={props.config} apiKey={props.apiKey} queue={props.queue} recorder={props.recorder} />}
      </main>
    </div>
  );
}
