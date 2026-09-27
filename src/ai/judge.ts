import type { Language, Test } from '../config/types';
import { audioMessage, chat, ChatMessage, JsonSchemaFormat, LlmConfig } from './llm';
import { OpenRouterError } from './openrouter';
import { renderTemplate } from './prompt';

export const VERDICTS = ['korrekt', 'teilweise', 'falsch', 'unklar'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface Assessment {
  urteil: Verdict;
  erkannte_antwort: string;
  begruendung_de: string;
  rueckmeldung_muttersprache: string;
}

const FORMAT: JsonSchemaFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'bewertung',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        urteil: { type: 'string', enum: [...VERDICTS] },
        erkannte_antwort: { type: 'string' },
        begruendung_de: { type: 'string' },
        rueckmeldung_muttersprache: { type: 'string' },
      },
      required: ['urteil', 'erkannte_antwort', 'begruendung_de', 'rueckmeldung_muttersprache'],
      additionalProperties: false,
    },
  },
};

export function buildJudgePrompt(template: string, test: Test, taskIndex: number, lang: Language): string {
  const task = test.aufgaben[taskIndex];
  const solution = task.musterloesung;
  return renderTemplate(template, {
    sprache_name: `${lang.name_de} (${lang.name_eigen})`,
    test_titel: test.titel,
    test_domaene: test.domaene,
    beschreibung_papier: test.beschreibung_papier.trim(),
    aufgabe_nr: task.nr,
    aufgabe_text: task.text,
    aufgabe_typ: task.typ,
    musterloesung: solution == null ? 'keine (freie Angabe der Person)' : typeof solution === 'string' ? solution : JSON.stringify(solution),
    bewertung: task.bewertung ?? 'keiner',
    test_zusatz_prompt: test.hilfe.zusatz_prompt?.trim(),
  });
}

/** Parses the model output; tolerates code fences and falls back to "unklar" on unknown verdicts. */
export function parseAssessment(content: string): Assessment {
  const json = content.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  let raw: Partial<Assessment>;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new OpenRouterError(0, `Bewertung ist kein JSON: ${content.slice(0, 120)}`, 'judge');
  }
  return {
    urteil: VERDICTS.includes(raw.urteil as Verdict) ? (raw.urteil as Verdict) : 'unklar',
    erkannte_antwort: raw.erkannte_antwort ?? '',
    begruendung_de: raw.begruendung_de ?? '',
    rueckmeldung_muttersprache: raw.rueckmeldung_muttersprache ?? '',
  };
}

export const JUDGE_AUDIO_INSTRUCTION =
  'Das ist die Audioaufnahme der Antwort. Schreibe in erkannte_antwort wörtlich, was die Person gesagt hat (deutsche Wörter und Buchstaben auf Deutsch).';

/** answer: transcript text, or { wavBase64 } in pipeline mode audio-llm (the judge listens itself). */
export async function judgeAnswer(
  apiKey: string,
  cfg: LlmConfig,
  system: string,
  answer: string | { wavBase64: string },
  signal?: AbortSignal,
) {
  const user: ChatMessage =
    typeof answer === 'string' ? { role: 'user', content: answer } : audioMessage(answer.wavBase64, JUDGE_AUDIO_INSTRUCTION);
  const result = await chat(apiKey, cfg, [{ role: 'system', content: system }, user], FORMAT, signal);
  return { ...result, assessment: parseAssessment(result.text) };
}
