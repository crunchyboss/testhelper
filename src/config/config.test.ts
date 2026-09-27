import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { buildJudgePrompt } from '../ai/judge';
import { buildSystemPrompt } from '../ai/systemPrompt';
import { modelsFor } from './loader';
import type { AppConfig, Language, Test } from './types';

// Checks the real files in public/, so a broken edit fails the test run (and the Pages deploy).
const read = (path: string) => readFileSync(new URL(`../../public/${path}`, import.meta.url), 'utf8');
const yaml = <T>(path: string) => load(read(path)) as T;

const app = yaml<AppConfig>('config/app.yaml');
const languages = yaml<Language[]>('config/languages.yaml');
const index = yaml<{ datei: string; kachel_nr: number }[]>('tests/index.yaml');
const tests = index.map((i) => ({ ...yaml<Test>(`tests/${i.datei}`), kachel_nr: i.kachel_nr }));
const template = read('prompts/system.md');
const judgeTemplate = read('prompts/judge.md');

describe('config files', () => {
  it('app.yaml has models for every stage', () => {
    for (const stage of ['stt', 'llm', 'tts', 'judge'] as const) expect(app.defaults[stage].model).toBeTruthy();
  });

  it('languages have unique ids, a greeting and an error phrase', () => {
    expect(new Set(languages.map((l) => l.id)).size).toBe(languages.length);
    expect(languages.length).toBeGreaterThanOrEqual(15);
    for (const l of languages) {
      expect(l.saetze.begruessung, l.id).toBeTruthy();
      expect(l.saetze.fehler, l.id).toBeTruthy();
      expect(l.saetze.antwort_ansage, l.id).toBeTruthy();
      expect(l.saetze.danke, l.id).toBeTruthy();
      expect(l.saetze.moment, l.id).toBeTruthy();
      expect(typeof l.rtl, l.id).toBe('boolean');
    }
  });

  it('RTL flags match the scripts', () => {
    const rtl = languages.filter((l) => l.rtl).map((l) => l.id);
    expect(rtl.sort()).toEqual(['ar', 'ckb', 'fa', 'prs', 'ps']);
  });

  it('tests have numbered tasks with unique numbers', () => {
    for (const t of tests) {
      expect(t.aufgaben.length, t.id).toBeGreaterThan(0);
      expect(new Set(t.aufgaben.map((a) => a.nr)).size, t.id).toBe(t.aufgaben.length);
    }
  });

  it('language overrides and the STT hint are applied', () => {
    const sorani = languages.find((l) => l.id === 'ckb')!;
    expect(modelsFor(app, sorani).stt.language).toBeNull();
    expect(modelsFor(app, { ...sorani, tts: { voice: 'ara' } }).tts).toEqual({ ...app.defaults.tts, voice: 'ara' });
  });
});

describe('system prompt', () => {
  it('renders every test/task/language without leftover placeholders', () => {
    for (const t of tests)
      for (let i = 0; i < t.aufgaben.length; i++)
        for (const l of languages) {
          const p = buildSystemPrompt(template, t, i, l, 'erklaeren');
          expect(p).not.toMatch(/\{\{/);
        }
  });

  it('renders the judge prompt with solution and hints', () => {
    const wortBild = tests.find((t) => t.id === 'wort-bild-alltag')!;
    const p = buildJudgePrompt(judgeTemplate, wortBild, 0, languages[0]);
    expect(p).not.toMatch(/\{\{/);
    expect(p).toContain('Musterlösung: C');
    const form = tests.find((t) => t.id === 'anmeldeformular')!;
    expect(buildJudgePrompt(judgeTemplate, form, 0, languages[0])).toContain('keine (freie Angabe der Person)');
  });

  it('contains the test-specific rules', () => {
    const wortBild = tests.find((t) => t.id === 'wort-bild-alltag')!;
    const p = buildSystemPrompt(template, wortBild, 2, languages[0], 'frage');
    expect(p).toContain('Aufgabe 3: Wort 3: Arzt');
    expect(p).toContain('Die deutschen Wörter vorlesen oder übersetzen');
    expect(p).toContain('Arabisch (العربية)');
    expect(p).toContain('Die Person hat eine Frage gestellt');
  });
});
