import type { Verdict } from '../ai/judge';

// Field names follow PLAN.md §3.3 (German, snake_case) so exports match the documented schema.

export type LogAction = 'sprachwahl' | 'navigation' | 'erklaeren' | 'frage' | 'nochmal' | 'antwort_pruefen';

export interface LogEvent {
  event_id: string;
  zeit: string;
  aufgabe_nr: number | null;
  aktion: LogAction;
  von_aufgabe_nr?: number;
  /** datei: path in the ZIP export, only when audio_aufnahmen_speichern is on. */
  audio?: { dauer_ms: number; datei?: string };
  stt?: { modell: string; text: string; latenz_ms: number; kosten_usd: number | null; sprachhinweis: string | null };
  llm?: {
    modell: string;
    antwort: string;
    ttft_ms: number | null;
    latenz_ms: number;
    tokens_in: number | null;
    tokens_out: number | null;
    kosten_usd: number | null;
    aus_cache: boolean;
  };
  judge?: { modell: string; latenz_ms: number; tokens_in: number | null; tokens_out: number | null; kosten_usd: number | null };
  tts?: {
    modell: string;
    stimme: string | null;
    zeichen: number;
    saetze: number;
    latenzen_ms: number[];
    generation_ids: string[];
    kosten_usd: number | null;
    kosten_quelle: 'generation-api' | 'schaetzung' | 'offen' | 'unbekannt';
  };
  bewertung?: {
    urteil: Verdict;
    erkannte_antwort: string;
    begruendung_de: string;
    rueckmeldung_muttersprache: string;
    rueckmeldung_gegeben: boolean;
  };
  erster_ton_ms?: number | null;
  gesamt_ms?: number | null;
  fehler?: string | null;
}

export interface SessionLog {
  session_id: string;
  pseudonym: string;
  geraet: string;
  app_version: string;
  config_hash: string;
  test_id: string;
  test_version: number;
  sprache: string | null;
  start: string;
  ende: string | null;
  exportiert: string | null;
  summen: {
    kosten_usd: number;
    interaktionen: number;
    llm_tokens_in: number;
    llm_tokens_out: number;
    kosten_offen: number;
  };
  events: LogEvent[];
}
