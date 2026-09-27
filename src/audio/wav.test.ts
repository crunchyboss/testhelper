import { describe, expect, it } from 'vitest';
import { concatFloat32, downsample, encodeWav, pcm16ToWav, pcmRateFromContentType } from './wav';

describe('wav', () => {
  it('downsamples 48 kHz to 16 kHz by averaging', () => {
    const input = new Float32Array([0.3, 0.3, 0.3, -0.6, -0.6, -0.6]);
    const out = downsample(input, 48000, 16000);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(-0.6);
  });

  it('writes a valid 16-bit mono PCM header', () => {
    const buf = encodeWav(new Float32Array([0, 1, -1]), 16000);
    const view = new DataView(buf);
    const str = (o: number) => String.fromCharCode(...new Uint8Array(buf, o, 4));
    expect(str(0)).toBe('RIFF');
    expect(str(8)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
  });

  it('concatenates chunks', () => {
    expect([...concatFloat32([new Float32Array([1, 2]), new Float32Array([3])])]).toEqual([1, 2, 3]);
  });
});

describe('pcm16ToWav', () => {
  it('wraps little-endian int16 PCM without changing samples', () => {
    const pcm = new Int16Array([0, 16384, -32768]).buffer;
    const wav = new DataView(pcm16ToWav(pcm, 24000));
    expect(wav.getUint32(24, true)).toBe(24000);
    expect(wav.getUint32(40, true)).toBe(6);
    expect(wav.getInt16(44, true)).toBe(0);
    expect(wav.getInt16(46, true)).toBe(16383);
    expect(wav.getInt16(48, true)).toBe(-32768);
  });

  it('ignores a trailing odd byte', () => {
    expect(new DataView(pcm16ToWav(new ArrayBuffer(5), 24000)).getUint32(40, true)).toBe(4);
  });

  it('reads the sample rate from the content type', () => {
    expect(pcmRateFromContentType('audio/pcm;rate=16000')).toBe(16000);
    expect(pcmRateFromContentType('audio/L16; sample_rate=22050')).toBe(22050);
    expect(pcmRateFromContentType('audio/pcm')).toBe(24000);
    expect(pcmRateFromContentType(null)).toBe(24000);
  });
});
