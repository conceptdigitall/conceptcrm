import { access, cp, mkdir, mkdtemp, readFile as fsReadFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFixPrompt, buildUserPrompt, extractHtml } from '@/lib/marketing/prompt';
import { validateVideoInput } from '@/lib/marketing/validate';
import type { MarketingVideo } from '@/types';
import { runCommand } from './exec';
import { parseVideoOptions, narrationWordLimit } from '@/lib/marketing/video-options';
import { audioPromptLines, buildScriptPrompt, cleanScript, synthesize, type Narration } from './narration';
import { failJob, finishJob } from './queue';
import { defaultRenderDeps } from './hf-render';
import { runTemplatedJob } from './video-template';
import { MUSIC_DIR, loadTracks, pickTrack } from './music';

const BUCKET = 'marketing';
const MAX_FIX_ROUNDS = 2;
// 'gemini' (usa @google/genai + GEMINI_API_KEY), 'cli' (Claude Code CLI logado), 'api' (Anthropic SDK + ANTHROPIC_API_KEY).
export type EngineType = 'gemini' | 'cli' | 'api';
export const ENGINE: EngineType = (process.env.VIDEO_ENGINE as EngineType) ||
  (process.env.VIDEO_MODEL?.startsWith('gemini') ? 'gemini' : (process.env.GEMINI_API_KEY ? 'gemini' : 'cli'));
export const CLAUDE_BIN = process.env.CLAUDE_PATH || 'claude';
export const DEFAULT_MODEL = ENGINE === 'gemini' ? 'gemini-3.8-flash' : 'claude-opus-5-5';
export const MODEL = process.env.VIDEO_MODEL || DEFAULT_MODEL;
// The worker always runs from the repo root (`npm run worker`).
const SCAFFOLD_DIR = join(process.cwd(), 'worker', 'video-scaffold');
const PROMPTS_DIR = join(process.cwd(), 'worker', 'prompts');

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface VideoDeps {
  compose(messages: ChatMessage[]): Promise<string>;
  script(brief: string, duration?: number): Promise<string>;
  narrate(text: string): Promise<Narration | null>;
  check(dir: string): Promise<{ ok: boolean; output: string }>;
  render(dir: string, out: string): Promise<void>;
  poster(video: string, out: string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
}

let systemPromptCache: string | null = null;
async function systemPrompt(): Promise<string> {
  if (systemPromptCache) return systemPromptCache;
  const read = (f: string) => fsReadFile(join(PROMPTS_DIR, f), 'utf8');
  const refs = ['hf-minimal-composition.md', 'hf-data-attributes.md', 'hf-tracks-and-clips.md',
    'hf-determinism-rules.md', 'hf-variables-and-media.md'];
  const [core, tones, rules, playbook, animStyles, example, ...refTexts] = await Promise.all(
    ['hyperframes-core.md', 'brag-tones.md', 'brag-rules.md', 'concept-playbook.md', 'animation-styles.md', 'example-blank.html', ...refs].map(read),
  );
  systemPromptCache = [
    'Você é um motion designer que escreve composições HyperFrames (HTML → vídeo).',
    'Siga estritamente a referência do HyperFrames abaixo e as regras criativas.',
    '# Referência HyperFrames', core, ...refTexts,
    '# Composição mínima válida (ponto de partida)', '```html', example, '```',
    '# Tons', tones,
    '# Regras criativas', rules,
    '# Playbook da Concept Digital (prevalece sobre as regras criativas)', playbook,
    '# Estilos de Animação em JavaScript (Whiteboard, Contadores, Cutout, Kinetic)', animStyles,
  ].join('\n\n');
  return systemPromptCache;
}

async function composeViaCli(messages: ChatMessage[], system?: Promise<string> | string): Promise<string> {
  const prompt = messages
    .map((m) => (m.role === 'user' ? m.content : `<sua_resposta_anterior>\n${m.content}\n</sua_resposta_anterior>`))
    .join('\n\n');
  // Sem chave de API no ambiente, o CLI usa o login do plano em vez de cobrar no Console.
  const { ANTHROPIC_API_KEY: _k, ANTHROPIC_AUTH_TOKEN: _t, ...env } = process.env;
  const cwd = await mkdtemp(join(tmpdir(), 'hf-llm-'));
  try {
    const r = await runCommand(CLAUDE_BIN, [
      '-p', '--model', MODEL, ...(MODEL.includes('haiku') ? [] : ['--effort', 'high']),
      '--system-prompt', await (system ?? systemPrompt()),
      '--tools', '', '--strict-mcp-config', '--setting-sources', '',
      '--disable-slash-commands', '--no-session-persistence', '--output-format', 'json',
    ], { cwd, env, input: prompt, timeoutMs: 15 * 60 * 1000 });
    let out: { is_error?: boolean; result?: string };
    try { out = JSON.parse(r.stdout); } catch { throw new Error(`Claude Code falhou: ${(r.stderr || r.stdout).slice(-400)}`); }
    if (out.is_error || r.code !== 0) throw new Error(`Claude Code falhou: ${(out.result ?? r.stderr).slice(0, 400)}`);
    return out.result ?? '';
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 2, initialDelayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number; code?: number })?.status || (err as { status?: number; code?: number })?.code;
      const isTransient = status === 503 || status === 429;
      if (!isTransient || attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, initialDelayMs * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

export async function composeViaGemini(messages: ChatMessage[], system?: Promise<string> | string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no ambiente (.env.local)');
  const ai = new GoogleGenAI({ apiKey });
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const systemInstruction = await (system ?? systemPrompt());
  const response = await retryWithBackoff(() =>
    ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
      },
    }),
  );
  const text = response.text ?? '';
  if (!text) {
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason) {
      throw new Error(`Gemini não retornou texto (motivo: ${candidate.finishReason})`);
    }
  }
  return text;
}

/** Texto curto (roteiro, pauta) com o mesmo motor de IA do worker. */
export async function generateText(system: string, content: string, maxTokens = 2000): Promise<string> {
  const msg: ChatMessage[] = [{ role: 'user', content }];
  if (ENGINE === 'gemini') return composeViaGemini(msg, system);
  if (ENGINE === 'cli') return composeViaCli(msg, system);
  const r = await new Anthropic().messages.create({ model: MODEL, max_tokens: maxTokens, system, messages: msg });
  return r.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

const defaultDeps: VideoDeps = {
  async compose(messages) {
    if (ENGINE === 'gemini') return composeViaGemini(messages);
    if (ENGINE === 'cli') return composeViaCli(messages);
    const client = new Anthropic();
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: await systemPrompt(), cache_control: { type: 'ephemeral' } }],
        messages,
      })
      .finalMessage();
    if (response.stop_reason === 'refusal') {
      throw new Error(`A IA recusou o pedido (${response.stop_details?.category ?? 'sem categoria'})`);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('A composição ficou grande demais (limite de tokens)');
    }
    return response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  },
  async script(brief, duration) {
    const system = 'Você é redator de locução publicitária em português do Brasil. Responda só com o texto a ser falado.';
    return generateText(system, buildScriptPrompt(brief, duration), 600);
  },
  narrate: (text) => synthesize(text),
  ...defaultRenderDeps,
};

export async function runVideoJob(
  db: SupabaseClient, video: MarketingVideo, overrides: Partial<VideoDeps> = {},
): Promise<void> {
  // Vídeos feitos por botão de um pacote de nicho seguem o caminho de templates.
  if (video.template_id) return runTemplatedJob(db, video);
  const deps = { ...defaultDeps, ...overrides };
  // The worker downloads with the service role, which ignores storage RLS:
  // only files under this job's own account folder may be used.
  const valid = validateVideoInput(
    { prompt: video.prompt, imagePaths: video.image_paths, format: video.format, tone: video.tone },
    video.account_id,
  );
  if (!valid.ok) {
    await failJob(db, 'marketing_videos', video.id, valid.error);
    return;
  }
  // Estilo, duração e Reels/Story escolhidos no painel (padrão para pedidos antigos).
  const options = parseVideoOptions(video.director_input);
  const dir = await mkdtemp(join(tmpdir(), 'hf-'));
  try {
    // Scaffold may be empty in tests; the real one comes from Step 1.
    await cp(SCAFFOLD_DIR, dir, { recursive: true }).catch(() => undefined);
    await mkdir(join(dir, 'assets'), { recursive: true });

    const imageFiles: string[] = [];
    for (const [i, path] of video.image_paths.entries()) {
      const { data, error } = await db.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error(`Não consegui baixar a foto ${i + 1}`);
      const rel = `assets/img-${i + 1}${extname(path) || '.jpg'}`;
      await writeFile(join(dir, rel), Buffer.from(await data.arrayBuffer()));
      imageFiles.push(rel);
    }

    // Arte estática (post de foto) não tem áudio: sem narração nem trilha.
    if (options.still) await rm(join(dir, 'assets', 'music.mp3'), { force: true });
    else {
      const track = pickTrack(await loadTracks(), video.tone, video.id);
      if (track) await cp(join(MUSIC_DIR, track.file), join(dir, 'assets', 'music.mp3'));
    }

    // Narração (ElevenLabs, voz Matilda). Falha aqui não derruba o job: o vídeo sai só com a trilha.
    let narration: Narration | null = null;
    if (!options.still) {
      try {
        const text = cleanScript(await deps.script(video.prompt, options.duration), narrationWordLimit(options.duration));
        narration = text ? await deps.narrate(text) : null;
        if (narration) await writeFile(join(dir, 'assets', 'narration.mp3'), narration.audio);
      } catch (err) {
        console.warn(`Narração ignorada (vídeo ${video.id}): ${err instanceof Error ? err.message : err}`);
        narration = null;
      }
    }
    const hasMusic = await access(join(dir, 'assets', 'music.mp3')).then(() => true, () => false);

    const messages: ChatMessage[] = [{
      role: 'user',
      content: buildUserPrompt({
        prompt: video.prompt, format: video.format, tone: video.tone, imageFiles,
        style: options.style, duration: options.duration, target: options.target, still: options.still,
        audio: audioPromptLines(narration, hasMusic, options.duration),
      }),
    }];

    let lastCheck = '';
    let passed = false;
    for (let attempt = 0; attempt <= MAX_FIX_ROUNDS; attempt++) {
      const reply = await deps.compose(messages);
      const html = extractHtml(reply);
      if (!html) throw new Error('A IA não devolveu um HTML de composição');
      await writeFile(join(dir, 'index.html'), html);
      const result = await deps.check(dir);
      if (result.ok) { passed = true; break; }
      lastCheck = result.output;
      messages.push({ role: 'assistant', content: reply }, { role: 'user', content: buildFixPrompt(result.output) });
    }
    if (!passed) throw new Error(`Composição inválida depois de ${MAX_FIX_ROUNDS + 1} tentativas: ${lastCheck.slice(-1500)}`);

    const mp4 = join(dir, 'out.mp4');
    const jpg = join(dir, 'poster.jpg');
    await deps.render(dir, mp4);
    await deps.poster(mp4, jpg);

    const base = `account-${video.account_id}/videos/${video.id}`;
    const up1 = await db.storage.from(BUCKET).upload(`${base}.mp4`, await deps.readFile(mp4), { contentType: 'video/mp4', upsert: true });
    if (up1.error) throw new Error(`Upload do vídeo falhou: ${up1.error.message}`);
    const up2 = await db.storage.from(BUCKET).upload(`${base}.jpg`, await deps.readFile(jpg), { contentType: 'image/jpeg', upsert: true });
    if (up2.error) throw new Error(`Upload do poster falhou: ${up2.error.message}`);

    await finishJob(db, 'marketing_videos', video.id, { video_path: `${base}.mp4`, poster_path: `${base}.jpg` });
  } catch (err) {
    await failJob(db, 'marketing_videos', video.id, err instanceof Error ? err.message : String(err));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
