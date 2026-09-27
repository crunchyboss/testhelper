import type { TurnMetrics } from '../ai/pipeline';
import type { Config, Test } from '../config/types';
import { hash } from '../hash';
import { getDeviceName, saveSession } from './db';
import type { LogAction, LogEvent, SessionLog } from './types';

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function sessionId(now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
  return `${stamp}_${Math.random().toString(36).slice(2, 6)}`;
}

export function configHash(config: Config): string {
  return hash(JSON.stringify([config.app, config.languages, config.tests, config.systemTemplate, config.judgeTemplate]));
}

/** Converts pipeline metrics into a log event (without id/time). */
export function eventFromMetrics(m: TurnMetrics, aufgabeNr: number, sttHint: string | null = null): Omit<LogEvent, 'event_id' | 'zeit'> {
  const ev: Omit<LogEvent, 'event_id' | 'zeit'> = {
    aufgabe_nr: aufgabeNr,
    aktion: m.action as LogAction,
    erster_ton_ms: m.firstAudioMs ?? null,
    gesamt_ms: m.totalMs ?? null,
    fehler: m.error ?? null,
  };
  if (m.audioMs != null) ev.audio = { dauer_ms: m.audioMs };
  if (m.stt)
    ev.stt = { modell: m.stt.model, text: m.stt.text, latenz_ms: m.stt.latencyMs, kosten_usd: m.stt.cost ?? null, sprachhinweis: sttHint };
  if (m.llm || m.fromCache)
    ev.llm = {
      modell: m.llm?.model ?? '',
      antwort: m.llm?.text ?? '',
      ttft_ms: m.llm?.ttftMs ?? null,
      latenz_ms: m.llm?.latencyMs ?? 0,
      tokens_in: m.llm?.tokensIn ?? null,
      tokens_out: m.llm?.tokensOut ?? null,
      kosten_usd: m.fromCache ? 0 : (m.llm?.cost ?? null),
      aus_cache: !!m.fromCache,
    };
  if (m.judge)
    ev.judge = {
      modell: m.judge.model,
      latenz_ms: m.judge.latencyMs,
      tokens_in: m.judge.tokensIn ?? null,
      tokens_out: m.judge.tokensOut ?? null,
      kosten_usd: m.judge.cost ?? null,
    };
  if (m.tts && m.tts.sentences > 0)
    ev.tts = {
      modell: m.tts.model,
      stimme: m.tts.voice ?? null,
      zeichen: m.tts.chars,
      saetze: m.tts.sentences,
      latenzen_ms: m.tts.latencies,
      generation_ids: m.tts.generationIds,
      kosten_usd: null,
      kosten_quelle: 'offen',
    };
  if (m.assessment)
    ev.bewertung = {
      urteil: m.assessment.urteil,
      erkannte_antwort: m.assessment.erkannte_antwort,
      begruendung_de: m.assessment.begruendung_de,
      rueckmeldung_muttersprache: m.assessment.rueckmeldung_muttersprache,
      rueckmeldung_gegeben: m.assessment.feedbackGiven,
    };
  return ev;
}

export function eventCost(e: LogEvent): number {
  return (e.stt?.kosten_usd ?? 0) + (e.llm?.kosten_usd ?? 0) + (e.judge?.kosten_usd ?? 0) + (e.tts?.kosten_usd ?? 0);
}

export function computeTotals(events: LogEvent[]): SessionLog['summen'] {
  const interactive = events.filter((e) => e.aktion !== 'navigation' && e.aktion !== 'sprachwahl');
  return {
    kosten_usd: round(events.reduce((sum, e) => sum + eventCost(e), 0)),
    interaktionen: interactive.length,
    llm_tokens_in: events.reduce((n, e) => n + (e.llm?.tokens_in ?? 0) + (e.judge?.tokens_in ?? 0), 0),
    llm_tokens_out: events.reduce((n, e) => n + (e.llm?.tokens_out ?? 0) + (e.judge?.tokens_out ?? 0), 0),
    kosten_offen: events.filter((e) => e.tts?.kosten_quelle === 'offen').length,
  };
}

/** Keeps one session in memory and writes it to IndexedDB after every change (writes are serialized). */
export class SessionLogger {
  private writes: Promise<void> = Promise.resolve();
  private counter = 0;

  private constructor(readonly log: SessionLog) {}

  static async start(config: Config, pseudonym: string, test: Test): Promise<SessionLogger> {
    const now = new Date();
    const logger = new SessionLogger({
      session_id: sessionId(now),
      pseudonym,
      geraet: await getDeviceName(),
      app_version: __APP_VERSION__,
      config_hash: configHash(config),
      test_id: test.id,
      test_version: test.version,
      sprache: null,
      start: now.toISOString(),
      ende: null,
      exportiert: null,
      summen: computeTotals([]),
      events: [],
    });
    logger.persist();
    return logger;
  }

  setLanguage(id: string) {
    this.log.sprache = id;
    this.add({ aufgabe_nr: null, aktion: 'sprachwahl' });
  }

  add(event: Omit<LogEvent, 'event_id' | 'zeit'>): LogEvent {
    const full: LogEvent = { event_id: `e${++this.counter}`, zeit: new Date().toISOString(), ...event };
    this.log.events.push(full);
    this.persist();
    return full;
  }

  update(eventId: string, change: (e: LogEvent) => void) {
    const e = this.log.events.find((x) => x.event_id === eventId);
    if (!e) return;
    change(e);
    this.persist();
  }

  end() {
    this.log.ende = new Date().toISOString();
    this.persist();
  }

  flush(): Promise<void> {
    return this.writes;
  }

  private persist() {
    this.log.summen = computeTotals(this.log.events);
    const snapshot = structuredClone(this.log);
    this.writes = this.writes.then(() => saveSession(snapshot)).catch((e) => console.error('Protokoll speichern fehlgeschlagen', e));
  }
}
