import { describe, expect, it } from 'vitest';
import { parseAssessment } from './judge';

describe('parseAssessment', () => {
  it('parses plain JSON', () => {
    const a = parseAssessment(
      '{"urteil":"korrekt","erkannte_antwort":"C","begruendung_de":"Brot ist C.","rueckmeldung_muttersprache":"أحسنت"}',
    );
    expect(a.urteil).toBe('korrekt');
    expect(a.rueckmeldung_muttersprache).toBe('أحسنت');
  });

  it('tolerates code fences', () => {
    expect(parseAssessment('```json\n{"urteil":"falsch"}\n```').urteil).toBe('falsch');
  });

  it('maps unknown verdicts to "unklar" and fills missing fields', () => {
    const a = parseAssessment('{"urteil":"richtig"}');
    expect(a).toEqual({ urteil: 'unklar', erkannte_antwort: '', begruendung_de: '', rueckmeldung_muttersprache: '' });
  });

  it('throws on non-JSON', () => {
    expect(() => parseAssessment('Die Antwort ist korrekt.')).toThrow(/kein JSON/);
  });
});
