import { createStore, del, get, keys, set } from 'idb-keyval';

// Own database (idb-keyval creates one object store per database). ArrayBuffers instead of
// Blobs, because older iOS versions were unreliable with Blobs in IndexedDB.
const store = createStore('lernhilfe-recordings', 'wav');

export const recordingPath = (sessionId: string, eventId: string) => `aufnahmen/${sessionId}_${eventId}.wav`;

export async function saveRecording(path: string, wav: Blob): Promise<void> {
  await set(path, await wav.arrayBuffer(), store);
}

export const getRecording = (path: string) => get<ArrayBuffer>(path, store);

export async function deleteRecordingsFor(sessionIds: string[]): Promise<void> {
  const all = (await keys(store)) as string[];
  await Promise.all(all.filter((k) => sessionIds.some((id) => k.startsWith(`aufnahmen/${id}_`))).map((k) => del(k, store)));
}

export async function countRecordings(): Promise<number> {
  return (await keys(store)).length;
}
