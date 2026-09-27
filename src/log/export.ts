import { eventCost } from './logger';
import type { SessionLog } from './types';

const COLUMNS = [
  'session_id', 'pseudonym', 'geraet', 'app_version', 'config_hash', 'test_id', 'test_version', 'sprache', 'session_start',
  'event_id', 'zeit', 'aufgabe_nr', 'aktion', 'von_aufgabe_nr', 'audio_ms', 'audio_datei',
  'stt_modell', 'stt_sprachhinweis', 'stt_text', 'stt_ms', 'stt_usd',
  'llm_modell', 'llm_aus_cache', 'llm_antwort', 'llm_ttft_ms', 'llm_ms', 'llm_tokens_in', 'llm_tokens_out', 'llm_usd',
  'judge_modell', 'judge_ms', 'judge_usd',
  'urteil', 'erkannte_antwort', 'begruendung', 'rueckmeldung', 'rueckmeldung_gegeben',
  'tts_modell', 'tts_stimme', 'tts_zeichen', 'tts_saetze', 'tts_usd', 'tts_kosten_quelle',
  'erster_ton_ms', 'gesamt_ms', 'kosten_usd', 'fehler',
] as const;

type Cell = string | number | boolean | null | undefined;

/** German Excel: semicolon separator, decimal comma, UTF-8 BOM. */
function formatCell(v: Cell): string {
  if (v == null) return '';
  let s = typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'boolean' ? (v ? 'ja' : 'nein') : v;
  if (/[;"\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(sessions: SessionLog[]): string {
  const rows: Cell[][] = [];
  for (const s of sessions) {
    for (const e of s.events) {
      const row: Record<(typeof COLUMNS)[number], Cell> = {
        session_id: s.session_id,
        pseudonym: s.pseudonym,
        geraet: s.geraet,
        app_version: s.app_version,
        config_hash: s.config_hash,
        test_id: s.test_id,
        test_version: s.test_version,
        sprache: s.sprache,
        session_start: s.start,
        event_id: e.event_id,
        zeit: e.zeit,
        aufgabe_nr: e.aufgabe_nr,
        aktion: e.aktion,
        von_aufgabe_nr: e.von_aufgabe_nr,
        audio_ms: e.audio?.dauer_ms,
        audio_datei: e.audio?.datei,
        stt_modell: e.stt?.modell,
        stt_sprachhinweis: e.stt?.sprachhinweis,
        stt_text: e.stt?.text,
        stt_ms: e.stt?.latenz_ms,
        stt_usd: e.stt?.kosten_usd,
        llm_modell: e.llm?.modell,
        llm_aus_cache: e.llm?.aus_cache,
        llm_antwort: e.llm?.antwort,
        llm_ttft_ms: e.llm?.ttft_ms,
        llm_ms: e.llm?.latenz_ms,
        llm_tokens_in: e.llm?.tokens_in,
        llm_tokens_out: e.llm?.tokens_out,
        llm_usd: e.llm?.kosten_usd,
        judge_modell: e.judge?.modell,
        judge_ms: e.judge?.latenz_ms,
        judge_usd: e.judge?.kosten_usd,
        urteil: e.bewertung?.urteil,
        erkannte_antwort: e.bewertung?.erkannte_antwort,
        begruendung: e.bewertung?.begruendung_de,
        rueckmeldung: e.bewertung?.rueckmeldung_muttersprache,
        rueckmeldung_gegeben: e.bewertung?.rueckmeldung_gegeben,
        tts_modell: e.tts?.modell,
        tts_stimme: e.tts?.stimme,
        tts_zeichen: e.tts?.zeichen,
        tts_saetze: e.tts?.saetze,
        tts_usd: e.tts?.kosten_usd,
        tts_kosten_quelle: e.tts?.kosten_quelle,
        erster_ton_ms: e.erster_ton_ms,
        gesamt_ms: e.gesamt_ms,
        kosten_usd: Math.round(eventCost(e) * 1e6) / 1e6,
        fehler: e.fehler,
      };
      rows.push(COLUMNS.map((c) => row[c]));
    }
  }
  return '﻿' + [COLUMNS as readonly Cell[], ...rows].map((r) => r.map(formatCell).join(';')).join('\r\n');
}

/** Opens the iOS share sheet (Dateien, AirDrop, Mail …); falls back to a download link on desktop. */
export async function shareFile(name: string, content: string | Blob, type: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([content], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export function exportFileName(ext: string, now = new Date()): string {
  return `lernhilfe-protokolle_${now.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`;
}
