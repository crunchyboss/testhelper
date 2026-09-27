import { audioContext } from './context';

/**
 * Short language-independent tones: rising = "speak now", falling = "got it".
 * Played before the mic opens, so they never end up in the recording.
 */
export function playTone(kind: 'start' | 'stop'): Promise<void> {
  const ctx = audioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  const [from, to] = kind === 'start' ? [520, 880] : [700, 420];
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + 0.15);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.2);
  return new Promise((resolve) => (osc.onended = () => resolve()));
}
