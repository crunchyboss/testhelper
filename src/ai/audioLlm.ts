// Pipeline mode "audio-llm": the recording goes straight to an audio-capable chat model, which
// first writes a transcript line and then answers. Saves the STT stage and may cope better with
// rare languages and mixed speech (mother tongue + German words/letters).

export const AUDIO_SYSTEM_ADDON = `
AUDIO-NACHRICHT
Die Nachricht der Person ist eine Audioaufnahme. Schreib zuerst genau eine Zeile:
TRANSKRIPT: <wörtlich, was die Person gesagt hat, in der gesprochenen Sprache und Schrift>
Dann eine neue Zeile und danach deine Antwort wie oben beschrieben. Die Transkript-Zeile wird nicht vorgelesen.`;

export const AUDIO_INSTRUCTION = 'Das ist die Audioaufnahme der Person. Erst TRANSKRIPT-Zeile, dann deine Antwort.';

const HEADER = /^\s*TRANSKRIPT\s*:\s*/i;

/**
 * Splits the streamed output into the first "TRANSKRIPT: …" line and the spoken answer.
 * push() returns the part of each delta that belongs to the answer.
 */
export class TranscriptHeaderParser {
  transcript = '';
  private head = '';
  private done = false;

  push(delta: string): string {
    if (this.done) return delta;
    this.head += delta;
    const newline = this.head.indexOf('\n');
    if (newline < 0) {
      // No newline yet: keep buffering while it still looks like a transcript header.
      const probe = this.head.trimStart();
      if (probe.length < 11 ? 'TRANSKRIPT:'.startsWith(probe.toUpperCase()) : HEADER.test(probe)) return '';
      this.done = true;
      return this.head;
    }
    this.done = true;
    const first = this.head.slice(0, newline);
    const rest = this.head.slice(newline + 1);
    if (HEADER.test(first)) {
      this.transcript = first.replace(HEADER, '').trim();
      return rest;
    }
    return this.head;
  }

  /** End of stream without newline: a lone header line means there was no answer. */
  flush(): string {
    if (this.done) return '';
    this.done = true;
    if (HEADER.test(this.head)) {
      this.transcript = this.head.replace(HEADER, '').trim();
      return '';
    }
    return this.head;
  }
}
