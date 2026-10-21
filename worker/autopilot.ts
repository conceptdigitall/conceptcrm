// Piloto automático de marketing (liga com MARKETING_AUTOPILOT=1 no .env.local).
// A cada passada cria no máximo 1 item atrasado da semana: pauta + legenda pela
// IA, um pedido em marketing_videos (que o próprio worker renderiza) e o post
// ligado a ele como rascunho. Quando a mídia fica pronta, o post vira
// "esperando aprovação". Nunca publica nada sozinho.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AUTOPILOT_SYSTEM,
  autopilotPrompt,
  nextSlot,
  parseAutopilotIdea,
  weekStart,
  type AutopilotConfig,
} from '@/lib/marketing/autopilot';
import { DEFAULT_SETTINGS } from '@/lib/marketing/content';
import type { MarketingSettings } from '@/types';

export interface AutopilotDeps {
  now(): Date;
  generateText(system: string, content: string): Promise<string>;
}

// Pauta que falhou não é refeita na hora: evita gastar IA em loop.
const RETRY_AFTER_MS = 60 * 60 * 1000;
const lastFailure = new Map<string, number>();

/** Cria o próximo item atrasado de alguma conta. true se criou algo. */
export async function runAutopilotTick(
  db: SupabaseClient, accountIds: string[], cfg: AutopilotConfig, deps: AutopilotDeps,
): Promise<boolean> {
  const now = deps.now();
  for (const accountId of accountIds) {
    const failedAt = lastFailure.get(accountId);
    if (failedAt && now.getTime() - failedAt < RETRY_AFTER_MS) continue;
    try {
      if (await planOne(db, accountId, cfg, deps, now)) return true;
    } catch (err) {
      lastFailure.set(accountId, now.getTime());
      console.error(`[piloto] conta ${accountId}:`, err instanceof Error ? err.message : err);
    }
  }
  return false;
}

async function planOne(
  db: SupabaseClient, accountId: string, cfg: AutopilotConfig, deps: AutopilotDeps, now: Date,
): Promise<boolean> {
  // A semana é contada pelos pedidos de vídeo marcados como do piloto.
  const { data: made, error } = await db
    .from('marketing_videos')
    .select('director_input')
    .eq('account_id', accountId)
    .eq('director_input->>autopilot', 'true')
    .gte('created_at', weekStart(now).toISOString());
  if (error) throw new Error(`Não consegui ler a semana: ${error.message}`);
  const story = (made ?? []).filter((r) => (r.director_input as { target?: string })?.target === 'story').length;
  const slot = nextSlot(cfg, { feed: (made?.length ?? 0) - story, story }, now);
  if (!slot) return false;

  const [{ data: settingsRow }, { data: projects }, { data: recent }] = await Promise.all([
    db.from('marketing_settings').select('*').eq('account_id', accountId).maybeSingle(),
    db.from('marketing_projects').select('name, category').eq('account_id', accountId).limit(20),
    db.from('marketing_posts').select('title').eq('account_id', accountId).order('created_at', { ascending: false }).limit(15),
  ]);
  const settings = (settingsRow as MarketingSettings | null) ?? { ...DEFAULT_SETTINGS, account_id: accountId };

  const raw = await deps.generateText(AUTOPILOT_SYSTEM, autopilotPrompt({
    slot,
    settings,
    projects: (projects ?? []).map((p) => `${p.name} (${p.category})`),
    recentTitles: (recent ?? []).map((p) => p.title).filter(Boolean),
  }));
  const idea = parseAutopilotIdea(raw);
  if (!idea) throw new Error('A IA não devolveu uma pauta válida');

  const { data: video, error: vErr } = await db
    .from('marketing_videos')
    .insert({
      account_id: accountId,
      created_by: null,
      prompt: idea.brief,
      image_paths: [],
      format: slot.format,
      tone: slot.tone,
      status: 'pending',
      kind: 'reels',
      director_input: slot.options,
    })
    .select('id')
    .single();
  if (vErr || !video) throw new Error(`Não consegui enfileirar a mídia: ${vErr?.message}`);

  const { error: pErr } = await db.from('marketing_posts').insert({
    account_id: accountId,
    created_by: null,
    kind: slot.kind,
    media_type: slot.mediaType,
    title: idea.title,
    idea: idea.brief,
    caption: idea.caption,
    media_urls: [],
    video_id: video.id,
    status: 'draft',
  });
  if (pErr) {
    await db.from('marketing_videos').delete().eq('id', video.id);
    throw new Error(`Não consegui criar o post: ${pErr.message}`);
  }
  console.log(`[piloto] ${slot.kind}/${slot.mediaType}: ${idea.title}`);
  return true;
}

/**
 * Depois que o worker termina um vídeo: o rascunho ligado a ele vai para
 * aprovação (mídia pronta) ou guarda o erro para o João ver.
 */
export async function syncPostsForVideo(db: SupabaseClient, videoId: string): Promise<void> {
  const { data: video } = await db.from('marketing_videos').select('status, error').eq('id', videoId).maybeSingle();
  if (!video || (video.status !== 'done' && video.status !== 'failed')) return;
  const patch = video.status === 'done'
    ? { status: 'pending_approval', error_message: null }
    : { error_message: `A mídia falhou: ${String(video.error ?? '').slice(0, 300)}` };
  await db.from('marketing_posts').update(patch).eq('video_id', videoId).eq('status', 'draft');
}
