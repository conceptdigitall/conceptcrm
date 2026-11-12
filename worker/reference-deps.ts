// Dependências reais da análise de referências: yt-dlp (link), Storage
// (upload do João), ffprobe (duração) e Gemini (análise do vídeo).
import { GoogleGenAI, Type, createPartFromUri, createUserContent } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { runCommand } from './exec';
import { REFERENCE_UPLOAD_MAX_BYTES } from '@/lib/marketing/references';
import { GeminiQuotaError, type ReferenceDeps } from './references';

const BUCKET = 'marketing';
const DEFAULT_MODEL = 'gemini-3.5-flash';
const PROBE_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 3 * 60_000;
const FFPROBE_TIMEOUT_MS = 30_000;
const GENERATE_TIMEOUT_MS = 120_000;
const ACTIVE_POLL_MS = 2_000;
const ACTIVE_MAX_WAIT_MS = 60_000;

function validDuration(n: number): number {
  if (!Number.isFinite(n) || n < 0) throw new Error('duração inválida');
  return n;
}

export function parseYtDlpDuration(json: string): number {
  const info = JSON.parse(json) as { duration?: unknown };
  if (typeof info.duration !== 'number') throw new Error('yt-dlp não informou a duração');
  return validDuration(info.duration);
}

/** Saída do `ffprobe -show_entries format=duration` (um número por linha). */
export function parseDuration(stdout: string): number {
  const text = stdout.trim();
  if (!text) throw new Error('ffprobe não informou a duração');
  return validDuration(Number(text));
}

export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: unknown; message?: unknown };
  if (e.status === 429) return true;
  return typeof e.message === 'string' && e.message.includes('RESOURCE_EXHAUSTED');
}

const STR = { type: Type.STRING };
const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    gancho: {
      type: Type.OBJECT,
      properties: {
        tipo: { type: Type.STRING, enum: ['curiosidade', 'dor', 'prova', 'conflito'] },
        frase: STR,
        primeiroQuadro: STR,
      },
      required: ['tipo', 'frase', 'primeiroQuadro'],
    },
    duracaoSeg: { type: Type.NUMBER },
    cortesPorMinuto: { type: Type.NUMBER },
    formato: { type: Type.STRING, enum: ['pessoa_falando', 'tela', 'texto_animado', 'bastidor', 'misto'] },
    tema: STR,
    promessa: STR,
    entrega: STR,
    cta: STR,
    porQueViralizou: { type: Type.ARRAY, items: STR, minItems: '3', maxItems: '3' },
    comoAdaptar: STR,
  },
  required: [
    'gancho', 'duracaoSeg', 'cortesPorMinuto', 'formato', 'tema',
    'promessa', 'entrega', 'cta', 'porQueViralizou', 'comoAdaptar',
  ],
};

// Só os extratores do Instagram e do TikTok (vm.tiktok cobre vm./vt.tiktok.com);
// sem isso o extrator genérico seguiria redirecionamentos para qualquer host.
const YT_DLP_EXTRACTORS = 'Instagram,TikTok,vm.tiktok';
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm', '.mov', '.m4v'];

/** Argumentos do yt-dlp: sem config local, só extratores permitidos e URL após `--`. */
export function ytDlpArgs(extra: string[], url: string): string[] {
  return ['--ignore-config', '--no-playlist', '--use-extractors', YT_DLP_EXTRACTORS, ...extra, '--', url];
}

/** Opções extras só do download (não do probe): formato, saída e teto de tamanho. */
export function ytDlpDownloadArgs(dir: string): string[] {
  return ['-f', 'mp4/best[height<=720]', '--max-filesize', '200M', '-o', join(dir, 'video.%(ext)s')];
}

const VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
};

/** Tipo MIME que o Gemini recebe, pela extensão do arquivo (padrão video/mp4). */
export function mimeTypeForVideo(path: string): string {
  return VIDEO_MIME[extname(path).toLowerCase()] ?? 'video/mp4';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function probeFile(path: string): Promise<number> {
  const r = await runCommand('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path,
  ], { timeoutMs: FFPROBE_TIMEOUT_MS });
  if (r.code !== 0) throw new Error(`ffprobe falhou: ${r.stderr.slice(-200)}`);
  return parseDuration(r.stdout);
}

async function analyzeWithGemini(videoPath: string, prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no ambiente');
  const ai = new GoogleGenAI({ apiKey });
  let remote: string | undefined;
  try {
    let file = await ai.files.upload({ file: videoPath, config: { mimeType: mimeTypeForVideo(videoPath) } });
    remote = file.name;
    const deadline = Date.now() + ACTIVE_MAX_WAIT_MS;
    while (file.state !== 'ACTIVE') {
      if (file.state === 'FAILED') throw new Error('Gemini não conseguiu processar o vídeo');
      if (Date.now() > deadline) throw new Error('Gemini demorou demais para processar o vídeo');
      await sleep(ACTIVE_POLL_MS);
      file = await ai.files.get({ name: file.name! });
    }
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_VIDEO_MODEL || DEFAULT_MODEL,
      contents: createUserContent([createPartFromUri(file.uri!, file.mimeType!), prompt]),
      config: {
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_SCHEMA,
        httpOptions: { timeout: GENERATE_TIMEOUT_MS },
      },
    });
    return res.text ?? '';
  } catch (err) {
    if (isQuotaError(err)) throw new GeminiQuotaError('cota do Gemini esgotada');
    throw err;
  } finally {
    if (remote) {
      await ai.files.delete({ name: remote }).catch((e: unknown) => {
        console.warn('[references] não consegui apagar o arquivo no Gemini', e instanceof Error ? e.message : e);
      });
    }
  }
}

export function makeReferenceDeps(db: SupabaseClient): ReferenceDeps {
  return {
    now: () => new Date(),
    async probeDuration(url) {
      const r = await runCommand('yt-dlp', ytDlpArgs(['--dump-json'], url), { timeoutMs: PROBE_TIMEOUT_MS });
      if (r.code !== 0) throw new Error(`yt-dlp falhou: ${r.stderr.slice(-200)}`);
      return parseYtDlpDuration(r.stdout);
    },
    probeFileDuration: probeFile,
    async download(url, dir) {
      const r = await runCommand('yt-dlp', ytDlpArgs(ytDlpDownloadArgs(dir), url), { timeoutMs: DOWNLOAD_TIMEOUT_MS });
      if (r.code !== 0) throw new Error(`yt-dlp falhou: ${r.stderr.slice(-200)}`);
      const file = (await readdir(dir)).find((f) => f.startsWith('video.') && VIDEO_EXTENSIONS.some((e) => f.endsWith(e)));
      if (!file) throw new Error('yt-dlp não gerou arquivo');
      return join(dir, file);
    },
    async downloadUpload(path, dir) {
      const { data, error } = await db.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error(`Storage: ${error?.message ?? 'arquivo ausente'}`);
      if (data.size > REFERENCE_UPLOAD_MAX_BYTES) throw new Error('arquivo grande demais');
      const ext = extname(path).toLowerCase();
      const local = join(dir, `upload${VIDEO_EXTENSIONS.includes(ext) ? ext : '.mp4'}`);
      await writeFile(local, Buffer.from(await data.arrayBuffer()));
      return local;
    },
    async removeUpload(path) {
      await db.storage.from(BUCKET).remove([path]);
    },
    analyze: analyzeWithGemini,
  };
}
