// One shared AudioContext for recording and playback, so a single unlock covers both.
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/**
 * Must be called synchronously from a tap handler. iOS only allows audio output after
 * resume() plus a sound started inside a user gesture. Safe to call on every tap; this also
 * recovers from the Safari-specific "interrupted" state after calls or screen lock.
 */
export function unlockAudio(): void {
  const c = audioContext();
  if (c.state !== 'running') void c.resume();
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, c.sampleRate);
  src.connect(c.destination);
  src.start();
}

type AudioSessionType = 'auto' | 'playback' | 'play-and-record';

/** Safari ≥ 16.4 Audio Session API; no-op elsewhere. */
export function setAudioSessionType(type: AudioSessionType): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    // unsupported value on this platform
  }
}

export function hasAudioSessionApi(): boolean {
  return 'audioSession' in navigator;
}
