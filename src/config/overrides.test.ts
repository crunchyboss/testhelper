import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE_FILES, loadConfig, modelsFor } from './loader';
import type { Overrides } from './types';

const read = (path: string) => readFileSync(new URL(`../../public/${path}`, import.meta.url), 'utf8');
const files = Object.fromEntries(
  [...BASE_FILES, 'tests/anmeldeformular.yaml', 'tests/wort-bild-alltag.yaml'].map((p) => [p, read(p)]),
);
// All files come from the override map, so loadConfig never needs fetch in these tests.
const load = (extra: Overrides = {}) => loadConfig({ ...extra, files: { ...files, ...extra.files } });

describe('overrides', () => {
  it('applies global and per-language model overrides', async () => {
    const config = await load({
      models: {
        defaults: { llm: { model: 'openai/gpt-5.4-mini' }, pipeline: 'audio-llm' },
        languages: { ti: { tts: { voice: 'ara' }, pipeline: 'cascade' } },
      },
    });
    const ar = modelsFor(config.app, config.languages.find((l) => l.id === 'ar')!);
    const ti = modelsFor(config.app, config.languages.find((l) => l.id === 'ti')!);
    expect(ar.llm.model).toBe('openai/gpt-5.4-mini');
    expect(ar.llm.temperature).toBe(0.3); // untouched fields stay
    expect(ar.pipeline).toBe('audio-llm');
    expect(ti.pipeline).toBe('cascade');
    expect(ti.tts.voice).toBe('ara');
    expect(ar.tts.voice).toBe('eve');
  });

  it('replaces a test file and allows new test files via index.yaml', async () => {
    const neu = `id: einkaufen\nversion: 1\ntitel: Einkaufen\ndomaene: Alltag\nbeschreibung_papier: Ein Zettel.\nhilfe:\n  erlaubt: [a]\n  verboten: [b]\naufgaben:\n  - nr: 1\n    typ: freitext\n    text: "Milch"\n`;
    const config = await load({
      files: {
        'tests/einkaufen.yaml': neu,
        'tests/index.yaml': files['tests/index.yaml'] + '- datei: einkaufen.yaml\n  kachel_nr: 3\n',
      },
    });
    expect(config.tests.map((t) => t.id)).toEqual(['anmeldeformular', 'wort-bild-alltag', 'einkaufen']);
    expect(config.testFiles).toContain('tests/einkaufen.yaml');
  });

  it('rejects broken files with a readable message', async () => {
    await expect(load({ files: { 'config/languages.yaml': '- id: [kaputt' } })).rejects.toThrow(/languages.yaml: YAML-Fehler/);
    await expect(load({ files: { 'tests/anmeldeformular.yaml': 'id: x\ntitel: y\n' } })).rejects.toThrow(/keine aufgaben/);
  });
});
