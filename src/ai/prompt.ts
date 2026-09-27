/** Replaces {{placeholder}} with values; unknown placeholders become empty. */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template
    .replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, key: string) => {
      const v = vars[key];
      return v == null ? '' : String(v);
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const bulletList = (items: string[] | undefined) => (items ?? []).map((s) => `- ${s}`).join('\n');
