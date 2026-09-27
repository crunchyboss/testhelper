export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export class OpenRouterError extends Error {
  constructor(
    public status: number,
    message: string,
    public stage?: string,
  ) {
    super(message);
  }
}

export function headers(apiKey: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': location.origin,
    'X-Title': 'Lernhilfe DaZ (Preview)',
    ...extra,
  };
}

export async function fail(res: Response, stage?: string): Promise<never> {
  let message = res.statusText;
  try {
    const body = await res.json();
    message = body?.error?.message ?? message;
  } catch {
    // body was not JSON; keep statusText
  }
  throw new OpenRouterError(res.status, message, stage);
}

const RETRY_STATUS = new Set([429, 500, 502, 503]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PostOptions {
  /** Covers the whole request incl. a streamed body. */
  timeoutMs?: number;
  /** Automatic retries on 429/5xx or network errors (not after a user abort). */
  retries?: number;
  stage?: string;
}

/**
 * POST JSON to OpenRouter with a timeout and one retry: venue WLAN can be flaky and
 * providers occasionally answer 429/502. The caller's signal still cancels everything.
 */
export async function postJson(
  apiKey: string,
  path: string,
  body: unknown,
  signal?: AbortSignal,
  { timeoutMs = 45_000, retries = 1, stage }: PostOptions = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    const forwardAbort = () => ctrl.abort();
    if (signal?.aborted) ctrl.abort();
    signal?.addEventListener('abort', forwardAbort, { once: true });
    try {
      const res = await fetch(`${OPENROUTER_BASE}${path}`, {
        method: 'POST',
        headers: headers(apiKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (RETRY_STATUS.has(res.status) && attempt < retries && !signal?.aborted) {
        clearTimeout(timer);
        await sleep(800);
        continue;
      }
      // The timer keeps running on purpose: it also bounds reading a streamed body.
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (signal?.aborted) throw e;
      if (timedOut) throw new OpenRouterError(408, `Zeitüberschreitung nach ${timeoutMs / 1000} s`, stage);
      if (attempt < retries) {
        await sleep(800);
        continue;
      }
      throw new OpenRouterError(0, `Netzwerkfehler: ${(e as Error).message}`, stage);
    }
  }
}

export interface KeyInfo {
  label?: string;
  usage?: number;
  limit?: number | null;
  limit_remaining?: number | null;
  is_free_tier?: boolean;
}

/** GET /key: validates the key and returns usage and credit limit. */
export async function getKeyInfo(apiKey: string): Promise<KeyInfo> {
  const res = await fetch(`${OPENROUTER_BASE}/key`, { headers: headers(apiKey) });
  if (!res.ok) await fail(res);
  const body = await res.json();
  return body.data ?? {};
}
