// Grava a arte gerada no bucket privado `marketing` e devolve URL assinada
// para a Meta baixar na publicação. Caminho por conta + versão do post, então
// regerar a mesma versão só sobrescreve.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketingPost, MarketingSettings } from '@/types';
import { buildArtContent, buildSlideContent, type ArtFormat } from '@/lib/marketing/post-art-content';
import { renderPostArtJpeg } from '@/lib/marketing/post-art';

const BUCKET = 'marketing';
const SIGN_SECONDS = 60 * 60;
// Limite do Instagram para um carrossel.
const CAROUSEL_MAX = 10;

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

/** Sobe o JPEG em `path` (sobrescreve) e devolve a URL assinada. */
async function uploadArt(admin: SupabaseClient, path: string, jpeg: Buffer): Promise<string> {
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) throw new Error(`Falha ao salvar a arte: ${upErr.message}`);

  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGN_SECONDS);
  if (error || !data?.signedUrl) throw new Error('Falha ao assinar a arte gerada');
  return data.signedUrl;
}

/** `admin` precisa ser service role: o upload é feito pelo servidor, já com a conta conferida. */
export async function storePostArt(
  admin: SupabaseClient,
  post: MarketingPost,
  settings: ArtSettings,
): Promise<string> {
  const jpeg = await renderPostArtJpeg(buildArtContent(post, settings), artFormatFor(post));
  // Pasta `account-<id>/` é a que as policies do bucket isolam por conta.
  return uploadArt(admin, `account-${post.account_id}/art/${post.id}-v${post.version}.jpg`, jpeg);
}

/** Uma arte por lâmina (no máximo 10), URLs assinadas na ordem das lâminas. */
export async function storeCarouselArt(
  admin: SupabaseClient,
  post: MarketingPost,
  settings: ArtSettings,
): Promise<string[]> {
  const total = Math.min(post.frames?.length ?? 0, CAROUSEL_MAX);
  // Cada lâmina conta o total real enviado, então "n/total" não passa de 10.
  const frames = (post.frames ?? []).slice(0, total);
  const sized = { ...post, frames };
  const urls: string[] = [];
  for (let i = 0; i < total; i++) {
    const jpeg = await renderPostArtJpeg(buildSlideContent(sized, settings, i), artFormatFor(post));
    urls.push(await uploadArt(admin, `account-${post.account_id}/art/${post.id}-v${post.version}-${i + 1}.jpg`, jpeg));
  }
  return urls;
}
