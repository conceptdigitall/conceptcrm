import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { publishToInstagram, InstagramApiError } from '@/lib/marketing/instagram';
import { attachPostMedia } from '@/lib/marketing/post-media';
import { loadArtSettings, storePostArt } from '@/lib/marketing/post-art-store';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { isInternalAccount } from '@/lib/internal-accounts';
import { loadInstagramCredentials, recordInstagramError } from '@/lib/marketing/instagram-connection';
import type { MarketingPost } from '@/types';

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  // Cada conta publica no Instagram que conectou em Ajustes. O token do
  // ambiente (META_ACCESS_TOKEN) é o da Concept: só a conta interna cai nele.
  let credentials;
  try {
    credentials = await loadInstagramCredentials(supabaseAdmin(), ctx.accountId);
  } catch (err) {
    console.error('[instagram/publish] falha ao ler a conexão:', err);
    return NextResponse.json(
      { error: 'Não foi possível ler o Instagram conectado. Conecte de novo em Ajustes.' },
      { status: 500 },
    );
  }
  if (!credentials && !isInternalAccount(ctx.accountId)) {
    return NextResponse.json(
      { error: 'Conecte o Instagram da sua empresa em Marketing → Ajustes para publicar.' },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as { postId?: unknown } | null;

  // Só publica post salvo da própria conta: URL de mídia e legenda soltas no
  // corpo deixariam publicar qualquer coisa sem passar pelo painel.
  if (!body || typeof body.postId !== 'string' || !body.postId) {
    return NextResponse.json({ error: 'Informe o post a publicar' }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from('marketing_posts')
    .select('*')
    .eq('id', body.postId)
    .eq('account_id', ctx.accountId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Post não encontrado' }, { status: 404 });
  }
  const [post] = await attachPostMedia(ctx.supabase, [data as MarketingPost]);
  if (post.status === 'published') {
    return NextResponse.json({ error: 'Este post já foi publicado no Instagram.' }, { status: 400 });
  }

  const kind = post.kind ?? 'feed';
  const mediaType = post.media_type ?? 'foto';
  let mediaUrls = post.media_urls ?? [];
  const caption = post.caption ?? '';

  // Post só de texto: gera a arte da marca e publica ela.
  if (mediaUrls.length === 0 && mediaType !== 'video') {
    try {
      const settings = await loadArtSettings(ctx.supabase, ctx.accountId);
      mediaUrls = [await storePostArt(supabaseAdmin(), post, settings)];
    } catch (err) {
      console.error('[instagram/publish] falha ao gerar arte:', err);
    }
  }

  if (mediaUrls.length === 0) {
    return NextResponse.json(
      { error: 'Post precisa de pelo menos uma imagem ou vídeo para publicação no Instagram.' },
      { status: 400 },
    );
  }

  try {
    const result = await publishToInstagram({
      kind,
      mediaType,
      mediaUrls,
      caption,
      ...(credentials && { accessToken: credentials.accessToken, igUserId: credentials.igUserId }),
    });
    if (credentials) await recordInstagramError(supabaseAdmin(), ctx.accountId, null);

    await ctx.supabase
      .from('marketing_posts')
      .update({
        status: 'published',
        instagram_media_id: result.mediaId,
        instagram_permalink: result.permalink ?? null,
        posted_at: result.publishedAt,
        error_message: null,
      })
      .eq('id', post.id)
      .eq('account_id', ctx.accountId);

    return NextResponse.json({
      success: true,
      mediaId: result.mediaId,
      permalink: result.permalink,
      postedAt: result.publishedAt,
    });
  } catch (err: unknown) {
    // Erro da Meta é útil pro usuário; erro interno não sai do servidor.
    const errorMsg = err instanceof InstagramApiError ? err.message : 'Falha na publicação do Instagram';
    if (!(err instanceof InstagramApiError)) console.error('[instagram/publish] falha:', err);
    if (credentials && err instanceof InstagramApiError) {
      await recordInstagramError(supabaseAdmin(), ctx.accountId, errorMsg);
    }
    await ctx.supabase
      .from('marketing_posts')
      .update({ error_message: errorMsg })
      .eq('id', post.id)
      .eq('account_id', ctx.accountId);

    const status = err instanceof InstagramApiError ? 400 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
