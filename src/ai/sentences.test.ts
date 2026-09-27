import { describe, expect, it } from 'vitest';
import { cleanForSpeech, SentenceSplitter } from './sentences';

function splitStream(chunks: string[]): string[] {
  const s = new SentenceSplitter();
  return [...chunks.flatMap((c) => s.push(c)), ...s.flush()];
}

describe('SentenceSplitter', () => {
  it('emits a sentence as soon as the following whitespace arrives', () => {
    const s = new SentenceSplitter();
    expect(s.push('Hier schreibst du deinen Namen.')).toEqual([]);
    expect(s.push(' Dann')).toEqual(['Hier schreibst du deinen Namen.']);
    expect(s.flush()).toEqual(['Dann']);
  });

  it('handles token-sized chunks', () => {
    const text = 'Das ist gut. Schreib jetzt deinen Vornamen! Kannst du das?';
    expect(splitStream(text.split(''))).toEqual(['Das ist gut.', 'Schreib jetzt deinen Vornamen!', 'Kannst du das?']);
  });

  it('does not split decimals or abbreviations without space', () => {
    expect(splitStream(['Es kostet 3.50 Euro heute. Ende gut.'])).toEqual(['Es kostet 3.50 Euro heute.', 'Ende gut.']);
  });

  it('supports Arabic and Ethiopic terminators', () => {
    expect(splitStream(['هل تريد العربية؟ اضغط مرة أخرى.'])).toEqual(['هل تريد العربية؟', 'اضغط مرة أخرى.']);
    expect(splitStream(['ሰላም! ነዚ ዕዮ ክሕግዘካ እየ። ኣብዚ ስምካ ጸሓፍ።'])).toEqual(['ሰላም! ነዚ ዕዮ ክሕግዘካ እየ።', 'ኣብዚ ስምካ ጸሓፍ።']);
  });

  it('splits on newlines', () => {
    expect(splitStream(['Erste Zeile hier\nZweite Zeile hier'])).toEqual(['Erste Zeile hier', 'Zweite Zeile hier']);
  });

  it('keeps closing quotes with the sentence', () => {
    expect(splitStream(['Das Wort ist „Vorname.“ Sag es nach.'])).toEqual(['Das Wort ist „Vorname.“', 'Sag es nach.']);
  });

  it('merges very short fragments into the next sentence', () => {
    expect(splitStream(['Ja. Das ist richtig so.'])).toEqual(['Ja. Das ist richtig so.']);
  });
});

describe('cleanForSpeech', () => {
  it('strips markdown characters', () => {
    expect(cleanForSpeech('**Vorname** heißt  _Name_')).toBe('Vorname heißt Name');
  });
});
