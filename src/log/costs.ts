import { headers, OPENROUTER_BASE } from '../ai/openrouter';
import type { LogEvent } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET /generation?id=…: exact cost of a finished request. Stats can lag a few seconds behind. */
export async function generationCost(apiKey: string, id: string): Promise<number | null> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/generation?id=${encodeURIComponent(id)}`, { headers: headers(apiKey) });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.data?.total_cost === 'number' ? body.data.total_cost : null;
  } catch {
    return null; // network or CORS
  }
}

let speechPricing: Promise<Map<string, number>> | null = null;

/** Price per input character for character-priced TTS models (null for token-priced ones like Gemini). */
async function pricePerChar(model: string): Promise<number | null> {
  speechPricing ??= fetch(`${OPENROUTER_BASE}/models?output_modalities=speech`)
    .then((r) => r.json())
    .then((body) => {
      const map = new Map<string, number>();
      for (const m of body.data ?? []) {
        const prompt = Number(m.pricing?.prompt);
        const completion = Number(m.pricing?.completion ?? 0);
        if (prompt > 0 && completion === 0) map.set(m.id, prompt);
      }
      return map;
    })
    .catch(() => {
      speechPricing = null;
      return new Map();
    });
  return (await speechPricing).get(model) ?? null;
}

/** Resolves TTS cost: first via the generation API (a few retries), otherwise estimated from chars × price. */
export async function resolveTtsCost(
  apiKey: string,
  tts: NonNullable<LogEvent['tts']>,
): Promise<{ kosten_usd: number | null; kosten_quelle: NonNullable<LogEvent['tts']>['kosten_quelle'] }> {
  if (tts.generation_ids.length === tts.saetze && tts.saetze > 0) {
    for (const wait of [2000, 4000, 8000]) {
      await sleep(wait);
      const costs = await Promise.all(tts.generation_ids.map((id) => generationCost(apiKey, id)));
      if (costs.every((c) => c != null)) {
        return { kosten_usd: costs.reduce((a, b) => a! + b!, 0), kosten_quelle: 'generation-api' };
      }
    }
  }
  const price = await pricePerChar(tts.modell);
  return price != null ? { kosten_usd: price * tts.zeichen, kosten_quelle: 'schaetzung' } : { kosten_usd: null, kosten_quelle: 'unbekannt' };
}
