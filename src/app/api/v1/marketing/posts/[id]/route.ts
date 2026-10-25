// ============================================================
// PATCH /api/v1/marketing/posts/:id — approve or reject a post that
// is waiting for approval. Scope: marketing:generate, internal only.
//
// Body: { "decision": "approve" | "reject", "reason"?: string }.
// approve → `scheduled` (publishing stays in the dashboard);
// reject → `archived` with the reason. Only `pending_approval` posts
// change, so a second tap on the same button gets 409, not a redo.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  POST_SELECT,
  assertInternalAccount,
  decisionPatch,
  isPostDecision,
  serializePost,
} from '@/lib/api/v1/marketing';
import type { MarketingPost } from '@/types';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'marketing:generate');
    assertInternalAccount(ctx.accountId);
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !isPostDecision(body.decision)) {
      return fail('bad_request', "'decision' must be 'approve' or 'reject'", 400);
    }

    const { data, error } = await ctx.supabase
      .from('marketing_posts')
      .update(decisionPatch(body.decision, body.reason))
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .eq('status', 'pending_approval')
      .select(POST_SELECT)
      .maybeSingle();
    if (error) {
      console.error('[api/v1/marketing/posts] decision error:', error);
      return fail('internal', 'Failed to update post', 500);
    }
    if (data) return ok(serializePost(data as MarketingPost));

    const { data: current } = await ctx.supabase
      .from('marketing_posts')
      .select('status')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!current) return fail('not_found', 'Post not found', 404);
    return fail('conflict', `Post is ${current.status}, not pending_approval`, 409);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
