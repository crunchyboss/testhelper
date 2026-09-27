import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeOpenRouter, json, played, sseText, ttsAudio } from '../test/fakes';

vi.mock('../audio/context', async () => (await import('../test/fakes')).fakeContextModule);

const { runTurn } = await import('./pipeline');
const { runAnswerCheck } = await import('./answerCheck');
const { PlaybackQueue } = await import('../audio/player');

const recording = { wav: new Blob([new Uint8Array([82, 73, 70, 70])], { type: 'audio/wav' }), durationMs: 1200 };
const models = {
  pipeline: 'cascade' as const,
  stt: { model: 'stt-m', language: 'ar' },
  llm: { model: 'llm-m' },
  tts: { model: 'tts-m', voice: 'eve' },
  judge: { model: 'judge-m' },
};

function setup(routes: Parameters<typeof fakeOpenRouter>[0]) {
  const router = fakeOpenRouter({ '/audio/speech': (b) => ttsAudio(b.input), ...routes });
  vi.stubGlobal('fetch', router.fetch);
  const queue = new PlaybackQueue();
  queue.gapMs = 0;
  const phases: string[] = [];
  return { router, queue, phases, onPhase: (p: string) => phases.push(p) };
}

beforeEach(() => {
  played.length = 0;
  vi.stubGlobal('location', { origin: 'http://test' });
});
afterEach(() => vi.unstubAllGlobals());

describe('runTurn (cascade)', () => {
  it('transcribes, streams the answer and speaks it sentence by sentence in order', async () => {
    const { router, queue, phases, onPhase } = setup({
      '/audio/transcriptions': () => json({ text: 'Was ist Vorname?', usage: { cost: 0.0004 } }),
      '/chat/completions': () => sseText('Vorname ist dein Name. Schreib ihn hier.'),
    });
    const history = [
      { role: 'user' as const, content: 'vorher' },
      { role: 'assistant' as const, content: 'antwort' },
    ];
    const out = await runTurn({
      apiKey: 'k',
      models,
      system: 'SYS',
      history,
      action: 'frage',
      recording,
      queue,
      onPhase,
      signal: new AbortController().signal,
    });

    expect(played).toEqual(['tts:Vorname ist dein Name.', 'tts:Schreib ihn hier.']);
    expect(phases).toEqual(['thinking', 'speaking', 'idle']);
    expect(out.userMessage).toBe('Was ist Vorname?');
    expect(out.answer).toBe('Vorname ist dein Name. Schreib ihn hier.');
    expect(out.clips).toHaveLength(2);
    expect(out.metrics).toMatchObject({
      stt: { text: 'Was ist Vorname?', cost: 0.0004 },
      llm: { cost: 0.002, tokensIn: 100 },
      tts: { sentences: 2, generationIds: ['gen-tts', 'gen-tts'] },
    });
    expect(out.metrics.firstAudioMs).toBeGreaterThanOrEqual(0);
    expect(out.metrics.error).toBeUndefined();

    const stt = router.callsTo('/audio/transcriptions')[0].body;
    expect(stt).toMatchObject({ model: 'stt-m', language: 'ar', input_audio: { format: 'wav', data: 'UklGRg==' } });
    const llm = router.callsTo('/chat/completions')[0].body;
    expect(llm.messages).toEqual([{ role: 'system', content: 'SYS' }, ...history, { role: 'user', content: 'Was ist Vorname?' }]);
  });

  it('uses the button text instead of STT when there is no recording', async () => {
    const { router, queue, onPhase } = setup({ '/chat/completions': () => sseText('Das ist ein Formular.') });
    const out = await runTurn({
      apiKey: 'k',
      models,
      system: 'SYS',
      history: [],
      action: 'erklaeren',
      userText: '(erklären getippt)',
      queue,
      onPhase,
      signal: new AbortController().signal,
    });
    expect(router.callsTo('/audio/transcriptions')).toHaveLength(0);
    expect(router.callsTo('/chat/completions')[0].body.messages.at(-1)).toEqual({ role: 'user', content: '(erklären getippt)' });
    expect(played).toEqual(['tts:Das ist ein Formular.']);
    expect(out.metrics.stt).toBeUndefined();
  });

  it('reports a failed sentence as error, keeps playing the others and returns no clips for caching', async () => {
    const { queue, phases, onPhase } = setup({
      '/chat/completions': () => sseText('Erster Satz ist ok. Zweiter Satz geht schief.'),
      '/audio/speech': (b) => (b.input.startsWith('Zweiter') ? json({ error: { message: 'bad input' } }, 400) : ttsAudio(b.input)),
    });
    const out = await runTurn({
      apiKey: 'k',
      models,
      system: 'S',
      history: [],
      action: 'erklaeren',
      userText: 'x',
      queue,
      onPhase,
      signal: new AbortController().signal,
    });
    expect(played).toEqual(['tts:Erster Satz ist ok.']);
    expect(phases.at(-1)).toBe('error');
    expect(out.metrics.error).toMatch(/tts HTTP 400: bad input/);
    expect(out.clips).toBeUndefined();
  });

  it('marks an empty transcript as error without calling the LLM', async () => {
    const { router, queue, onPhase } = setup({ '/audio/transcriptions': () => json({ text: '  ' }) });
    const out = await runTurn({ apiKey: 'k', models, system: 'S', history: [], action: 'frage', recording, queue, onPhase, signal: new AbortController().signal });
    expect(out.metrics.error).toMatch(/Keine Sprache erkannt/);
    expect(router.callsTo('/chat/completions')).toHaveLength(0);
  });

  it('reports a user abort as "abgebrochen" and goes back to idle', async () => {
    const ctrl = new AbortController();
    const { queue, phases, onPhase } = setup({ '/chat/completions': () => sseText('Ein langer Satz hier. Und noch einer dazu.') });
    const out = await runTurn({
      apiKey: 'k',
      models,
      system: 'S',
      history: [],
      action: 'erklaeren',
      userText: 'x',
      queue,
      onPhase,
      onText: () => ctrl.abort(),
      signal: ctrl.signal,
    });
    expect(out.metrics.error).toBe('abgebrochen');
    expect(phases.at(-1)).toBe('idle');
    expect(played).toEqual([]);
  });
});

describe('runTurn (audio-llm)', () => {
  it('sends the audio to the chat model, keeps the transcript line out of the spoken answer', async () => {
    const { router, queue, onPhase } = setup({
      '/chat/completions': () => sseText('TRANSKRIPT: ما معنى Vorname؟\nVorname هو اسمك. اكتبه هنا.'),
    });
    const out = await runTurn({
      apiKey: 'k',
      models: { ...models, pipeline: 'audio-llm' },
      system: 'SYS',
      history: [],
      action: 'frage',
      recording,
      queue,
      onPhase,
      signal: new AbortController().signal,
    });
    expect(router.callsTo('/audio/transcriptions')).toHaveLength(0);
    const body = router.callsTo('/chat/completions')[0].body;
    expect(body.messages[0].content).toContain('AUDIO-NACHRICHT');
    expect(body.messages.at(-1).content[0]).toEqual({ type: 'input_audio', input_audio: { data: 'UklGRg==', format: 'wav' } });
    expect(played).toEqual(['tts:Vorname هو اسمك.', 'tts:اكتبه هنا.']);
    expect(out.userMessage).toBe('ما معنى Vorname؟');
    expect(out.metrics.stt).toMatchObject({ model: 'llm-m (audio-llm)', text: 'ما معنى Vorname؟' });
    expect(out.answer).toBe('Vorname هو اسمك. اكتبه هنا.');
  });
});

describe('runAnswerCheck', () => {
  const assessment = {
    urteil: 'korrekt',
    erkannte_antwort: 'C',
    begruendung_de: 'Brot ist Bild C.',
    rueckmeldung_muttersprache: 'أحسنت! هذا صحيح.',
  };
  const judge = () => json({ choices: [{ message: { content: JSON.stringify(assessment) } }], usage: { cost: 0.001, prompt_tokens: 900 } });

  it('without feedback: STT without language hint, judge with JSON schema, neutral thanks', async () => {
    const { router, queue, onPhase } = setup({ '/audio/transcriptions': () => json({ text: 'C' }), '/chat/completions': judge });
    const playNeutral = vi.fn(async () => {});
    const m = await runAnswerCheck({
      apiKey: 'k',
      models,
      stt: { model: 'stt-m', language: null },
      judgeSystem: 'JUDGE',
      recording,
      feedback: false,
      playNeutral,
      queue,
      onPhase,
      signal: new AbortController().signal,
    });
    expect(router.callsTo('/audio/transcriptions')[0].body.language).toBeUndefined();
    const body = router.callsTo('/chat/completions')[0].body;
    expect(body.response_format.type).toBe('json_schema');
    expect(body.messages).toEqual([
      { role: 'system', content: 'JUDGE' },
      { role: 'user', content: 'C' },
    ]);
    expect(playNeutral).toHaveBeenCalledOnce();
    expect(router.callsTo('/audio/speech')).toHaveLength(0);
    expect(m.assessment).toMatchObject({ urteil: 'korrekt', feedbackGiven: false });
    expect(m.judge).toMatchObject({ model: 'judge-m', cost: 0.001 });
  });

  it('with feedback: speaks the mother-tongue feedback instead of the neutral thanks', async () => {
    const { queue, onPhase } = setup({ '/audio/transcriptions': () => json({ text: 'C' }), '/chat/completions': judge });
    const playNeutral = vi.fn(async () => {});
    const m = await runAnswerCheck({
      apiKey: 'k',
      models,
      stt: { model: 'stt-m', language: null },
      judgeSystem: 'J',
      recording,
      feedback: true,
      playNeutral,
      queue,
      onPhase,
      signal: new AbortController().signal,
    });
    expect(playNeutral).not.toHaveBeenCalled();
    // "أحسنت!" is shorter than the minimum sentence length, so it is merged with the next one.
    expect(played).toEqual(['tts:أحسنت! هذا صحيح.']);
    expect(m.assessment?.feedbackGiven).toBe(true);
  });

  it('in audio-llm mode the judge listens itself (no STT call)', async () => {
    const { router, queue, onPhase } = setup({ '/chat/completions': judge });
    const m = await runAnswerCheck({
      apiKey: 'k',
      models: { ...models, pipeline: 'audio-llm' },
      stt: { model: 'stt-m', language: null },
      judgeSystem: 'J',
      recording,
      feedback: false,
      playNeutral: async () => {},
      queue,
      onPhase,
      signal: new AbortController().signal,
    });
    expect(router.callsTo('/audio/transcriptions')).toHaveLength(0);
    expect(router.callsTo('/chat/completions')[0].body.messages[1].content[0].type).toBe('input_audio');
    expect(m.stt).toMatchObject({ model: 'judge-m (audio-llm)', text: 'C' });
  });
});
