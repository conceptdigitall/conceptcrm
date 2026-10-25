import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { buildArtContent } from '@/lib/marketing/post-art-content';
import { renderPostArt } from '@/lib/marketing/post-art';
import { artFormatFor, loadArtSettings } from '@/lib/marketing/post-art-store';
import type { MarketingPost } from '@/types';

// Prévia da arte (PNG) para o painel. A publicação usa a mesma arte em JPEG.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  const limit = checkRateLimit(`mkt-art:${ctx.userId}`, RATE_LIMITS.marketingArt);
  if (!limit.success) return rateLimitResponse(limit);

  const { id } = await params;
  const { data, error } = await ctx.supabase
    .from('marketing_posts')
    .select('id, kind, title, idea, frames')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'Post não encontrado' }, { status: 404 });

  const post = data as Pick<MarketingPost, 'id' | 'kind' | 'title' | 'idea' | 'frames'>;
  const settings = await loadArtSettings(ctx.supabase, ctx.accountId);
  try {
    return await renderPostArt(buildArtContent(post, settings), artFormatFor(post), {
      'Cache-Control': 'private, max-age=300',
    });
  } catch (err) {
    console.error('[marketing/art] falha ao gerar arte:', err);
    return NextResponse.json({ error: 'Não foi possível gerar a arte' }, { status: 500 });
  }
}
