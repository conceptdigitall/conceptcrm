// ============================================================
// /api/v1/marketing/references — referências virais para análise.
//   GET  ?status=pending|running|done|failed → as 50 mais recentes da
//        conta; `analise` só aparece quando a análise terminou.
//   POST { url, eixo, nicho?, views? } → 201 com a referência nova, ou
//        200 + `duplicate: true` se o link já foi enviado.
// Scope: marketing:references. Internal accounts only.
// ============================================================

import { NextResponse } from 'next/server';

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  REFERENCE_STATUSES,
  assertInternalAccount,
  serializeReference,
} from '@/lib/api/v1/marketing';
import { validateReferenceInput } from '@/lib/marketing/references';
import { createReference } from '@/lib/marketing/reference-store';
import type { MarketingReference } from '@/types';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'marketing:references');
    assertInternalAccount(ctx.accountId);
    const status = new URL(request.url).searchParams.get('status');
    if (status !== null && !(REFERENCE_STATUSES as readonly string[]).includes(status)) {
      return fail('bad_request', `'status' must be one of ${REFERENCE_STATUSES.join(', ')}`, 400);
    }

    let query = ctx.supabase.from('marketing_references').select('*').eq('account_id', ctx.accountId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error) {
      console.error('[api/v1/marketing/references] list error:', error);
      return fail('internal', 'Failed to load references', 500);
    }
    return ok(((data ?? []) as MarketingReference[]).map(serializeReference));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'marketing:references');
    assertInternalAccount(ctx.accountId);
    const parsed = validateReferenceInput(await request.json().catch(() => null));
    if (!parsed.ok) return fail('bad_request', parsed.error, 400);

    const result = await createReference(ctx.supabase, ctx.accountId, null, parsed.value);
    if (!result.ok) {
      console.error('[api/v1/marketing/references] create error:', result.error);
      return fail('internal', 'Failed to create reference', 500);
    }
    const data = serializeReference(result.reference);
    if (result.duplicate) return NextResponse.json({ data, duplicate: true });
    return ok(data, 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
