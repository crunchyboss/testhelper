// Sentence terminators incl. Arabic/Urdu-style question mark and full stop, Ethiopic full stop (Tigrinya).
const TERMINATORS = new Set(['.', '!', '?', '…', '؟', '۔', '።', '\n']);
const CLOSERS = new Set(['"', "'", '»', '«', '”', '“', ')', '」']);
const MIN_SENTENCE_CHARS = 8;

/**
 * Splits a token stream into speakable sentences as early as possible, so TTS for the
 * first sentence can start while the LLM is still generating.
 * A terminator only counts when followed by whitespace (avoids "3.5", "z.B."),
 * except a newline, which always ends a sentence.
 */
export class SentenceSplitter {
  private buffer = '';
  private pending = '';

  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (!TERMINATORS.has(ch)) continue;
      let end = i + 1;
      while (end < this.buffer.length && (CLOSERS.has(this.buffer[end]) || TERMINATORS.has(this.buffer[end]))) end++;
      if (ch !== '\n') {
        if (end >= this.buffer.length) break; // need the next char to decide
        if (!/\s/.test(this.buffer[end])) continue;
      }
      this.emit(this.buffer.slice(start, end), out);
      start = end;
      i = end - 1;
    }
    this.buffer = this.buffer.slice(start);
    return out;
  }

  flush(): string[] {
    const out: string[] = [];
    const rest = [this.pending, this.buffer.trim()].filter(Boolean).join(' ');
    if (rest) out.push(rest);
    this.buffer = '';
    this.pending = '';
    return out;
  }

  private emit(raw: string, out: string[]) {
    const sentence = (this.pending ? this.pending + ' ' : '') + raw.trim();
    if (!raw.trim()) return;
    // Very short fragments ("Ja.", "1.") are merged into the next sentence.
    if (sentence.length < MIN_SENTENCE_CHARS) {
      this.pending = sentence;
      return;
    }
    this.pending = '';
    out.push(sentence);
  }
}

/** Removes markdown/formatting characters that TTS would read out loud. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/[*_#`~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
