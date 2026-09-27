import { get, set, del } from 'idb-keyval';

// The API key lives only in this device's IndexedDB, never in the repo or the build.
const KEY = 'openrouter-api-key';

export const loadApiKey = () => get<string>(KEY);
export const saveApiKey = (key: string) => set(KEY, key.trim());
export const deleteApiKey = () => del(KEY);

export function maskKey(key: string): string {
  return key.length <= 12 ? '••••' : `${key.slice(0, 8)}…${key.slice(-4)}`;
}
