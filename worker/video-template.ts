import { cp, mkdir, mkdtemp, readFile as fsReadFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkResolution } from '@/lib/marketing/photo-check';
import { findButton, getPack } from '@/lib/marketing/packs';
import { planTimeline, renderComposition } from '@/lib/marketing/packs/render';
import { FORMAT_SIZE } from '@/lib/marketing/prompt';
import { validatePhotoPaths } from '@/lib/marketing/validate';
import type { MarketingVideo } from '@/types';
import { DirectorError, defaultDirectorDeps, runDirector, type DirectorDeps } from './director';
import { defaultRenderDeps, type RenderDeps } from './hf-render';
import { checkPhotoQuality, defaultVisionDeps, photoDimensions, type VisionDeps } from './photo-vision';
import { failJob, finishJob } from './queue';

const BUCKET = 'marketing';
// The worker always runs from the repo root (`npm run worker`).
const SCAFFOLD_DIR = join(process.cwd(), 'worker', 'video-scaffold');
const PACKS_DIR = join(process.cwd(), 'src', 'lib', 'marketing', 'packs');

export interface TemplatedDeps extends VisionDeps, DirectorDeps, RenderDeps {
  loadComposition(niche: string, templateId: string): Promise<string>;
  accountName(accountId: string): Promise<string>;
}

type ErrorKind = 'photos' | 'director' | 'render';

class JobError extends Error {
  constructor(message: string, readonly kind: ErrorKind, readonly detail?: string) {
    super(message);
  }
}

function defaultTemplatedDeps(db: SupabaseClient): TemplatedDeps {
  return {
    ...defaultVisionDeps,
    ...defaultDirectorDeps,
    ...defaultRenderDeps,
    // niche/templateId já passaram pelo registro de pacotes: nada vem solto do usuário.
    loadComposition: (niche, templateId) =>
      fsReadFile(join(PACKS_DIR, niche, 'templates', templateId, 'composition.html'), 'utf8'),
    async accountName(accountId) {
      const { data } = await db.from('accounts').select('name').eq('id', accountId).single();
      return (data as { name?: string } | null)?.name ?? 'Seu negócio';
    },
  };
}

async function once<T>(fn: () => Promise<T>): Promise<T> {
  // check/render dependem de rede (GSAP via CDN, fontes): uma repetição cobre falha passageira.
  try {
    return await fn();
  } catch {
    return fn();
  }
}

export async function runTemplatedJob(
  db: SupabaseClient, video: MarketingVideo, overrides: Partial<TemplatedDeps> = {},
): Promise<void> {
  const deps: TemplatedDeps = { ...defaultTemplatedDeps(db), ...overrides };
  const fail = (message: string, kind: ErrorKind) =>
    failJob(db, 'marketing_videos', video.id, message, { error_kind: kind });

  const pathError = validatePhotoPaths(video.image_paths, video.account_id);
  if (pathError) return fail(pathError, 'photos');

  const pack = video.niche ? getPack(video.niche) : null;
  const buttonId = (video.director_input as { buttonId?: unknown } | null)?.buttonId;
  const found = pack && typeof buttonId === 'string' ? findButton(pack, buttonId) : null;
  if (!pack || !found || found.spec.id !== video.template_id) {
    return fail('Este modelo de vídeo não está disponível neste CRM.', 'director');
  }
  if (video.kind !== 'reels' || video.format === 'landscape' || !found.spec.formats.includes(video.format)) {
    return fail('Este modelo de vídeo não gera esse formato.', 'render');
  }
  const { button, spec } = found;
  const size = FORMAT_SIZE[video.format];
  const fields = Object.fromEntries(
    Object.entries((video.director_input as { fields?: Record<string, unknown> }).fields ?? {})
      .filter((e): e is [string, string] => typeof e[1] === 'string'),
  );

  const dir = await mkdtemp(join(tmpdir(), 'hf-'));
  try {
    await cp(SCAFFOLD_DIR, dir, { recursive: true }).catch(() => undefined);
    await mkdir(join(dir, 'assets'), { recursive: true });

    const buffers: Buffer[] = [];
    const files: string[] = [];
    for (const [i, path] of video.image_paths.entries()) {
      const { data, error } = await db.storage.from(BUCKET).download(path);
      if (error || !data) throw new JobError(`Não consegui baixar a foto ${i + 1}`, 'photos');
      const buf = Buffer.from(await data.arrayBuffer());
      const rel = `assets/img-${i + 1}${extname(path) || '.jpg'}`;
      await writeFile(join(dir, rel), buf);
      buffers.push(buf);
      files.push(rel);
    }

    // Foto ruim avisa o dono antes de gastar IA e render.
    const small = checkResolution(await photoDimensions(buffers));
    if (small.length) throw new JobError(small.join('. '), 'photos');
    const quality = await checkPhotoQuality(deps, buffers);
    if (quality.length) throw new JobError(quality.join('. '), 'photos');

    let director;
    try {
      director = await runDirector(deps, {
        pack, button, spec, fields, photoCount: files.length, businessName: await deps.accountName(video.account_id),
      });
    } catch (err) {
      if (err instanceof DirectorError) throw new JobError(err.message, 'director');
      throw new JobError('A IA não respondeu agora. Tente de novo em alguns minutos.', 'director', String(err));
    }

    const texts = Object.fromEntries(Object.keys(spec.texts).map((k) => [k, director.texts[k] ?? '']));
    const html = renderComposition(await deps.loadComposition(pack.niche, spec.id), {
      ...size,
      texts,
      photos: director.photoOrder.map((i) => files[i]),
      timeline: planTimeline(files.length),
    });
    await writeFile(join(dir, 'index.html'), html);

    await once(async () => {
      const r = await deps.check(dir);
      if (!r.ok) throw new Error(r.output);
      return r;
    }).catch((err: unknown) => {
      throw new JobError('Não consegui montar o vídeo. Tente de novo.', 'render', String(err).slice(-1500));
    });

    const mp4 = join(dir, 'out.mp4');
    const jpg = join(dir, 'poster.jpg');
    await once(() => deps.render(dir, mp4));
    await deps.poster(mp4, jpg);

    const base = `account-${video.account_id}/videos/${video.id}`;
    const up1 = await db.storage.from(BUCKET).upload(`${base}.mp4`, await deps.readFile(mp4), { contentType: 'video/mp4', upsert: true });
    if (up1.error) throw new Error(`Upload do vídeo falhou: ${up1.error.message}`);
    const up2 = await db.storage.from(BUCKET).upload(`${base}.jpg`, await deps.readFile(jpg), { contentType: 'image/jpeg', upsert: true });
    if (up2.error) throw new Error(`Upload do poster falhou: ${up2.error.message}`);

    const caption = director.hashtags.length ? `${director.caption}\n\n${director.hashtags.join(' ')}` : director.caption;
    await finishJob(db, 'marketing_videos', video.id, {
      video_path: `${base}.mp4`,
      poster_path: `${base}.jpg`,
      director_output: director,
      caption,
    });
  } catch (err) {
    if (err instanceof JobError) {
      if (err.detail) console.error(`[marketing ${video.id}] ${err.message}: ${err.detail}`);
      await fail(err.message, err.kind);
    } else {
      console.error(`[marketing ${video.id}]`, err);
      await fail('Não consegui gerar o vídeo agora. Tente de novo.', 'render');
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
