import { OPENROUTER_BASE } from './openrouter';

export interface ModelInfo {
  id: string;
  name: string;
  pricing?: Record<string, string>;
  supported_voices?: string[];
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
}

export type ModelKind = 'transcription' | 'speech' | 'text' | 'audio-text';

const cache = new Map<ModelKind, Promise<ModelInfo[]>>();

/** Model discovery via /models (public, no key needed). Cached per app run. */
export function fetchModels(kind: ModelKind): Promise<ModelInfo[]> {
  let hit = cache.get(kind);
  if (!hit) {
    const query = kind === 'transcription' || kind === 'speech' ? `?output_modalities=${kind}` : '';
    hit = fetch(`${OPENROUTER_BASE}/models${query}`)
      .then((r) => r.json())
      .then((body) => {
        const all: ModelInfo[] = body.data ?? [];
        const text = (m: ModelInfo) => m.architecture?.output_modalities?.includes('text') ?? true;
        if (kind === 'text') return all.filter(text);
        if (kind === 'audio-text') return all.filter((m) => text(m) && m.architecture?.input_modalities?.includes('audio'));
        return all;
      })
      .then((list) => list.sort((a, b) => a.id.localeCompare(b.id)))
      .catch((e) => {
        cache.delete(kind);
        throw e;
      });
    cache.set(kind, hit);
  }
  return hit;
}

/** Short price hint for dropdown labels, e.g. "$0.75/M in" or "$15/M Zeichen". STT units vary (seconds/tokens), so none. */
export function priceHint(m: ModelInfo, kind: ModelKind): string {
  const prompt = Number(m.pricing?.prompt ?? 0);
  if (!prompt || kind === 'transcription') return '';
  const perMillion = (prompt * 1e6).toFixed(prompt * 1e6 < 10 ? 2 : 0);
  return kind === 'speech' && !Number(m.pricing?.completion) ? `$${perMillion}/M Zeichen` : `$${perMillion}/M in`;
}
