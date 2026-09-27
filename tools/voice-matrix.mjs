#!/usr/bin/env node
// Voice matrix: renders test sentences for each language × TTS model as MP3, transcribes them back
// with an STT model (rough intelligibility check) and writes tools/out/voice-matrix/matrix.html for
// native speakers to listen to and rate.
//
//   OPENROUTER_API_KEY=sk-or-… node tools/voice-matrix.mjs
//   … --langs ar,ti,so --models google/gemini-3.8-flash-tts,x-ai/grok-voice-tts-1.0 --stt none
//   … --stt-hint off   (STT without language hint; hints can make STT drop German words)
//
// New results are merged into results.json, so single models/languages can be re-run.
//
// The sentence translations were written without native-speaker review. Check them as well!

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://openrouter.ai/api/v1';
const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) {
  console.error('OPENROUTER_API_KEY fehlt.');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);

const DEFAULT_MODELS = ['google/gemini-3.8-flash-tts', 'google/gemini-3.8-flash-lite-tts', 'x-ai/grok-voice-tts-1.0'];
const VOICES = { 'google/gemini-3.8-flash-tts': 'Kore', 'google/gemini-3.8-flash-lite-tts': 'Kore', 'x-ai/grok-voice-tts-1.0': 'eve' };
const STT_MODEL = args.stt ?? 'google/gemini-3.5-transcribe';
const STT_HINT = args['stt-hint'] !== 'off';

// Sentences (German): "Hallo! Ich helfe dir bei der Aufgabe." / "Hier schreibst du deinen Vornamen." /
// "Das deutsche Wort ist: Vorname." (the last one tests German words spoken by a foreign-language voice)
const LANGS = [
  { id: 'ar', iso: 'ar', name: 'Arabisch', text: 'مرحبا! أنا أساعدك في هذه المهمة. هنا تكتب اسمك الأول. الكلمة الألمانية هي: Vorname.' },
  { id: 'prs', iso: 'fa', name: 'Dari', text: 'سلام! من در این کار کمکت می‌کنم. اینجا نام خود را بنویس. کلمهٔ آلمانی این است: Vorname.' },
  { id: 'fa', iso: 'fa', name: 'Farsi', text: 'سلام! من در این تمرین کمکت می‌کنم. اینجا اسم کوچکت را بنویس. کلمهٔ آلمانی این است: Vorname.' },
  { id: 'ps', iso: 'ps', name: 'Paschto', text: 'سلام! زه په دې دنده کې ستا مرسته کوم. دلته خپل نوم ولیکه. آلماني کلمه دا ده: Vorname.' },
  { id: 'ti', iso: 'ti', name: 'Tigrinya', text: 'ሰላም! ነዚ ዕዮ ክሕግዘካ እየ። ኣብዚ ስምካ ጸሓፍ። እቲ ናይ ጀርመን ቃል: Vorname እዩ።' },
  { id: 'kmr', iso: 'ku', name: 'Kurmandschi', text: 'Silav! Ez ê di vî karî de alîkariya te bikim. Li vir navê xwe binivîse. Peyva almanî ev e: Vorname.' },
  { id: 'ckb', iso: null, name: 'Sorani', text: 'سڵاو! من لەم ئەرکەدا یارمەتیت دەدەم. لێرە ناوی خۆت بنووسە. وشە ئەڵمانییەکە ئەمەیە: Vorname.' },
  { id: 'so', iso: 'so', name: 'Somali', text: 'Salaan! Waxaan kaa caawinayaa hawshan. Halkan ku qor magacaaga koowaad. Erayga Jarmalka ah waa: Vorname.' },
  { id: 'tr', iso: 'tr', name: 'Türkisch', text: 'Merhaba! Bu görevde sana yardım ediyorum. Buraya adını yaz. Almanca kelime şu: Vorname.' },
  { id: 'uk', iso: 'uk', name: 'Ukrainisch', text: 'Привіт! Я допоможу тобі із завданням. Тут напиши своє ім’я. Німецьке слово: Vorname.' },
  { id: 'ru', iso: 'ru', name: 'Russisch', text: 'Привет! Я помогу тебе с заданием. Здесь напиши своё имя. Немецкое слово: Vorname.' },
  { id: 'sq', iso: 'sq', name: 'Albanisch', text: 'Përshëndetje! Unë të ndihmoj me detyrën. Këtu shkruaj emrin tënd. Fjala gjermane është: Vorname.' },
  { id: 'ro', iso: 'ro', name: 'Rumänisch', text: 'Bună! Te ajut cu sarcina. Aici scrii prenumele tău. Cuvântul german este: Vorname.' },
  { id: 'en', iso: 'en', name: 'Englisch', text: 'Hello! I will help you with the task. Write your first name here. The German word is: Vorname.' },
  { id: 'fr', iso: 'fr', name: 'Französisch', text: 'Bonjour ! Je t’aide avec l’exercice. Ici, tu écris ton prénom. Le mot allemand est : Vorname.' },
];

const auth = { Authorization: `Bearer ${KEY}`, 'X-Title': 'Lernhilfe DaZ voice-matrix' };
const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out', 'voice-matrix');
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function errorText(res) {
  try {
    return (await res.json())?.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

function speechRequest(model, voice, input, format) {
  return fetch(`${API}/audio/speech`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input, response_format: format, ...(voice ? { voice } : {}) }),
  });
}

// 16-bit LE mono PCM → WAV (Gemini TTS only delivers pcm).
function pcmToWav(pcm, rate) {
  const data = pcm.subarray(0, pcm.length - (pcm.length % 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function tts(model, voice, input) {
  const t0 = Date.now();
  let format = 'mp3';
  let res = await speechRequest(model, voice, input, format);
  if (res.status === 400) {
    const message = await res.clone().text();
    if (/pcm/i.test(message)) {
      format = 'pcm';
      res = await speechRequest(model, voice, input, format);
    }
  }
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await errorText(res)}`);
  let audio = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type');
  if (format === 'pcm') {
    const rate = Number(contentType?.match(/(?:sample_)?rate=(\d+)/i)?.[1] ?? 24000);
    audio = pcmToWav(audio, rate);
  }
  return {
    audio,
    ext: format === 'pcm' ? 'wav' : 'mp3',
    contentType,
    ms: Date.now() - t0,
    generationId: res.headers.get('x-generation-id'),
  };
}

async function stt(audio, ext, iso) {
  const t0 = Date.now();
  const res = await fetch(`${API}/audio/transcriptions`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: STT_MODEL,
      input_audio: { data: audio.toString('base64'), format: ext },
      ...(iso && STT_HINT ? { language: iso } : {}),
    }),
  });
  if (!res.ok) throw new Error(`STT ${res.status}: ${await errorText(res)}`);
  const body = await res.json();
  return { text: body.text ?? '', ms: Date.now() - t0, cost: body.usage?.cost };
}

async function generationCost(id) {
  if (!id) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}/generation?id=${encodeURIComponent(id)}`, { headers: auth });
    if (res.ok) return (await res.json()).data?.total_cost ?? null;
    await sleep(1500);
  }
  return null;
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

const models = args.models ? args.models.split(',') : DEFAULT_MODELS;
const langs = args.langs ? LANGS.filter((l) => args.langs.split(',').includes(l.id)) : LANGS;

// Fallback voice: first entry of supported_voices from the model list.
const speechModels = await fetch(`${API}/models?output_modalities=speech`).then((r) => r.json());
const voiceFor = (m) => VOICES[m] ?? speechModels.data?.find((x) => x.id === m)?.supported_voices?.[0];

await mkdir(outDir, { recursive: true });
const resultsFile = join(outDir, 'results.json');
let previous = [];
try {
  previous = JSON.parse(await readFile(resultsFile, 'utf8'));
} catch {
  // first run
}
const results = [];
const jobs = langs.flatMap((lang) => models.map((model) => ({ lang, model })));
console.log(`${jobs.length} Kombinationen, STT-Rückprüfung: ${STT_MODEL}`);

await pool(jobs, 4, async ({ lang, model }) => {
  const row = { lang: lang.id, model, voice: voiceFor(model) };
  try {
    const r = await tts(model, row.voice, lang.text);
    row.file = `${lang.id}__${slug(model)}.${r.ext}`;
    row.contentType = r.contentType;
    row.ttsMs = r.ms;
    row.generationId = r.generationId;
    await writeFile(join(outDir, row.file), r.audio);
    if (STT_MODEL !== 'none') {
      row.stt = `${STT_MODEL}${STT_HINT ? '' : ' (ohne Sprachhinweis)'}`;
      try {
        const back = await stt(r.audio, r.ext, lang.iso);
        row.backText = back.text;
        row.sttMs = back.ms;
      } catch (e) {
        row.backText = `⚠ ${e.message}`;
      }
    }
  } catch (e) {
    row.error = e.message;
  }
  console.log(`${row.error ? '✗' : '✓'} ${lang.id.padEnd(4)} ${model}${row.error ? ' – ' + row.error : ` (${row.ttsMs} ms)`}`);
  results.push(row);
});

console.log('Lade TTS-Kosten über /generation …');
await sleep(2000);
await pool(results.filter((r) => r.generationId), 4, async (r) => (r.ttsCost = await generationCost(r.generationId)));

// Merge: this run replaces earlier rows for the same language × model.
const all = [...previous.filter((p) => !results.some((r) => r.lang === p.lang && r.model === p.model)), ...results];
await writeFile(resultsFile, JSON.stringify(all, null, 2));
const allModels = [...new Set(all.map((r) => r.model))];
const allLangs = LANGS.filter((l) => all.some((r) => r.lang === l.id));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cell = (lang, model) => {
  const r = all.find((x) => x.lang === lang.id && x.model === model);
  if (!r || r.error) return `<td class="err">${esc(r?.error ?? 'fehlt')}</td>`;
  const cost = r.ttsCost == null ? '' : ` · $${r.ttsCost.toFixed(5)}`;
  return `<td><audio controls preload="none" src="${esc(r.file)}"></audio>
    <div class="meta">${r.ttsMs} ms${cost} · Stimme ${esc(r.voice ?? '–')}</div>
    ${r.backText != null ? `<div class="back" dir="auto" title="${esc(r.stt)}">↩ ${esc(r.backText)}</div>` : ''}
    <div class="rate">Note: ☐1 ☐2 ☐3</div></td>`;
};

const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Sprachenmatrix</title>
<style>body{font-family:system-ui;margin:20px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;vertical-align:top;max-width:340px}
th{background:#f4f1ea;position:sticky;top:0}.src{font-size:1.05rem}.meta{color:#666;font-size:.8rem}.back{font-size:.9rem;margin-top:4px;color:#1f4e8c}
.err{color:#b3261e;font-size:.85rem}.rate{margin-top:6px;color:#999}audio{width:280px}</style>
<h1>Sprachenmatrix (${new Date().toLocaleString('de-DE')})</h1>
<p>Blau (↩) = Rück-Transkription (STT-Modell im Tooltip): ein grober Hinweis, ob die Aussprache verständlich ist. Note: 1 = gut verständlich, 2 = mit Mühe, 3 = unbrauchbar.</p>
<table><tr><th>Sprache / Text</th>${allModels.map((m) => `<th>${esc(m)}</th>`).join('')}</tr>
${allLangs.map((l) => `<tr><td><b>${esc(l.name)}</b><div class="src" dir="auto">${esc(l.text)}</div></td>${allModels.map((m) => cell(l, m)).join('')}</tr>`).join('\n')}
</table></html>`;
await writeFile(join(outDir, 'matrix.html'), html);
console.log(`Fertig: ${join(outDir, 'matrix.html')}`);
