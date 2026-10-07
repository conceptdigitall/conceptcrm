// ============================================================
// GET   /api/v1/deals/:id — read one deal (scope: deals:read)
// PATCH /api/v1/deals/:id — edit, move stage, mark won/lost/open
//                           (scope: deals:write)
//
// PATCH body (any subset): { title, value, notes, expected_close_date,
// stage_id, status }. No DELETE on purpose.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { DealError, dealErrorResponse, getDealById, updateDeal } from '@/lib/api/v1/deals';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'deals:read');
    const { id } = await params;
    const deal = await getDealById(ctx.supabase, ctx.accountId, id);
    if (!deal) return fail('not_found', 'Deal not found', 404);
    return ok(deal);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'deals:write');
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }
    return ok(await updateDeal(ctx.supabase, ctx.accountId, id, body));
  } catch (err) {
    if (err instanceof DealError) return dealErrorResponse(err);
    return toApiErrorResponse(err);
  }
}
