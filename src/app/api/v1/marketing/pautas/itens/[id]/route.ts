// ============================================================
// PATCH /api/v1/marketing/pautas/itens/:id — decide um item da pauta.
// Scope: marketing:generate, internal only.
//
// Body: { "decision": "approve" | "adjust" | "reject", "comment"?: string }.
// adjust exige comment (o worker reescreve o item); reject aceita comment
// opcional. Só item `pending_approval` muda, então um segundo toque no
// mesmo botão recebe 409 com o status atual, não uma nova decisão.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { PAUTA_ITEM_SELECT, assertInternalAccount, serializePautaItem } from '@/lib/api/v1/marketing';
import { isItemDecision, itemDecisionPatch } from '@/lib/marketing/pauta';
import type { MarketingPautaItem } from '@/types';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'marketing:generate');
    assertInternalAccount(ctx.accountId);
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !isItemDecision(body.decision)) {
      return fail('bad_request', "'decision' must be 'approve', 'adjust' or 'reject'", 400);
    }
    const patch = itemDecisionPatch(body.decision, body.comment);
    if ('error' in patch) return fail('bad_request', String(patch.error), 400);

    const { data, error } = await ctx.supabase
      .from('marketing_pauta_itens')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .eq('status', 'pending_approval')
      .select(PAUTA_ITEM_SELECT)
      .maybeSingle();
    if (error) {
      console.error('[api/v1/marketing/pautas/itens] decision error:', error);
      return fail('internal', 'Failed to update pauta item', 500);
    }
    if (data) return ok(serializePautaItem(data as MarketingPautaItem));

    const { data: current } = await ctx.supabase
      .from('marketing_pauta_itens')
      .select('status')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!current) return fail('not_found', 'Pauta item not found', 404);
    return fail('conflict', `Item is ${current.status}, not pending_approval`, 409);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
