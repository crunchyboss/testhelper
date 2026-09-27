import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deleteSessions, getDeviceName, getLastExport, listSessions, markExported, saveSession, setDeviceName } from './db';
import { computeTotals } from './logger';
import type { SessionLog } from './types';

const session = (id: string, start: string): SessionLog => ({
  session_id: id,
  pseudonym: 'P1',
  geraet: 'iPad',
  app_version: 't',
  config_hash: 'h',
  test_id: 't',
  test_version: 1,
  sprache: 'ar',
  start,
  ende: null,
  exportiert: null,
  summen: computeTotals([]),
  events: [],
});

// Regression: sessions and settings used to share one IndexedDB database, where idb-keyval
// only ever creates the first object store → "object store not found" on session start.
describe('log db', () => {
  it('stores settings and sessions side by side', async () => {
    expect(await getDeviceName()).toBe('iPad');
    await setDeviceName('iPad-3');
    expect(await getDeviceName()).toBe('iPad-3');

    await saveSession(session('b', '2026-09-27T11:00:00Z'));
    await saveSession(session('a', '2026-09-27T10:00:00Z'));
    expect((await listSessions()).map((s) => s.session_id)).toEqual(['a', 'b']);

    await markExported(['a'], '2026-09-28T08:00:00Z');
    expect((await listSessions())[0].exportiert).toBe('2026-09-28T08:00:00Z');
    expect(await getLastExport()).toBe('2026-09-28T08:00:00Z');

    await deleteSessions(['a', 'b']);
    expect(await listSessions()).toEqual([]);
  });
});
