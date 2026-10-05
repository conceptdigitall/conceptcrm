// ============================================================
// GET /api/v1/marketing/videos/:id — status of one video
// (scope: marketing:generate, internal accounts only). When status is
// `done`, `download_url` is a signed Storage link valid for 1 hour.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  VIDEO_SELECT,
  assertInternalAccount,
  serializeVideo,
  signedDownloadUrl,
} from '@/lib/api/v1/marketing';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'marketing:generate');
    assertInternalAccount(ctx.accountId);
    const { id } = await params;

    const { data } = await ctx.supabase
      .from('marketing_videos')
      .select(VIDEO_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!data) return fail('not_found', 'Video not found', 404);

    const row = data as Record<string, unknown>;
    return ok(serializeVideo(row, await signedDownloadUrl(ctx.supabase, row)));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
