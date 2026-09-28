import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { setAudioSessionType, unlockAudio } from '../audio/context';
import { decodeAudio, PlaybackQueue } from '../audio/player';
import { Recorder, Recording } from '../audio/recorder';
import { explanationKey, getExplanation, saveExplanation } from '../audio/cache';
import { playPhrase } from '../audio/phrases';
import { playTone } from '../audio/earcons';
import { Action, ACTION_USER_TEXT } from '../ai/actions';
import { runAnswerCheck } from '../ai/answerCheck';
import { buildJudgePrompt } from '../ai/judge';
import type { ChatMessage } from '../ai/llm';
import { Phase, runTurn, TurnMetrics } from '../ai/pipeline';
import { buildSystemPrompt } from '../ai/systemPrompt';
import { modelsFor } from '../config/loader';
import type { Config, Language, Test } from '../config/types';
import { hash } from '../hash';
import { useOnline } from '../device';
import { recordingPath, saveRecording } from '../log/recordings';
import { resolveTtsCost } from '../log/costs';
import { eventFromMetrics, SessionLogger } from '../log/logger';
import { DebugPanel } from '../ui/DebugPanel';
import { HiddenCorner } from '../ui/HiddenCorner';
import { StatusOrb } from '../ui/StatusOrb';

interface Props {
  config: Config;
  apiKey: string;
  test: Test;
  language: Language;
  queue: PlaybackQueue;
  recorder: Recorder;
  logger: SessionLogger;
  onExit: () => void;
  /** Gives the app a way to cancel whatever is running (used when the admin area opens). */
  registerInterrupt: (interrupt: (() => void) | null) => void;
}

type RecordMode = 'frage' | 'antwort_pruefen';

const HISTORY_PAIRS = 3;

/** S3: one task of the paper test. The big number matches the number on the paper. */
export function Task({ config, apiKey, test, language, queue, recorder, logger, onExit, registerInterrupt }: Props) {
  const { flags } = config.app;
  const models = useMemo(() => modelsFor(config.app, language), [config, language]);
  const answerStt = useMemo(
    () => ({ ...models.stt, language: flags.antwort_stt_sprachhinweis ? models.stt.language : null }),
    [models, flags],
  );
  const [taskIndex, setTaskIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [level, setLevel] = useState(0);
  const [liveText, setLiveText] = useState('');
  const [metrics, setMetrics] = useState<TurnMetrics | null>(null);
  const [explained, setExplained] = useState<Set<number>>(new Set());
  const [canReplay, setCanReplay] = useState(false);
  const [recordMode, setRecordMode] = useState<RecordMode | null>(null);
  const history = useRef<ChatMessage[]>([]);
  const abort = useRef<AbortController | null>(null);
  const recordModeRef = useRef<RecordMode>('frage');
  const task = test.aufgaben[taskIndex];
  const busy = phase === 'thinking' || phase === 'speaking';
  const listening = phase === 'listening';
  const online = useOnline();

  // Denk-Laut: if nothing is audible after a while, say "One moment, please" in the learner's language.
  useEffect(() => {
    if (phase !== 'thinking' || !flags.denk_laut_nach_s) return;
    const timer = setTimeout(() => {
      if (queue.isIdle) void playPhrase(apiKey, models.tts, language.saetze.moment, queue, { onlyIfIdle: true });
    }, flags.denk_laut_nach_s * 1000);
    return () => clearTimeout(timer);
  }, [phase]);

  const cancelRef = useRef<() => void>(() => {});
  useEffect(() => {
    queue.gapMs = flags.pause_zwischen_saetzen_ms;
    registerInterrupt(() => cancelRef.current());
    return () => {
      registerInterrupt(null);
      abort.current?.abort();
      queue.stop();
      recorder.cancel();
      recorder.release();
    };
  }, []);

  /**
   * Logs the interaction; TTS cost is resolved in the background and patched into the event.
   * With audio_aufnahmen_speichern, the recording is stored and referenced for the ZIP export.
   */
  function log(m: TurnMetrics, sttHint: string | null = models.stt.language ?? null, recording?: Recording) {
    const ev = logger.add(eventFromMetrics(m, task.nr, sttHint));
    if (ev.tts) {
      void resolveTtsCost(apiKey, ev.tts).then((cost) => {
        logger.update(ev.event_id, (e) => Object.assign(e.tts!, cost));
        setMetrics((prev) => {
          if (!prev || !prev.tts || prev.tts !== m.tts) return prev;
          return { ...prev, tts: { ...prev.tts, cost: cost.kosten_usd, costSource: cost.kosten_quelle } };
        });
      });
    }
    if (recording && flags.audio_aufnahmen_speichern) {
      const path = recordingPath(logger.log.session_id, ev.event_id);
      void saveRecording(path, recording.wav)
        .then(() => logger.update(ev.event_id, (e) => (e.audio = { dauer_ms: recording.durationMs, datei: path })))
        .catch((e) => console.error('Aufnahme speichern fehlgeschlagen', e));
    }
  }

  function stopEverything() {
    abort.current?.abort();
    queue.stop();
    recorder.cancel();
    setRecordMode(null);
    setLevel(0);
  }

  function goTo(index: number) {
    unlockAudio();
    stopEverything();
    logger.add({ aufgabe_nr: test.aufgaben[index].nr, aktion: 'navigation', von_aufgabe_nr: task.nr });
    setTaskIndex(index);
    setPhase('idle');
    setMetrics(null);
    setLiveText('');
    setCanReplay(false);
    queue.beginTurn();
    history.current = [];
  }

  function remember(user: string, answer: string) {
    history.current = [
      ...history.current,
      { role: 'user' as const, content: user },
      { role: 'assistant' as const, content: answer },
    ].slice(-HISTORY_PAIRS * 2);
  }

  async function playError() {
    await playPhrase(apiKey, models.tts, language.saetze.fehler, queue);
  }

  async function turn(action: Action, recording?: Recording) {
    if (flags.audio_session_steuern && !flags.mikro_offen_halten) setAudioSessionType('playback');
    abort.current = new AbortController();
    setLiveText('');
    const result = await runTurn({
      apiKey,
      models,
      system: buildSystemPrompt(config.systemTemplate, test, taskIndex, language, action),
      history: history.current,
      action,
      userText: ACTION_USER_TEXT[action],
      recording,
      queue,
      onPhase: setPhase,
      onText: setLiveText,
      signal: abort.current.signal,
    });
    setMetrics(result.metrics);
    log(result.metrics, undefined, recording);
    setCanReplay(queue.canReplay);
    if (result.userMessage && result.answer) remember(result.userMessage, result.answer);
    if (result.metrics.error && !abort.current.signal.aborted) await playError();
    return result;
  }

  async function explain() {
    unlockAudio();
    setExplained((s) => new Set(s).add(taskIndex));
    const system = buildSystemPrompt(config.systemTemplate, test, taskIndex, language, 'erklaeren');
    const key = explanationKey([
      test.id,
      test.version,
      task.nr,
      language.id,
      models.llm.model,
      models.tts.model,
      models.tts.voice,
      hash(system),
    ]);

    if (flags.erklaerung_cachen) {
      setPhase('thinking');
      const hit = await getExplanation(key);
      if (hit) {
        const t0 = performance.now();
        const m: TurnMetrics = { action: 'erklaeren', fromCache: true, llm: undefined };
        queue.beginTurn();
        hit.clips.forEach((clip, i) =>
          queue.enqueue(
            decodeAudio(clip),
            i === 0
              ? () => {
                  m.firstAudioMs = Math.round(performance.now() - t0);
                  setPhase('speaking');
                }
              : undefined,
          ),
        );
        setLiveText(hit.text);
        remember(ACTION_USER_TEXT.erklaeren!, hit.text);
        await queue.drain();
        m.totalMs = Math.round(performance.now() - t0);
        m.llm = { model: models.llm.model, text: hit.text, ttftMs: null, latencyMs: 0 };
        setMetrics(m);
        log(m, null);
        setCanReplay(queue.canReplay);
        setPhase('idle');
        return;
      }
    }

    const result = await turn('erklaeren');
    if (flags.erklaerung_cachen && result.clips && result.answer && !result.metrics.error) {
      void saveExplanation(key, { text: result.answer, clips: result.clips, createdAt: new Date().toISOString() });
    }
  }

  async function checkAnswer(recording: Recording) {
    if (flags.audio_session_steuern && !flags.mikro_offen_halten) setAudioSessionType('playback');
    abort.current = new AbortController();
    setLiveText('');
    const m = await runAnswerCheck({
      apiKey,
      models,
      stt: answerStt,
      judgeSystem: buildJudgePrompt(config.judgeTemplate, test, taskIndex, language),
      recording,
      feedback: test.rueckmeldung_an_person ?? flags.rueckmeldung_an_person,
      playNeutral: () => playPhrase(apiKey, models.tts, language.saetze.danke, queue),
      queue,
      onPhase: setPhase,
      signal: abort.current.signal,
    });
    setMetrics(m);
    log(m, answerStt.language ?? null, recording);
    setCanReplay(queue.canReplay);
    if (m.error && !abort.current.signal.aborted) await playError();
  }

  function finishRecording() {
    const rec = recorder.stop();
    setLevel(0);
    setRecordMode(null);
    if (!rec) return;
    if (flags.signaltoene) void playTone('stop');
    if (!rec.heardSpeech) {
      setPhase('idle');
      return;
    }
    if (recordModeRef.current === 'antwort_pruefen') void checkAnswer(rec);
    else void turn('frage', rec);
  }

  async function toggleRecording(mode: RecordMode) {
    unlockAudio();
    if (recorder.isRecording) return finishRecording();
    queue.stop();
    // Cancel (orb, ◀ ▶, admin) during the announcement or the tone stops the queue: then do not record.
    const gen = queue.generationId;
    const cancelled = () => queue.generationId !== gen;
    recordModeRef.current = mode;
    setRecordMode(mode);
    if (mode === 'antwort_pruefen') {
      // "Say your answer. You can also spell it." Played before the mic opens.
      setPhase('speaking');
      await playPhrase(apiKey, models.tts, language.saetze.antwort_ansage, queue);
      if (cancelled()) return;
    }
    // The start tone plays before the mic opens, so it never ends up in the recording.
    if (flags.signaltoene) await playTone('start');
    if (cancelled()) return;
    if (flags.audio_session_steuern) setAudioSessionType('play-and-record');
    try {
      setPhase('listening');
      await recorder.start({
        keepMicOpen: flags.mikro_offen_halten,
        maxMs: flags.max_aufnahme_s * 1000,
        silenceMs: (mode === 'antwort_pruefen' ? flags.stille_autostopp_antwort_s : flags.stille_autostopp_s) * 1000,
        noSpeechMs: 8000,
        speechThreshold: flags.sprach_schwelle ?? 0.02,
        onLevel: setLevel,
        onAutoStop: finishRecording,
      });
    } catch (e) {
      const error = `Mikrofon: ${(e as Error).message}`;
      setRecordMode(null);
      setPhase('error');
      setMetrics({ action: mode, error });
      logger.add({ aufgabe_nr: task.nr, aktion: mode, fehler: error });
    }
  }

  async function replay() {
    unlockAudio();
    if (!queue.canReplay) return;
    logger.add({ aufgabe_nr: task.nr, aktion: 'nochmal' });
    await queue.replay(() => setPhase('speaking'));
    setPhase('idle');
  }

  function cancel() {
    unlockAudio();
    stopEverything();
    setPhase('idle');
  }
  cancelRef.current = cancel;

  const prev = taskIndex > 0 ? test.aufgaben[taskIndex - 1] : null;
  const next = taskIndex < test.aufgaben.length - 1 ? test.aufgaben[taskIndex + 1] : null;
  // In RTL the previous task sits on the right, so its arrow points right.
  const [prevArrow, nextArrow] = language.rtl ? ['▶', '◀'] : ['◀', '▶'];

  return (
    <main class="task">
      <HiddenCorner onTrigger={onExit} />
      {!online && (
        <div class="offline-badge" aria-label="offline">
          📶✕
        </div>
      )}
      <nav class="task-nav">
        <button
          class="nav-button"
          style={{ visibility: prev ? 'visible' : 'hidden' }}
          disabled={listening}
          onClick={() => goTo(taskIndex - 1)}
        >
          <span>{prevArrow}</span>
          <span dir="ltr">{prev?.nr}</span>
        </button>
        <StatusOrb phase={phase} level={level} onTap={phase === 'idle' ? undefined : cancel} />
        <button
          class="nav-button"
          style={{ visibility: next ? 'visible' : 'hidden' }}
          disabled={listening}
          onClick={() => goTo(taskIndex + 1)}
        >
          <span dir="ltr">{next?.nr}</span>
          <span>{nextArrow}</span>
        </button>
      </nav>

      <div class="task-number" dir="ltr">
        {task.nr}
      </div>

      <div class="actions">
        <button
          class={`action action-explain ${!explained.has(taskIndex) && phase === 'idle' ? 'invite' : ''}`}
          onClick={explain}
          disabled={busy || listening}
          aria-label="Aufgabe erklären"
        >
          <span class="action-icon">🔊</span>
        </button>
        <button
          class={`action action-ask ${recordMode === 'frage' ? 'recording' : ''}`}
          onClick={() => toggleRecording('frage')}
          disabled={busy || recordMode === 'antwort_pruefen'}
          aria-label="Frage stellen"
        >
          <span class="action-icon">{recordMode === 'frage' ? '⏹' : '🎤'}</span>
        </button>
        <button
          class="action action-replay"
          onClick={replay}
          disabled={busy || listening || !canReplay}
          aria-label="Nochmal hören"
        >
          <span class="action-icon">🔁</span>
        </button>
        <button
          class={`action action-check ${recordMode === 'antwort_pruefen' ? 'recording' : ''}`}
          onClick={() => toggleRecording('antwort_pruefen')}
          disabled={busy || recordMode === 'frage'}
          aria-label="Meine Antwort prüfen"
        >
          <span class="action-icon">{recordMode === 'antwort_pruefen' ? '⏹' : '✅'}</span>
        </button>
      </div>

      {flags.debug_anzeigen && (
        <>
          <p class="muted debug-caption" dir="ltr">
            {language.name_de} · {test.titel} · Aufgabe {task.nr}: {task.text} · Sitzung {logger.log.session_id} (
            {logger.log.pseudonym})
          </p>
          <DebugPanel metrics={metrics} liveText={liveText} />
        </>
      )}
    </main>
  );
}
