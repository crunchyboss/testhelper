import { createStore, del, entries, get, set } from 'idb-keyval';
import type { SessionLog } from './types';

// idb-keyval creates exactly one object store per database, so each store needs its own database name.
const sessions = createStore('lernhilfe-log', 'sessions');
const settings = createStore('lernhilfe-settings', 'settings');

export const saveSession = (log: SessionLog) => set(log.session_id, log, sessions);

export async function listSessions(): Promise<SessionLog[]> {
  const all = await entries<string, SessionLog>(sessions);
  return all.map(([, s]) => s).sort((a, b) => a.start.localeCompare(b.start));
}

export async function markExported(ids: string[], when = new Date().toISOString()) {
  for (const id of ids) {
    const s = await get<SessionLog>(id, sessions);
    if (s) await set(id, { ...s, exportiert: when }, sessions);
  }
  await set('last-export', when, settings);
}

export async function deleteSessions(ids: string[]) {
  for (const id of ids) await del(id, sessions);
}

export const getLastExport = () => get<string>('last-export', settings);
export const getDeviceName = async () => (await get<string>('device-name', settings)) ?? 'iPad';
export const setDeviceName = (name: string) => set('device-name', name.trim() || 'iPad', settings);
