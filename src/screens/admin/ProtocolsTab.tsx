import { useEffect, useState } from 'preact/hooks';
import { deleteSessions, getLastExport, listSessions, markExported } from '../../log/db';
import { exportFileName, shareFile, toCsv } from '../../log/export';
import type { SessionLog } from '../../log/types';
import { countRecordings, deleteRecordingsFor, getRecording } from '../../log/recordings';
import { createZip, ZipEntry } from '../../log/zip';

const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('de-DE') : '–');
const usd = (n: number) => `$${n.toFixed(4)}`;

/** Session logs: overview, export (JSON/CSV via share sheet), delete. */
export function ProtocolsTab() {
  const [sessions, setSessions] = useState<SessionLog[]>([]);
  const [lastExport, setLastExport] = useState<string | undefined>();
  const [message, setMessage] = useState('');
  const [recordings, setRecordings] = useState(0);
  const [storage, setStorage] = useState<string>('');

  const reload = async () => {
    setSessions(await listSessions());
    setLastExport(await getLastExport());
    setRecordings(await countRecordings());
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null) setStorage(`${(est.usage / 1e6).toFixed(1)} MB belegt`);
  };

  useEffect(() => {
    void reload();
  }, []);

  async function exportAs(kind: 'json' | 'csv' | 'zip') {
    let content: string | Blob;
    if (kind === 'zip') {
      const enc = new TextEncoder();
      const entries: ZipEntry[] = [
        { name: 'protokolle.json', data: enc.encode(JSON.stringify(sessions, null, 2)) },
        { name: 'protokolle.csv', data: enc.encode(toCsv(sessions)) },
      ];
      for (const e of sessions.flatMap((s) => s.events)) {
        const path = e.audio?.datei;
        const data = path && (await getRecording(path));
        if (path && data) entries.push({ name: path, data: new Uint8Array(data) });
      }
      content = new Blob([createZip(entries)], { type: 'application/zip' });
    } else {
      content = kind === 'json' ? JSON.stringify(sessions, null, 2) : toCsv(sessions);
    }
    const type = { json: 'application/json', csv: 'text/csv', zip: 'application/zip' }[kind];
    const result = await shareFile(exportFileName(kind), content, type);
    if (result === 'cancelled') return;
    await markExported(sessions.map((s) => s.session_id));
    setMessage(`${sessions.length} Sitzungen exportiert (${kind.toUpperCase()}).`);
    await reload();
  }

  async function removeAll() {
    const unexported = sessions.filter((s) => !s.exportiert).length;
    const warning = unexported ? `\n\nACHTUNG: ${unexported} Sitzungen wurden noch nicht exportiert!` : '';
    if (!confirm(`Alle ${sessions.length} Sitzungen (und ${recordings} Aufnahmen) endgültig von diesem Gerät löschen?${warning}`)) return;
    await deleteSessions(sessions.map((s) => s.session_id));
    await deleteRecordingsFor(sessions.map((s) => s.session_id));
    setMessage('Alle Sitzungen gelöscht.');
    await reload();
  }

  const unexported = sessions.filter((s) => !s.exportiert).length;
  const totalCost = sessions.reduce((n, s) => n + s.summen.kosten_usd, 0);
  const daysSinceExport = lastExport ? Math.floor((Date.now() - Date.parse(lastExport)) / 86_400_000) : null;

  return (
      <section class="card">
        <h2>Protokolle</h2>
        <dl class="result">
          <dt>Sitzungen</dt>
          <dd>
            {sessions.length} · davon <span class={unexported ? 'warn' : ''}>{unexported} nicht exportiert</span>
          </dd>
          <dt>Kosten gesamt</dt>
          <dd>{usd(totalCost)}</dd>
          <dt>Aufnahmen</dt>
          <dd>
            {recordings} {storage && `· ${storage}`}
          </dd>
          <dt>Letzter Export</dt>
          <dd class={daysSinceExport != null && daysSinceExport > 7 ? 'warn' : ''}>
            {lastExport ? `${date(lastExport)} (vor ${daysSinceExport} Tagen)` : 'noch nie'}
          </dd>
        </dl>
        <div class="row">
          <button class="primary" disabled={!sessions.length} onClick={() => exportAs('json')}>
            Export JSON
          </button>
          <button class="primary" disabled={!sessions.length} onClick={() => exportAs('csv')}>
            Export CSV
          </button>
          {recordings > 0 && (
            <button class="primary" disabled={!sessions.length} onClick={() => exportAs('zip')}>
              Export ZIP (mit Aufnahmen)
            </button>
          )}
          <button class="danger" disabled={!sessions.length} onClick={removeAll}>
            Alle löschen
          </button>
        </div>
        {message && <p class="muted">{message}</p>}
        {sessions.length > 0 && (
          <table class="sessions">
            <thead>
              <tr>
                <th>Start</th>
                <th>Pseudonym</th>
                <th>Test</th>
                <th>Sprache</th>
                <th>Aktionen</th>
                <th>Kosten</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().map((s) => (
                <tr key={s.session_id}>
                  <td>{date(s.start)}</td>
                  <td>{s.pseudonym}</td>
                  <td>{s.test_id}</td>
                  <td>{s.sprache ?? '–'}</td>
                  <td>{s.summen.interaktionen}</td>
                  <td>
                    {usd(s.summen.kosten_usd)}
                    {s.summen.kosten_offen ? '*' : ''}
                  </td>
                  <td>{s.exportiert ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p class="muted">* TTS-Kosten werden noch nachgeladen. ✓ = exportiert.</p>
      </section>
  );
}
