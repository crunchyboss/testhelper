import { describe, expect, it } from 'vitest';
import { TranscriptHeaderParser } from './audioLlm';

const run = (chunks: string[]) => {
  const p = new TranscriptHeaderParser();
  const answer = chunks.map((c) => p.push(c)).join('') + p.flush();
  return { answer, transcript: p.transcript };
};

describe('TranscriptHeaderParser', () => {
  it('separates the transcript line from the answer, token by token', () => {
    const text = 'TRANSKRIPT: ما معنى Vorname؟\nVorname هو اسمك. اكتبه هنا.';
    expect(run(text.split(''))).toEqual({ transcript: 'ما معنى Vorname؟', answer: 'Vorname هو اسمك. اكتبه هنا.' });
  });

  it('passes everything through when there is no header', () => {
    expect(run(['Hallo! ', 'Schreib hier.'])).toEqual({ transcript: '', answer: 'Hallo! Schreib hier.' });
  });

  it('handles lowercase header and a header without answer', () => {
    expect(run(['transkript: bir iki üç'])).toEqual({ transcript: 'bir iki üç', answer: '' });
  });

  it('does not swallow an answer that starts like the header word', () => {
    expect(run(['Tra', 'nsport ist wichtig.\nJa.'])).toEqual({ transcript: '', answer: 'Transport ist wichtig.\nJa.' });
  });
});
