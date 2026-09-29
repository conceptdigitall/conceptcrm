import { cp, mkdir, mkdtemp, readFile as fsReadFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFixPrompt, buildUserPrompt, extractHtml } from '@/lib/marketing/prompt';
import type { MarketingVideo } from '@/types';
import { runCommand } from './exec';
import { failJob, finishJob } from './queue';

const BUCKET = 'marketing';
const MAX_FIX_ROUNDS = 2;
const MODEL = 'claude-opus-5-5';
// The worker always runs from the repo root (`npm run worker`).
const SCAFFOLD_DIR = join(process.cwd(), 'worker', 'video-scaffold');
const PROMPTS_DIR = join(process.cwd(), 'worker', 'prompts');
// The pinned local CLI; `npx hyperframes` from a temp dir would fetch the latest from npm.
const HYPERFRAMES_BIN = join(process.cwd(), 'node_modules', '.bin', 'hyperframes');

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface VideoDeps {
  compose(messages: ChatMessage[]): Promise<string>;
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
  const [core, tones, rules, example, ...refTexts] = await Promise.all(
    ['hyperframes-core.md', 'brag-tones.md', 'brag-rules.md', 'example-blank.html', ...refs].map(read),
  );
  systemPromptCache = [
    'Você é um motion designer que escreve composições HyperFrames (HTML → vídeo).',
    'Siga estritamente a referência do HyperFrames abaixo e as regras criativas.',
    '# Referência HyperFrames', core, ...refTexts,
    '# Composição mínima válida (ponto de partida)', '```html', example, '```',
    '# Tons', tones,
    '# Regras criativas', rules,
  ].join('\n\n');
  return systemPromptCache;
}

const defaultDeps: VideoDeps = {
  async compose(messages) {
    const client = new Anthropic();
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'high' },
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
  async check(dir) {
    const r = await runCommand(HYPERFRAMES_BIN, ['check'], { cwd: dir, timeoutMs: 5 * 60 * 1000 });
    return { ok: r.code === 0, output: `${r.stdout}\n${r.stderr}` };
  },
  async render(dir, out) {
    const r = await runCommand(HYPERFRAMES_BIN, ['render', '--quality', 'looks', '--output', out], {
      cwd: dir, timeoutMs: 15 * 60 * 1000,
    });
    if (r.code !== 0) throw new Error(`Render falhou: ${r.stderr.slice(-800)}`);
  },
  async poster(video, out) {
    const r = await runCommand('ffmpeg', ['-y', '-ss', '1', '-i', video, '-frames:v', '1', out], {
      timeoutMs: 60 * 1000,
    });
    if (r.code !== 0) throw new Error(`Poster falhou: ${r.stderr.slice(-400)}`);
  },
  readFile: (p) => fsReadFile(p),
};

export async function runVideoJob(
  db: SupabaseClient, video: MarketingVideo, overrides: Partial<VideoDeps> = {},
): Promise<void> {
  const deps = { ...defaultDeps, ...overrides };
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

    const messages: ChatMessage[] = [{
      role: 'user',
      content: buildUserPrompt({ prompt: video.prompt, format: video.format, tone: video.tone, imageFiles }),
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
