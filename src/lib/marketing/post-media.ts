// Posts do piloto automático não guardam URL de mídia: a arte e o vídeo
// ficam no bucket privado `marketing`, ligados por `video_id`. Na leitura
// (painel e publicação no Instagram) assinamos as URLs por 1 hora, tempo de
// sobra para a Meta baixar o arquivo.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketingPost } from '@/types';

const BUCKET = 'marketing';
const SIGN_SECONDS = 60 * 60;

export async function attachPostMedia(db: SupabaseClient, posts: MarketingPost[]): Promise<MarketingPost[]> {
  const needs = posts.filter((p) => p.video_id && (p.media_urls?.length ?? 0) === 0);
  if (needs.length === 0) return posts;

  const { data: videos } = await db
    .from('marketing_videos')
    .select('id, account_id, status, video_path, poster_path')
    .in('id', needs.map((p) => p.video_id as string));
  const byId = new Map((videos ?? []).map((v) => [v.id as string, v]));

  // Foto usa a arte (frame 0); vídeo usa o mp4. A API v1 lê com service role
  // (sem RLS), então o vídeo precisa ser da mesma conta do post: um video_id
  // de outra conta não pode virar link assinado.
  const pathFor = (p: MarketingPost): string | null => {
    const v = byId.get(p.video_id as string);
    if (!v || v.status !== 'done' || v.account_id !== p.account_id) return null;
    return (p.media_type === 'video' ? v.video_path : v.poster_path) ?? null;
  };
  const paths = [...new Set(needs.map(pathFor).filter((x): x is string => Boolean(x)))];
  if (paths.length === 0) return posts;

  const { data: signed } = await db.storage.from(BUCKET).createSignedUrls(paths, SIGN_SECONDS);
  const urlByPath = new Map((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl]));

  return posts.map((p) => {
    if (!needs.includes(p)) return p;
    const path = pathFor(p);
    const url = path ? urlByPath.get(path) : undefined;
    return url ? { ...p, media_urls: [url] } : p;
  });
}
