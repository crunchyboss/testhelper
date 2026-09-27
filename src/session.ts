import type { Language, Test } from './config/types';

/** Current session; M3 adds the session log (IndexedDB) on top of this. */
export interface Session {
  pseudonym: string;
  test: Test;
  language?: Language;
}

export function defaultPseudonym(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `P-${pad(now.getDate())}${pad(now.getMonth() + 1)}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** Sets text direction and language on <html> so layout mirrors and fonts shape correctly. */
export function applyLanguageToDocument(lang?: Language) {
  document.documentElement.dir = lang?.rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = lang?.id ?? 'de';
}
