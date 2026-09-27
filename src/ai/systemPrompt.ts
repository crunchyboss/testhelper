import type { Language, Test } from '../config/types';
import { Action, ACTION_INSTRUCTIONS } from './actions';
import { bulletList, renderTemplate } from './prompt';

export function buildSystemPrompt(template: string, test: Test, taskIndex: number, lang: Language, action: Action): string {
  const task = test.aufgaben[taskIndex];
  return renderTemplate(template, {
    sprache_name: `${lang.name_de} (${lang.name_eigen})`,
    sprache_varietaet_hinweis: lang.varietaet_hinweis,
    test_titel: test.titel,
    test_domaene: test.domaene,
    beschreibung_papier: test.beschreibung_papier.trim(),
    alle_aufgaben: test.aufgaben.map((a) => `Aufgabe ${a.nr}: ${a.text}`).join('\n'),
    aufgabe_nr: task.nr,
    aufgabe_text: task.text,
    aufgabe_erklaerung_hinweis: task.erklaerung_hinweis,
    erlaubte_hilfen: bulletList(test.hilfe.erlaubt),
    verbote: bulletList(test.hilfe.verboten),
    test_zusatz_prompt: test.hilfe.zusatz_prompt?.trim(),
    aktion_anweisung: ACTION_INSTRUCTIONS[action],
  });
}
