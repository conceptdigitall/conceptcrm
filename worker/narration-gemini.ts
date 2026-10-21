// Narração pelo TTS do Gemini (vozes pt-BR comerciais), alternativa ao ElevenLabs.
// Ligada com NARRATION_PROVIDER=gemini. O Gemini não devolve o tempo de cada
// palavra: estimamos pelo tamanho das palavras e pelas pausas da pontuação.
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
  return env.NARRATION_PROVIDER === 'gemini' ? 'gemini' : 'elevenlabs';
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

export interface GeminiTtsDeps {
  /** Texto → WAV (24 kHz mono). */
  tts(text: string): Promise<Buffer>;
  /** WAV → MP3 sem silêncio nas pontas, com a duração final em segundos. */
  encode(wav: Buffer): Promise<{ audio: Buffer; duration: number }>;
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
      return { audio: await readFile(out), duration };
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
  const { audio, duration } = await deps.encode(wav);
  return { audio, text, duration, words: estimateWords(text, duration) };
}
