import { createStore, del, get, set } from 'idb-keyval';
import type { Overrides } from './types';

// Own database: idb-keyval creates only one object store per database.
const store = createStore('lernhilfe-overrides', 'overrides');
const KEY = 'overrides';

export const loadOverrides = async (): Promise<Overrides> => (await get<Overrides>(KEY, store)) ?? {};
export const saveOverrides = (o: Overrides) => set(KEY, o, store);
export const clearOverrides = () => del(KEY, store);

export function countOverrides(o: Overrides): number {
  const files = Object.keys(o.files ?? {}).length;
  const defaults = Object.keys(o.models?.defaults ?? {}).length;
  const langs = Object.keys(o.models?.languages ?? {}).length;
  return files + defaults + langs;
}
