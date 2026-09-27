// Per-button instruction inserted as {{aktion_anweisung}} into the system prompt.
export const ACTION_INSTRUCTIONS = {
  erklaeren:
    'Erkläre, was man bei dieser Aufgabe tun soll. Wenn es erlaubt ist, sag die wichtigen deutschen Wörter auf dem Blatt vor.',
  frage: 'Die Person hat eine Frage gestellt (siehe Nachricht). Antworte kurz darauf.',
} as const;

export type Action = keyof typeof ACTION_INSTRUCTIONS;

/** User turn sent for button actions without a recording. */
export const ACTION_USER_TEXT: Partial<Record<Action, string>> = {
  erklaeren: '(Die Person hat auf "Aufgabe erklären" getippt.)',
};
