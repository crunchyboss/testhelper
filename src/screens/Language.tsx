import { useState } from 'preact/hooks';
import { unlockAudio } from '../audio/context';
import { PlaybackQueue } from '../audio/player';
import { playPhrase } from '../audio/phrases';
import { modelsFor } from '../config/loader';
import type { Config, Language as Lang } from '../config/types';
import { HiddenCorner } from '../ui/HiddenCorner';

interface Props {
  config: Config;
  apiKey: string;
  queue: PlaybackQueue;
  onChoose: (lang: Lang) => void;
  onExit: () => void;
}

/** S2: first tap plays "Do you want X? Tap again." in that language, second tap confirms. No flags: language ≠ country. */
export function Language({ config, apiKey, queue, onChoose, onExit }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  function tap(lang: Lang) {
    unlockAudio();
    if (selected === lang.id) {
      queue.stop();
      onChoose(lang);
      return;
    }
    setSelected(lang.id);
    queue.stop();
    void playPhrase(apiKey, modelsFor(config.app, lang).tts, lang.saetze.begruessung, queue);
  }

  return (
    <main class="languages">
      <HiddenCorner onTrigger={onExit} />
      <div class="language-grid">
        {config.languages.map((lang) => (
          <button
            key={lang.id}
            lang={lang.id}
            dir={lang.rtl ? 'rtl' : 'ltr'}
            class={`language-tile ${selected === lang.id ? 'selected' : ''}`}
            onClick={() => tap(lang)}
          >
            <span class="language-icon" aria-hidden="true">
              💬
            </span>
            <span class="language-name">{lang.name_eigen}</span>
            {lang.status === 'experimentell' && <span class="experimental-dot" title="experimentell" />}
          </button>
        ))}
      </div>
    </main>
  );
}
