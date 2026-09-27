import { useEffect, useState } from 'preact/hooks';

/** True when launched from the home screen (standalone), not in a Safari tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Asks the browser not to evict our IndexedDB (logs, key). Returns the resulting state. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

let wakeLock: WakeLockSentinel | null = null;
let wakeLockWanted = false;

async function acquireWakeLock() {
  if (!wakeLockWanted || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // denied (e.g. low power mode); the README checklist covers Auto-Lock "Never"
  }
}

// The lock is released by the system whenever the app goes to the background.
document.addEventListener('visibilitychange', () => void acquireWakeLock());

/** Keeps the screen on for the session. Returns whether the Wake Lock API is available. */
export function keepScreenAwake(): boolean {
  wakeLockWanted = true;
  void acquireWakeLock();
  return 'wakeLock' in navigator;
}

export function allowScreenSleep(): void {
  wakeLockWanted = false;
  void wakeLock?.release();
  wakeLock = null;
}

/** navigator.onLine as state; the venue WLAN is the most likely failure. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
