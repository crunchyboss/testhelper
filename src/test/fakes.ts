// Test doubles: a fake AudioContext (records what is "played") and a fake OpenRouter (fetch router).

/** Labels of played buffers, in playback order. */
export const played: string[] = [];

const decoder = new TextDecoder();

/** Module replacement for src/audio/context.ts. Decoding turns the bytes back into their text label. */
export const fakeContextModule = {
  audioContext: () => ({
    destination: {},
    decodeAudioData: async (data: ArrayBuffer) => ({ label: decoder.decode(data) }),
    createBufferSource: () => {
      const src: { buffer?: { label: string }; onended?: () => void; connect(): void; start(): void; stop(): void } = {
        connect() {},
        start() {
          played.push(src.buffer!.label);
          setTimeout(() => src.onended?.(), 1);
        },
        stop() {
          src.onended?.();
        },
      };
      return src;
    },
  }),
  unlockAudio() {},
  setAudioSessionType() {},
  hasAudioSessionApi: () => false,
};

export interface Call {
  path: string;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Handler = (body: any, call: number) => Response | Promise<Response>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** fetch replacement routing by path suffix; records requests; honours aborts like the real fetch. */
export function fakeOpenRouter(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const counts: Record<string, number> = {};
  const fetch = async (url: string, init: RequestInit = {}) => {
    if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const path = new URL(url).pathname.replace('/api/v1', '');
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ path, body });
    const handler = routes[path];
    if (!handler) return new Response(`{"error":{"message":"no route ${path}"}}`, { status: 404 });
    counts[path] = (counts[path] ?? 0) + 1;
    return handler(body, counts[path]);
  };
  return { fetch, calls, callsTo: (path: string) => calls.filter((c) => c.path === path) };
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/** SSE response from raw chunks (chunks may split lines anywhere, like a real network). */
export function sse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      chunks.forEach((c) => ctrl.enqueue(encoder.encode(c)));
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}

/** SSE body streaming `text` in small token-like pieces, with usage at the end. */
export function sseText(text: string, usage = { prompt_tokens: 100, completion_tokens: 20, cost: 0.002 }): Response {
  const pieces = text.match(/.{1,4}/gsu) ?? [];
  const events = pieces.map((p, i) => `data: ${JSON.stringify({ id: 'gen-llm', choices: [{ delta: { content: p } }] })}\n\n`);
  return sse([': OPENROUTER PROCESSING\n\n', ...events, `data: ${JSON.stringify({ choices: [], usage })}\n\n`, 'data: [DONE]\n\n']);
}

/** TTS response: the "audio" is just the text, so the fake decoder can label what was played. */
export const ttsAudio = (input: string, id = 'gen-tts') =>
  new Response(`tts:${input}`, { headers: { 'Content-Type': 'audio/mpeg', 'X-Generation-Id': id } });
