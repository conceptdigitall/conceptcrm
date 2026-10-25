// ============================================================
// GET /api/v1/marketing/posts — posts newest first, by default only
// the ones waiting for approval (`?status=`, `?limit=` max 50).
// Scope: marketing:generate. Internal accounts only.
// `media_url` is a signed link (1 hour) to the mp4 or the art.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { POST_SELECT, POST_STATUSES, assertInternalAccount, serializePost } from '@/lib/api/v1/marketing';
import { attachPostMedia } from '@/lib/marketing/post-media';
import type { MarketingPost, PostStatus } from '@/types';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'marketing:generate');
    assertInternalAccount(ctx.accountId);
    const params = new URL(request.url).searchParams;
    const status = (params.get('status') ?? 'pending_approval') as PostStatus;
    if (!POST_STATUSES.includes(status)) {
      return fail('bad_request', `'status' must be one of ${POST_STATUSES.join(', ')}`, 400);
    }
    const rawLimit = Number(params.get('limit') ?? 10);
    const limit = Math.max(1, Math.min(50, Number.isFinite(rawLimit) ? rawLimit : 10));

    const { data, error } = await ctx.supabase
      .from('marketing_posts')
      .select(POST_SELECT)
      .eq('account_id', ctx.accountId)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[api/v1/marketing/posts] list error:', error);
      return fail('internal', 'Failed to list posts', 500);
    }
    const withMedia = await attachPostMedia(ctx.supabase, (data ?? []) as MarketingPost[]);
    return ok(withMedia.map(serializePost));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
