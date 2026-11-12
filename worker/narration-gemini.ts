// Narração pelo TTS do Gemini (vozes pt-BR comerciais), alternativa ao ElevenLabs.
// Ligada com NARRATION_PROVIDER=gemini. O Gemini não devolve o tempo de cada
// palavra: medimos as pausas reais do áudio (ffmpeg silencedetect) e ancoramos o
// fim de cada frase nelas; dentro da frase, dividimos pelo tamanho das palavras.
// Sem pausa medida, caímos na estimativa pela pontuação.
import { GoogleGenAI } from '@google/genai';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './exec';
import type { Narration } from './narration';

type Env = Record<string, string | undefined>;

const DEFAULT_MODEL = 'gemini-3.8-flash-tts';
// Voz feminina de locução comercial do Brasil (catálogo pt-BR do Gemini).
const DEFAULT_VOICE = 'pt-br-commercial-2';
const STYLE = 'animado e confiante, ritmo de anúncio para redes sociais';
const SENTENCE_PAUSE = 0.35;
const CLAUSE_PAUSE = 0.18;
// Pausas nunca passam de 30% do áudio, mesmo com muita pontuação.
const MAX_PAUSE_SHARE = 0.3;

export function narrationProvider(env: Env = process.env): 'gemini' | 'elevenlabs' {
  return env.NARRATION_PROVIDER === 'elevenlabs' ? 'elevenlabs' : 'gemini';
}

export function estimateWords(text: string, duration: number): Narration['words'] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const pauses = tokens.map((w, i): number => {
    if (i === tokens.length - 1) return 0;
    if (/[.!?…]$/.test(w)) return SENTENCE_PAUSE;
    return /[,;:]$/.test(w) ? CLAUSE_PAUSE : 0;
  });
  const rawPause = pauses.reduce((a, b) => a + b, 0);
  const scale = rawPause > duration * MAX_PAUSE_SHARE ? (duration * MAX_PAUSE_SHARE) / rawPause : 1;
  const weights = tokens.map((w) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const speech = duration - rawPause * scale;

  let t = 0;
  return tokens.map((word, i) => {
    const start = t;
    const end = start + (speech * weights[i]) / totalWeight;
    t = end + pauses[i] * scale;
    return { word, start, end };
  });
}

type Span = { start: number; end: number };
// Pausa que vale como fim de frase: silêncio de pelo menos 0,22s abaixo de -38 dB.
const SILENCE_FILTER = 'silencedetect=noise=-38dB:d=0.22';
// Distância máxima (fração da fala) entre a pausa medida e a pontuação estimada.
const MAX_MATCH = 0.15;

/** Lê `silence_start`/`silence_end` do stderr do ffmpeg; silêncio aberto no fim vai até `duration`. */
export function parseSilences(stderr: string, duration: number): Span[] {
  const out: Span[] = [];
  let open: number | null = null;
  for (const line of stderr.split('\n')) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) { open = Math.max(0, Number(s[1])); continue; }
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && open !== null) { out.push({ start: open, end: Number(e[1]) }); open = null; }
  }
  if (open !== null && open < duration) out.push({ start: open, end: duration });
  return out;
}

const weightOf = (w: string) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length);

/**
 * Alinha as palavras às pausas reais: cada pausa medida é casada (em ordem) com a
 * pontuação mais próxima na proporção da fala; a frase termina no início da pausa e a
 * próxima começa no fim dela. Pausas sem pontuação por perto são ignoradas.
 */
export function alignToPauses(text: string, duration: number, silences: Span[]): Narration['words'] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const edge = 0.05;
  const lead = silences.find((s) => s.start <= edge);
  const tail = silences.find((s) => s.end >= duration - edge && s.start > edge);
  const t0 = lead ? lead.end : 0;
  const t1 = tail ? tail.start : duration;
  const gaps = silences.filter((s) => s.start > t0 + edge && s.end < t1 - edge);
  if (tokens.length === 0 || gaps.length === 0) return estimateWords(text, duration);

  const weights = tokens.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  // Pontos de corte possíveis: depois de palavra com pontuação (exceto a última).
  const cuts: { idx: number; frac: number }[] = [];
  let acc = 0;
  tokens.forEach((w, i) => {
    acc += weights[i];
    if (i < tokens.length - 1 && /[.!?…,;:]$/.test(w)) cuts.push({ idx: i, frac: acc / total });
  });
  const speech = t1 - t0 - gaps.reduce((a, g) => a + (g.end - g.start), 0);
  let before = 0, prevEnd = t0;
  const gapFrac = gaps.map((g) => { before += g.start - prevEnd; prevEnd = g.end; return before / speech; });

  // Casamento monótono pausa↔pontuação de menor custo (programação dinâmica).
  const G = gaps.length, P = cuts.length;
  const cost: number[][] = Array.from({ length: G + 1 }, () => Array(P + 1).fill(Infinity));
  const move: number[][] = Array.from({ length: G + 1 }, () => Array(P + 1).fill(0));
  for (let j = 0; j <= P; j++) cost[0][j] = 0;
  for (let i = 1; i <= G; i++) {
    cost[i][0] = cost[i - 1][0] + MAX_MATCH;
    for (let j = 1; j <= P; j++) {
      const d = Math.abs(gapFrac[i - 1] - cuts[j - 1].frac);
      const opts = [cost[i - 1][j] + MAX_MATCH, cost[i][j - 1], d < MAX_MATCH ? cost[i - 1][j - 1] + d : Infinity];
      const k = opts.indexOf(Math.min(...opts));
      cost[i][j] = opts[k]; move[i][j] = k;
    }
  }
  const anchors: { idx: number; gap: Span }[] = [];
  for (let i = G, j = P; i > 0 && j > 0;) {
    const k = move[i][j];
    if (k === 2) { anchors.unshift({ idx: cuts[j - 1].idx, gap: gaps[i - 1] }); i--; j--; }
    else if (k === 0) i--;
    else j--;
  }
  if (anchors.length === 0) return estimateWords(text, duration);

  const out: Narration['words'] = [];
  let from = 0, start = t0;
  for (const seg of [...anchors, { idx: tokens.length - 1, gap: { start: t1, end: t1 } }]) {
    const span = seg.gap.start - start;
    const w = weights.slice(from, seg.idx + 1);
    const sum = w.reduce((a, b) => a + b, 0);
    let t = start;
    w.forEach((wt, k) => {
      const end = k === w.length - 1 ? seg.gap.start : t + (span * wt) / sum;
      out.push({ word: tokens[from + k], start: t, end });
      t = end;
    });
    from = seg.idx + 1; start = seg.gap.end;
  }
  return out;
}

export interface GeminiTtsDeps {
  /** Texto → WAV (24 kHz mono). */
  tts(text: string): Promise<Buffer>;
  /** WAV → MP3 sem silêncio nas pontas, com a duração final e as pausas medidas (segundos). */
  encode(wav: Buffer): Promise<{ audio: Buffer; duration: number; silences?: Span[] }>;
}

export const defaultGeminiTtsDeps: GeminiTtsDeps = {
  async tts(text) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no ambiente (.env.local)');
    const client = new GoogleGenAI({ apiKey });
    const r = await client.interactions.create({
      model: process.env.GEMINI_TTS_MODEL || DEFAULT_MODEL,
      input: [{
        type: 'user_input',
        content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: STYLE }] }],
      }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: process.env.GEMINI_TTS_VOICE || DEFAULT_VOICE }] },
    });
    return Buffer.from(r.output_audio?.data ?? '', 'base64');
  },
  async encode(wav) {
    const dir = await mkdtemp(join(tmpdir(), 'tts-'));
    try {
      const src = join(dir, 'in.wav');
      const out = join(dir, 'out.mp3');
      await writeFile(src, wav);
      const trim = 'silenceremove=start_periods=1:start_threshold=-45dB';
      const r = await runCommand('ffmpeg', [
        '-y', '-i', src, '-af', `${trim},areverse,${trim},areverse`,
        '-ar', '44100', '-b:a', '128k', out,
      ], { timeoutMs: 60 * 1000 });
      if (r.code !== 0) throw new Error(`Conversão da narração falhou: ${r.stderr.slice(-400)}`);
      const p = await runCommand('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', out,
      ], { timeoutMs: 30 * 1000 });
      const duration = Number(p.stdout.trim());
      if (!(duration > 0)) throw new Error('Não consegui medir a duração da narração');
      // Pausas reais para sincronizar as cenas; se falhar, segue com a estimativa.
      const sd = await runCommand('ffmpeg', ['-i', out, '-af', SILENCE_FILTER, '-f', 'null', '-'], { timeoutMs: 60 * 1000 });
      const silences = sd.code === 0 ? parseSilences(sd.stderr, duration) : [];
      return { audio: await readFile(out), duration, silences };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};

export async function synthesizeGemini(
  text: string, deps: GeminiTtsDeps = defaultGeminiTtsDeps,
): Promise<Narration> {
  const wav = await deps.tts(text);
  if (wav.length === 0) throw new Error('Gemini TTS respondeu sem áudio');
  const { audio, duration, silences } = await deps.encode(wav);
  const words = silences?.length ? alignToPauses(text, duration, silences) : estimateWords(text, duration);
  return { audio, text, duration, words };
}
