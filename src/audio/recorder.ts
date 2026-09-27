import { audioContext } from './context';
import { speechBounds, speechThreshold } from './vad';
import { concatFloat32, downsample, encodeWav } from './wav';

const TARGET_RATE = 16000;

export interface RecordOptions {
  /** Keep the mic stream open between recordings (fewer permission prompts, but iOS may lower playback volume). */
  keepMicOpen: boolean;
  maxMs: number;
  /** Auto-stop after this much silence following speech; 0 disables. */
  silenceMs: number;
  /** Auto-stop if nothing is said at all for this long. */
  noSpeechMs: number;
  /** Minimum RMS for speech; raised automatically in noisy rooms. */
  speechThreshold: number;
  onLevel?: (level: number) => void;
  onAutoStop?: () => void;
}

export interface Recording {
  wav: Blob;
  /** Duration after trimming silence. */
  durationMs: number;
  heardSpeech: boolean;
}

/** Blocks of padding kept around speech when trimming (≈ 0.3 s at 48 kHz, 2048 samples per block). */
const TRIM_PAD_BLOCKS = 7;

let workletReady: Promise<void> | null = null;

function ensureWorklet(ctx: AudioContext): Promise<void> {
  if (!workletReady) {
    workletReady = ctx.audioWorklet
      .addModule(new URL('worklets/recorder-processor.js', document.baseURI).href)
      .catch((e) => {
        workletReady = null;
        throw e;
      });
  }
  return workletReady;
}

/**
 * Records via AudioWorklet and produces 16 kHz mono WAV. Deliberately not MediaRecorder:
 * Safari would give audio/mp4 (AAC), which STT providers do not all accept.
 */
export class Recorder {
  private stream: MediaStream | null = null;
  private nodes: AudioNode[] = [];
  private chunks: Float32Array[] = [];
  private levels: number[] = [];
  private noiseFloor: number | null = null;
  private opts: RecordOptions | null = null;
  private recording = false;
  private startedAt = 0;
  private lastSpeechAt = 0;
  private heardSpeech = false;
  private autoStopFired = false;

  get isRecording() {
    return this.recording;
  }

  async start(opts: RecordOptions): Promise<void> {
    const ctx = audioContext();
    await ensureWorklet(ctx);
    if (!this.stream?.active) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    }
    this.opts = opts;
    this.chunks = [];
    this.levels = [];
    this.noiseFloor = null;
    this.heardSpeech = false;
    this.autoStopFired = false;
    this.startedAt = this.lastSpeechAt = performance.now();

    const source = ctx.createMediaStreamSource(this.stream);
    const worklet = new AudioWorkletNode(ctx, 'recorder-processor');
    // The worklet must be pulled by the graph to run, so route it into a muted sink.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    worklet.port.onmessage = (e: MessageEvent<Float32Array>) => this.onBlock(e.data);
    source.connect(worklet);
    worklet.connect(sink);
    sink.connect(ctx.destination);
    this.nodes = [source, worklet, sink];
    this.recording = true;
  }

  /** Returns null if not recording (e.g. auto-stop and manual stop raced). */
  stop(): Recording | null {
    if (!this.recording) return null;
    this.teardown();
    const rate = audioContext().sampleRate;
    // Send only the part with speech: shorter upload, faster and cheaper STT.
    const bounds = speechBounds(this.levels, speechThreshold(this.noiseFloor, this.opts!.speechThreshold), TRIM_PAD_BLOCKS);
    const kept = bounds ? this.chunks.slice(bounds[0], bounds[1]) : this.chunks;
    const samples = downsample(concatFloat32(kept), rate, TARGET_RATE);
    this.chunks = [];
    this.levels = [];
    return {
      wav: new Blob([encodeWav(samples, TARGET_RATE)], { type: 'audio/wav' }),
      durationMs: Math.round((samples.length / TARGET_RATE) * 1000),
      heardSpeech: this.heardSpeech,
    };
  }

  cancel(): void {
    if (this.recording) this.teardown();
    this.chunks = [];
  }

  /** Stops the mic tracks (removes the iOS recording indicator and play-and-record mode). */
  release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private teardown() {
    this.recording = false;
    this.nodes.forEach((n) => n.disconnect());
    this.nodes = [];
    if (!this.opts?.keepMicOpen) this.release();
  }

  private onBlock(block: Float32Array) {
    if (!this.recording || !this.opts) return;
    this.chunks.push(block);

    let sum = 0;
    for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    const rms = Math.sqrt(sum / block.length);
    this.levels.push(rms);
    this.noiseFloor = this.noiseFloor == null ? rms : Math.min(this.noiseFloor, rms);
    this.opts.onLevel?.(Math.min(1, rms * 8));

    const now = performance.now();
    if (rms > speechThreshold(this.noiseFloor, this.opts.speechThreshold)) {
      this.heardSpeech = true;
      this.lastSpeechAt = now;
    }
    const silenceDone = this.opts.silenceMs > 0 && this.heardSpeech && now - this.lastSpeechAt > this.opts.silenceMs;
    const nothingSaid = !this.heardSpeech && now - this.startedAt > this.opts.noSpeechMs;
    const tooLong = now - this.startedAt > this.opts.maxMs;
    if ((silenceDone || nothingSaid || tooLong) && !this.autoStopFired) {
      this.autoStopFired = true;
      this.opts.onAutoStop?.();
    }
  }
}
