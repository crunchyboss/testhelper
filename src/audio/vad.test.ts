import { describe, expect, it } from 'vitest';
import { speechBounds, speechThreshold } from './vad';

describe('speechThreshold', () => {
  it('uses the base until the noise floor is known', () => {
    expect(speechThreshold(null, 0.02)).toBe(0.02);
  });
  it('scales with room noise but stays within bounds', () => {
    expect(speechThreshold(0.001, 0.02)).toBe(0.02);
    expect(speechThreshold(0.01, 0.02)).toBeCloseTo(0.03);
    expect(speechThreshold(0.2, 0.02)).toBe(0.08);
  });
});

describe('speechBounds', () => {
  const q = 0.005;
  const s = 0.2;
  it('trims leading silence and the auto-stop tail with padding', () => {
    const levels = [q, q, q, q, q, s, s, q, s, q, q, q, q, q, q];
    expect(speechBounds(levels, 0.02, 2)).toEqual([3, 11]);
  });
  it('clamps padding at the edges', () => {
    expect(speechBounds([s, q, q], 0.02, 5)).toEqual([0, 3]);
  });
  it('returns null without speech', () => {
    expect(speechBounds([q, q, q], 0.02, 2)).toBeNull();
  });
});
