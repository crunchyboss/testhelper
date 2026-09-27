import { load as parseYaml } from 'js-yaml';
import type { AppConfig, Config, Language, Models, Overrides, StageOverrides, Test } from './types';

export class ConfigError extends Error {}

export const BASE_FILES = ['config/app.yaml', 'config/languages.yaml', 'prompts/system.md', 'prompts/judge.md', 'tests/index.yaml'];

/** Fetches a file from public/ (no-cache: edited files show up without reinstalling the home-screen app). */
export async function fetchDefaultFile(path: string): Promise<string> {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new ConfigError(`${path} nicht gefunden (HTTP ${res.status})`);
  return res.text();
}

function parse<T>(path: string, text: string): T {
  try {
    return parseYaml(text) as T;
  } catch (e) {
    throw new ConfigError(`${path}: YAML-Fehler: ${(e as Error).message}`);
  }
}

function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new ConfigError(message);
}

function checkTest(t: Test, file: string) {
  check(t && t.id && t.titel, `${file}: id und titel fehlen`);
  check(Array.isArray(t.aufgaben) && t.aufgaben.length > 0, `${file}: keine aufgaben`);
  check(t.hilfe?.erlaubt && t.hilfe?.verboten, `${file}: hilfe.erlaubt und hilfe.verboten fehlen`);
  t.aufgaben.forEach((a, i) => check(a.nr != null && a.text, `${file}: Aufgabe ${i + 1} braucht nr und text`));
}

const merge = <T extends object>(base: T | undefined, over: Partial<T> | undefined): T => ({ ...(base as T), ...over });

function applyStageOverrides<T extends { stt?: unknown; llm?: unknown; tts?: unknown }>(target: T, o: StageOverrides | undefined) {
  if (!o) return;
  for (const stage of ['stt', 'llm', 'tts', 'judge'] as const) {
    const over = o[stage];
    if (over && Object.keys(over).length) (target as Record<string, unknown>)[stage] = merge((target as Record<string, object>)[stage], over);
  }
  if (o.pipeline) (target as { pipeline?: string }).pipeline = o.pipeline;
}

/** Loads all configuration files from public/ (relative to the page, so it works under /<repo>/), with device overrides on top. */
export async function loadConfig(overrides: Overrides = {}): Promise<Config> {
  const text = (path: string) => (overrides.files?.[path] != null ? Promise.resolve(overrides.files[path]) : fetchDefaultFile(path));
  const [appText, languagesText, systemTemplate, judgeTemplate, indexText] = await Promise.all(BASE_FILES.map(text));
  const app = parse<AppConfig>('config/app.yaml', appText);
  const languages = parse<Language[]>('config/languages.yaml', languagesText);
  const index = parse<{ datei: string; kachel_nr: number }[]>('tests/index.yaml', indexText);

  check(app?.defaults?.llm?.model && app.defaults.tts?.model && app.defaults.stt?.model, 'app.yaml: defaults.stt/llm/tts.model fehlen');
  check(Array.isArray(languages) && languages.length > 0, 'languages.yaml: keine Sprachen');
  languages.forEach((l) => check(l.id && l.name_eigen, `languages.yaml: Sprache ohne id/name_eigen`));
  check(Array.isArray(index), 'tests/index.yaml: Liste erwartet');

  const tests = await Promise.all(
    index.map(async ({ datei, kachel_nr }) => {
      const path = `tests/${datei}`;
      const test = parse<Test>(path, await text(path));
      checkTest(test, datei);
      return { ...test, kachel_nr };
    }),
  );

  applyStageOverrides(app.defaults, overrides.models?.defaults);
  for (const lang of languages) applyStageOverrides(lang, overrides.models?.languages?.[lang.id]);

  return {
    app,
    testFiles: index.map((i) => `tests/${i.datei}`),
    languages: languages.map((l) => ({ ...l, saetze: l.saetze ?? {} })),
    tests,
    systemTemplate,
    judgeTemplate,
  };
}

/** Defaults from app.yaml, overridden per language; the STT language hint comes from iso639_1. */
export function modelsFor(app: AppConfig, lang: Language): Models {
  return {
    pipeline: lang.pipeline ?? app.defaults.pipeline ?? 'cascade',
    stt: { ...app.defaults.stt, ...lang.stt, language: lang.iso639_1 },
    llm: { ...app.defaults.llm, ...lang.llm },
    tts: { ...app.defaults.tts, ...lang.tts },
    judge: { ...app.defaults.llm, ...app.defaults.judge },
  };
}
