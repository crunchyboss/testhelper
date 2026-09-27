import type { LlmConfig } from '../ai/llm';
import type { SttConfig } from '../ai/stt';
import type { TtsConfig } from '../ai/tts';

export interface Flags {
  rueckmeldung_an_person: boolean;
  erklaerung_cachen: boolean;
  audio_aufnahmen_speichern: boolean;
  max_aufnahme_s: number;
  stille_autostopp_s: number;
  stille_autostopp_antwort_s: number;
  antwort_stt_sprachhinweis: boolean;
  mikro_offen_halten: boolean;
  audio_session_steuern: boolean;
  pause_zwischen_saetzen_ms: number;
  sprach_schwelle: number;
  denk_laut_nach_s: number;
  signaltoene: boolean;
  debug_anzeigen: boolean;
}

export type PipelineMode = 'cascade' | 'audio-llm';

export interface AppConfig {
  admin_pin: string;
  defaults: {
    pipeline: PipelineMode;
    stt: SttConfig;
    llm: LlmConfig;
    tts: TtsConfig;
    judge: LlmConfig;
  };
  flags: Flags;
}

export type PhraseKey = 'begruessung' | 'fehler' | 'antwort_ansage' | 'danke' | 'moment';

export interface Language {
  id: string;
  name_eigen: string;
  name_de: string;
  iso639_1: string | null;
  rtl: boolean;
  varietaet_hinweis?: string;
  status?: 'experimentell';
  pipeline?: PipelineMode;
  stt?: Partial<SttConfig>;
  llm?: Partial<LlmConfig>;
  tts?: Partial<TtsConfig>;
  saetze: Partial<Record<PhraseKey, string>>;
}

export interface Aufgabe {
  nr: number;
  typ: string;
  text: string;
  erklaerung_hinweis?: string;
  bewertung?: string;
  musterloesung?: unknown;
}

export interface Test {
  id: string;
  version: number;
  titel: string;
  domaene: string;
  laslliam?: string[];
  beschreibung_papier: string;
  hilfe: { erlaubt: string[]; verboten: string[]; zusatz_prompt?: string };
  rueckmeldung_an_person?: boolean;
  aufgaben: Aufgabe[];
  /** From tests/index.yaml. */
  kachel_nr: number;
}

export interface Config {
  app: AppConfig;
  /** Test files as listed in tests/index.yaml (for the admin content tab). */
  testFiles: string[];
  languages: Language[];
  tests: Test[];
  systemTemplate: string;
  judgeTemplate: string;
}

export interface Models {
  pipeline: PipelineMode;
  stt: SttConfig;
  llm: LlmConfig;
  tts: TtsConfig;
  judge: LlmConfig;
}

export interface StageOverrides {
  pipeline?: PipelineMode;
  stt?: Partial<SttConfig>;
  llm?: Partial<LlmConfig>;
  tts?: Partial<TtsConfig>;
  judge?: Partial<LlmConfig>;
}

/** Admin changes stored on the device, layered over the files in public/. */
export interface Overrides {
  /** Replaces a config file by path (e.g. "tests/anmeldeformular.yaml"); also allows new test files. */
  files?: Record<string, string>;
  models?: { defaults?: StageOverrides; languages?: Record<string, StageOverrides> };
}
