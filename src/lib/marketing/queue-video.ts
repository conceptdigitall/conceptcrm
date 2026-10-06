// Enfileira um vídeo de marketing (status 'pending'; o worker do Mac
// renderiza). Núcleo compartilhado entre o painel (`/api/marketing/videos`)
// e a API pública (`/api/v1/marketing/videos`): mesma validação e mesmo
// limite diário nos dois caminhos.
import type { SupabaseClient } from '@supabase/supabase-js';

import { validateVideoInput } from '@/lib/marketing/validate';
import { DAILY_VIDEO_LIMIT, getStartOfTodayIso, isDailyLimitReached } from '@/lib/marketing/limits';

export type QueueVideoResult =
  | { ok: true; video: Record<string, unknown> }
  | { ok: false; status: 400 | 429 | 500; error: string };

export async function queueVideo(
  db: SupabaseClient,
  accountId: string,
  createdBy: string | null,
  body: unknown
): Promise<QueueVideoResult> {
  const parsed = validateVideoInput(body, accountId);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const { count } = await db
    .from('marketing_videos')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('created_at', getStartOfTodayIso());

  if (isDailyLimitReached(count ?? 0)) {
    return {
      ok: false,
      status: 429,
      error: `Limite diário de ${DAILY_VIDEO_LIMIT} vídeos atingido hoje. Tente novamente amanhã.`,
    };
  }

  const { data, error } = await db
    .from('marketing_videos')
    .insert({
      account_id: accountId,
      created_by: createdBy,
      prompt: parsed.value.prompt,
      image_paths: parsed.value.imagePaths,
      format: parsed.value.format,
      tone: parsed.value.tone,
      status: 'pending',
    })
    .select()
    .single();

  if (error || !data) return { ok: false, status: 500, error: error?.message ?? 'Falha ao criar vídeo' };
  return { ok: true, video: data as Record<string, unknown> };
}
