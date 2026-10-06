// ============================================================
// GET  /api/v1/marketing/videos — latest videos, newest first
// POST /api/v1/marketing/videos — queue a new video
// Scope: marketing:generate (both). Internal accounts only.
//
// POST body: { prompt, format?: vertical|square|landscape,
// tone?: default|polished|app-store|cinematic, imagePaths?: [...] }.
// Same validation and 10/day limit as the dashboard. The Mac worker
// renders it; poll GET /api/v1/marketing/videos/:id for the result.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { queueVideo } from '@/lib/marketing/queue-video';
import { VIDEO_SELECT, assertInternalAccount, serializeVideo } from '@/lib/api/v1/marketing';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'marketing:generate');
    assertInternalAccount(ctx.accountId);
    const rawLimit = Number(new URL(request.url).searchParams.get('limit') ?? 10);
    const limit = Math.max(1, Math.min(50, Number.isFinite(rawLimit) ? rawLimit : 10));

    const { data, error } = await ctx.supabase
      .from('marketing_videos')
      .select(VIDEO_SELECT)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[api/v1/marketing/videos] list error:', error);
      return fail('internal', 'Failed to list videos', 500);
    }
    return ok((data ?? []).map((r) => serializeVideo(r as Record<string, unknown>)));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'marketing:generate');
    assertInternalAccount(ctx.accountId);
    const body = await request.json().catch(() => null);
    const createdBy = ctx.createdBy ?? (await resolveAuditUserId(ctx.supabase, ctx.accountId));

    const result = await queueVideo(ctx.supabase, ctx.accountId, createdBy, body);
    if (!result.ok) {
      if (result.status === 500) {
        console.error('[api/v1/marketing/videos] queue error:', result.error);
        return fail('internal', 'Failed to queue video', 500);
      }
      return fail(result.status === 429 ? 'rate_limited' : 'bad_request', result.error, result.status);
    }
    return ok(serializeVideo(result.video), 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
