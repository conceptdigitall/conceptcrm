import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { publishToInstagram, InstagramApiError } from '@/lib/marketing/instagram';
import { attachPostMedia } from '@/lib/marketing/post-media';
import type { MarketingPost } from '@/types';

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = (await request.json().catch(() => null)) as {
    postId?: string;
    kind?: 'feed' | 'story';
    mediaType?: 'foto' | 'carrossel' | 'video';
    mediaUrls?: string[];
    caption?: string;
  } | null;

  if (!body) {
    return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 });
  }

  let post: MarketingPost | null = null;

  if (body.postId) {
    const { data, error } = await ctx.supabase
      .from('marketing_posts')
      .select('*')
      .eq('id', body.postId)
      .eq('account_id', ctx.accountId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Post não encontrado' }, { status: 404 });
    }
    [post] = await attachPostMedia(ctx.supabase, [data as MarketingPost]);
    if (post.status === 'published') {
      return NextResponse.json({ error: 'Este post já foi publicado no Instagram.' }, { status: 400 });
    }
  }

  const kind = post?.kind ?? body.kind ?? 'feed';
  const mediaType = post?.media_type ?? body.mediaType ?? 'foto';
  const mediaUrls = post?.media_urls ?? body.mediaUrls ?? [];
  const caption = post?.caption ?? body.caption ?? '';

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
    });

    if (post) {
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
    }

    return NextResponse.json({
      success: true,
      mediaId: result.mediaId,
      permalink: result.permalink,
      postedAt: result.publishedAt,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Falha na publicação do Instagram';
    if (post) {
      await ctx.supabase
        .from('marketing_posts')
        .update({ error_message: errorMsg })
        .eq('id', post.id)
        .eq('account_id', ctx.accountId);
    }

    const status = err instanceof InstagramApiError ? 400 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
