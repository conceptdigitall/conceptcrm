// ============================================================
// GET  /api/v1/deals — list deals (scope: deals:read)
// POST /api/v1/deals — create a deal (scope: deals:write)
//
// List is keyset-paginated (see src/lib/api/v1/pagination.ts) with
// optional `?status=open|won|lost`, `?pipeline_id=`, `?stage_id=` and
// `?contact_id=` filters.
//
// Create body: { title, contact_id, pipeline_id?, stage_id?, value?,
// notes?, expected_close_date? }. Without pipeline/stage the deal
// lands in the first stage of the account's oldest pipeline.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { parseListParams, keysetFilter, buildPage } from '@/lib/api/v1/pagination';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import {
  DEAL_SELECT,
  DealError,
  createDeal,
  dealErrorResponse,
  isDealStatus,
  serializeDeal,
} from '@/lib/api/v1/deals';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'deals:read');
    const { limit, cursor } = parseListParams(request);
    const url = new URL(request.url);

    const status = url.searchParams.get('status');
    if (status && !isDealStatus(status)) {
      return fail('bad_request', "'status' must be open, won or lost", 400);
    }

    let query = ctx.supabase.from('deals').select(DEAL_SELECT).eq('account_id', ctx.accountId);
    if (status) query = query.eq('status', status);
    for (const key of ['pipeline_id', 'stage_id', 'contact_id'] as const) {
      const value = url.searchParams.get(key);
      if (value) query = query.eq(key, value);
    }

    query = query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    const kf = keysetFilter(cursor);
    if (kf) query = query.or(kf);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/deals] list error:', error);
      return fail('internal', 'Failed to list deals', 500);
    }
    const { items, nextCursor } = buildPage(
      (data ?? []) as unknown as Array<{ created_at: string; id: string }>,
      limit
    );
    return okList(
      items.map((r) => serializeDeal(r as unknown as Record<string, unknown>)),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'deals:write');
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }
    const userId = ctx.createdBy ?? (await resolveAuditUserId(ctx.supabase, ctx.accountId));
    return ok(await createDeal(ctx.supabase, ctx.accountId, userId, body), 201);
  } catch (err) {
    if (err instanceof DealError) return dealErrorResponse(err);
    return toApiErrorResponse(err);
  }
}
