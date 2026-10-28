import { NextResponse, after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { publishToInstagram, InstagramApiError } from '@/lib/marketing/instagram';
import { attachPostMedia } from '@/lib/marketing/post-media';
import { loadArtSettings, storePostArt } from '@/lib/marketing/post-art-store';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { isInternalAccount } from '@/lib/internal-accounts';
import { loadInstagramCredentials, recordInstagramError } from '@/lib/marketing/instagram-connection';
import type { InstagramCredentials } from '@/lib/marketing/instagram-connection';
import type { MarketingPost, PostStatus } from '@/types';

// Um Reel leva de 1 a 3 min para a Meta processar: o trabalho roda depois da
// resposta (after) e a tela acompanha pelo GET. O teto cobre o polling da Meta (3 min).
export const maxDuration = 300;

// Passou disso em 'publishing' = a função caiu no meio; o post pode ser publicado de novo.
const STALE_PUBLISH_MS = 6 * 60 * 1000;

function isStale(startedAt: string | null | undefined): boolean {
  if (!startedAt) return true;
  return Date.now() - new Date(startedAt).getTime() > STALE_PUBLISH_MS;
}

/**
 * GET /api/marketing/instagram/publish?postId=...  (viewer+)
 * Andamento da publicação: a tela consulta até o status deixar de ser 'publishing'.
 */
export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('viewer');
  } catch (err) {
    return toErrorResponse(err);
  }
  const postId = new URL(request.url).searchParams.get('postId');
  if (!postId) return NextResponse.json({ error: 'Informe o post' }, { status: 400 });

  const { data, error } = await ctx.supabase
    .from('marketing_posts')
    .select('status, error_message, instagram_media_id, instagram_permalink, posted_at, publish_started_at')
    .eq('id', postId)
    .eq('account_id', ctx.accountId)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Post não encontrado' }, { status: 404 });

  return NextResponse.json({
    status: data.status,
    error_message: data.error_message ?? null,
    instagram_media_id: data.instagram_media_id ?? null,
    instagram_permalink: data.instagram_permalink ?? null,
    posted_at: data.posted_at ?? null,
    stale: data.status === 'publishing' && isStale(data.publish_started_at),
  });
}

interface PublishJob {
  admin: SupabaseClient;
  accountId: string;
  post: MarketingPost;
  credentials: InstagramCredentials | null;
  restoreStatus: PostStatus;
}

/** Trabalho demorado com a Meta. Nunca lança: o resultado vai para o banco. */
async function runPublish({ admin, accountId, post, credentials, restoreStatus }: PublishJob) {
  const kind = post.kind ?? 'feed';
  const mediaType = post.media_type ?? 'foto';
  let mediaUrls = post.media_urls ?? [];

  const scoped = () => admin.from('marketing_posts');
  try {
    // Post só de texto: gera a arte da marca e publica ela.
    if (mediaUrls.length === 0 && mediaType !== 'video') {
      try {
        const settings = await loadArtSettings(admin, accountId);
        mediaUrls = [await storePostArt(admin, post, settings)];
      } catch (err) {
        console.error('[instagram/publish] falha ao gerar arte:', err);
      }
    }
    if (mediaUrls.length === 0) {
      throw new InstagramApiError('Post precisa de pelo menos uma imagem ou vídeo para publicação no Instagram.');
    }

    const result = await publishToInstagram({
      kind,
      mediaType,
      mediaUrls,
      caption: post.caption ?? '',
      ...(credentials && { accessToken: credentials.accessToken, igUserId: credentials.igUserId }),
    });
    if (credentials) await recordInstagramError(admin, accountId, null);

    await scoped()
      .update({
        status: 'published',
        instagram_media_id: result.mediaId,
        instagram_permalink: result.permalink ?? null,
        posted_at: result.publishedAt,
        error_message: null,
        publish_started_at: null,
      })
      .eq('id', post.id)
      .eq('account_id', accountId);
  } catch (err: unknown) {
    // Erro da Meta é útil pro usuário; erro interno não sai do servidor.
    const errorMsg = err instanceof InstagramApiError ? err.message : 'Falha na publicação do Instagram';
    if (!(err instanceof InstagramApiError)) console.error('[instagram/publish] falha:', err);
    try {
      if (credentials && err instanceof InstagramApiError) await recordInstagramError(admin, accountId, errorMsg);
      await scoped()
        .update({ status: restoreStatus, error_message: errorMsg, publish_started_at: null })
        .eq('id', post.id)
        .eq('account_id', accountId);
    } catch (dbErr) {
      console.error('[instagram/publish] não consegui gravar a falha:', dbErr);
    }
  }
}

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
  if ((post.media_urls ?? []).length === 0 && (post.media_type ?? 'foto') === 'video') {
    return NextResponse.json(
      { error: 'Post precisa de pelo menos uma imagem ou vídeo para publicação no Instagram.' },
      { status: 400 },
    );
  }

  // Reserva o post antes de ir à Meta: um segundo clique (ou outra aba) cai aqui
  // em vez de abrir um segundo envio e duplicar o Reel.
  const { data: claimed } = await ctx.supabase
    .from('marketing_posts')
    .update({ status: 'publishing', publish_started_at: new Date().toISOString(), error_message: null })
    .eq('id', post.id)
    .eq('account_id', ctx.accountId)
    .neq('status', 'published')
    .or(`status.neq.publishing,publish_started_at.lt.${new Date(Date.now() - STALE_PUBLISH_MS).toISOString()}`)
    .select('id')
    .maybeSingle();
  if (!claimed) {
    return NextResponse.json({ error: 'Este post já está sendo publicado.' }, { status: 409 });
  }

  const restoreStatus: PostStatus = post.status === 'publishing' ? 'pending_approval' : post.status;
  const admin = supabaseAdmin();
  const accountId = ctx.accountId;
  after(() => runPublish({ admin, accountId, post, credentials, restoreStatus }));

  return NextResponse.json({ status: 'publishing', postId: post.id }, { status: 202 });
}
