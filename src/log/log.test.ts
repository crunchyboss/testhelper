import { describe, expect, it } from 'vitest';
import type { TurnMetrics } from '../ai/pipeline';
import { toCsv } from './export';
import { computeTotals, eventFromMetrics } from './logger';
import type { LogEvent, SessionLog } from './types';

const answerMetrics: TurnMetrics = {
  action: 'antwort_pruefen',
  audioMs: 2100,
  stt: { model: 'stt-m', text: 'C', latencyMs: 900, cost: 0.0004 },
  judge: { model: 'judge-m', latencyMs: 1200, tokensIn: 800, tokensOut: 60, cost: 0.001 },
  assessment: {
    urteil: 'korrekt',
    erkannte_antwort: 'C',
    begruendung_de: 'Brot; "C" ist richtig.',
    rueckmeldung_muttersprache: 'أحسنت',
    feedbackGiven: false,
  },
  firstAudioMs: 2200,
  totalMs: 3000,
};

const event = (e: Omit<LogEvent, 'event_id' | 'zeit'>, id: string): LogEvent => ({ ...e, event_id: id, zeit: '2026-09-27T10:00:00Z' });

describe('eventFromMetrics', () => {
  it('maps an answer check with assessment and costs', () => {
    const e = eventFromMetrics(answerMetrics, 3, null);
    expect(e.aktion).toBe('antwort_pruefen');
    expect(e.stt).toMatchObject({ text: 'C', kosten_usd: 0.0004, sprachhinweis: null });
    expect(e.bewertung).toMatchObject({ urteil: 'korrekt', rueckmeldung_gegeben: false });
    expect(e.llm).toBeUndefined();
    expect(e.tts).toBeUndefined();
  });

  it('marks cached explanations as free and TTS cost as pending', () => {
    const cached = eventFromMetrics({ action: 'erklaeren', fromCache: true, llm: { model: 'm', text: 'x', ttftMs: null, latencyMs: 0 } }, 1);
    expect(cached.llm).toMatchObject({ aus_cache: true, kosten_usd: 0 });
    const fresh = eventFromMetrics(
      {
        action: 'erklaeren',
        llm: { model: 'm', text: 'x', ttftMs: 500, latencyMs: 900, cost: 0.002 },
        tts: { model: 't', sentences: 2, chars: 80, latencies: [1, 2], generationIds: ['a', 'b'] },
      },
      1,
    );
    expect(fresh.tts).toMatchObject({ kosten_usd: null, kosten_quelle: 'offen', saetze: 2 });
  });
});

describe('computeTotals', () => {
  it('sums costs and tokens, ignores navigation for the interaction count', () => {
    const events = [
      event(eventFromMetrics(answerMetrics, 3), 'e1'),
      event({ aufgabe_nr: 4, aktion: 'navigation', von_aufgabe_nr: 3 }, 'e2'),
      event(
        {
          ...eventFromMetrics(
            {
              action: 'frage',
              llm: { model: 'm', text: 'x', ttftMs: 1, latencyMs: 1, tokensIn: 100, tokensOut: 10, cost: 0.002 },
              tts: { model: 't', sentences: 1, chars: 10, latencies: [1], generationIds: ['g'] },
            },
            4,
          ),
        },
        'e3',
      ),
    ];
    const t = computeTotals(events);
    expect(t.interaktionen).toBe(2);
    expect(t.kosten_usd).toBeCloseTo(0.0034);
    expect(t.llm_tokens_in).toBe(900);
    expect(t.kosten_offen).toBe(1);
  });
});

describe('toCsv', () => {
  it('writes a German-Excel CSV with BOM, semicolons, decimal commas and quoting', () => {
    const session: SessionLog = {
      session_id: 's1',
      pseudonym: 'P07',
      geraet: 'iPad-1',
      app_version: '0.0.1',
      config_hash: 'abc',
      test_id: 'wort-bild-alltag',
      test_version: 1,
      sprache: 'ar',
      start: '2026-09-27T10:00:00Z',
      ende: null,
      exportiert: null,
      summen: computeTotals([]),
      events: [event(eventFromMetrics(answerMetrics, 3), 'e1')],
    };
    const csv = toCsv([session]);
    expect(csv.startsWith('﻿session_id;pseudonym;')).toBe(true);
    const [header, row] = csv.slice(1).split('\r\n');
    const cols = header.split(';');
    expect(row).toContain('"Brot; ""C"" ist richtig."');
    expect(row).toContain(';0,0004;');
    expect(row).toContain(';korrekt;');
    expect(row).toContain(';nein;');
    expect(cols).toContain('kosten_usd');
  });
});
