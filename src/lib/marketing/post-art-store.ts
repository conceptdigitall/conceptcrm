// Grava a arte gerada no bucket privado `marketing` e devolve URL assinada
// para a Meta baixar na publicação. Caminho por conta + versão do post, então
// regerar a mesma versão só sobrescreve.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketingPost, MarketingSettings } from '@/types';
import { buildArtContent, type ArtFormat } from '@/lib/marketing/post-art-content';
import { renderPostArtJpeg } from '@/lib/marketing/post-art';

const BUCKET = 'marketing';
const SIGN_SECONDS = 60 * 60;

export type ArtSettings = Pick<MarketingSettings, 'business_name' | 'business_niche' | 'instagram_username'>;

export async function loadArtSettings(db: SupabaseClient, accountId: string): Promise<ArtSettings> {
  const { data } = await db
    .from('marketing_settings')
    .select('business_name, business_niche, instagram_username')
    .eq('account_id', accountId)
    .maybeSingle();
  return (data as ArtSettings | null) ?? {};
}

export function artFormatFor(post: Pick<MarketingPost, 'kind'>): ArtFormat {
  return post.kind === 'story' ? 'story' : 'feed';
}

/** `admin` precisa ser service role: o upload é feito pelo servidor, já com a conta conferida. */
export async function storePostArt(
  admin: SupabaseClient,
  post: MarketingPost,
  settings: ArtSettings,
): Promise<string> {
  const jpeg = await renderPostArtJpeg(buildArtContent(post, settings), artFormatFor(post));
  const path = `art/${post.account_id}/${post.id}-v${post.version}.jpg`;

  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) throw new Error(`Falha ao salvar a arte: ${upErr.message}`);

  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGN_SECONDS);
  if (error || !data?.signedUrl) throw new Error('Falha ao assinar a arte gerada');
  return data.signedUrl;
}
