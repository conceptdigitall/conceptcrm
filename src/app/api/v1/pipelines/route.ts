// ============================================================
// GET /api/v1/pipelines — the account's pipelines with their stages,
// ordered by position (scope: deals:read). Callers use it to turn a
// stage name ("Proposta") into the stage_id that /deals expects.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, toApiErrorResponse } from '@/lib/api/v1/respond';
import { DealError, dealErrorResponse, listPipelines } from '@/lib/api/v1/deals';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'deals:read');
    return ok(await listPipelines(ctx.supabase, ctx.accountId));
  } catch (err) {
    if (err instanceof DealError) return dealErrorResponse(err);
    return toApiErrorResponse(err);
  }
}
