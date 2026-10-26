// ============================================================
// /api/v1/marketing/pautas — pauta semanal de marketing.
//   GET  ?semana=AAAA-MM-DD → pauta da semana (padrão: a atual, em
//        Brasília) com os itens por dia, ou { data: null }.
//   POST → abre a pauta da semana atual como `gerando`, sem itens (o
//        worker preenche); 409 se a semana já tem pauta.
// Scope: marketing:generate. Internal accounts only.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { PAUTA_ITEM_SELECT, PAUTA_SELECT, assertInternalAccount, serializePauta } from '@/lib/api/v1/marketing';
import { semanaInicioISO } from '@/lib/marketing/pauta';
import type { MarketingPauta, MarketingPautaItem } from '@/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'marketing:generate');
    assertInternalAccount(ctx.accountId);
    const semana = new URL(request.url).searchParams.get('semana') ?? semanaInicioISO(new Date());
    if (!DATE_RE.test(semana) || Number.isNaN(Date.parse(`${semana}T00:00:00Z`))) {
      return fail('bad_request', "'semana' must be a date like AAAA-MM-DD", 400);
    }

    const { data: pauta, error } = await ctx.supabase
      .from('marketing_pautas')
      .select(PAUTA_SELECT)
      .eq('account_id', ctx.accountId)
      .eq('semana_inicio', semana)
      .maybeSingle();
    if (error) {
      console.error('[api/v1/marketing/pautas] get error:', error);
      return fail('internal', 'Failed to load pauta', 500);
    }
    if (!pauta) return ok(null);

    const { data: itens, error: itensError } = await ctx.supabase
      .from('marketing_pauta_itens')
      .select(PAUTA_ITEM_SELECT)
      .eq('pauta_id', (pauta as MarketingPauta).id)
      .eq('account_id', ctx.accountId)
      .order('dia', { ascending: true });
    if (itensError) {
      console.error('[api/v1/marketing/pautas] items error:', itensError);
      return fail('internal', 'Failed to load pauta items', 500);
    }
    return ok(serializePauta(pauta as MarketingPauta, (itens ?? []) as MarketingPautaItem[]));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'marketing:generate');
    assertInternalAccount(ctx.accountId);
    const semana = semanaInicioISO(new Date());

    const { data: existing, error: existingError } = await ctx.supabase
      .from('marketing_pautas')
      .select('id')
      .eq('account_id', ctx.accountId)
      .eq('semana_inicio', semana)
      .maybeSingle();
    if (existingError) {
      console.error('[api/v1/marketing/pautas] lookup error:', existingError);
      return fail('internal', 'Failed to create pauta', 500);
    }
    if (existing) return fail('conflict', `Pauta for week ${semana} already exists`, 409);

    const { data, error } = await ctx.supabase
      .from('marketing_pautas')
      .insert({ account_id: ctx.accountId, semana_inicio: semana, status: 'gerando' })
      .select(PAUTA_SELECT)
      .single();
    if (error) {
      // 23505 = a outra chamada criou a mesma semana entre o select e o insert.
      if ((error as { code?: string }).code === '23505') {
        return fail('conflict', `Pauta for week ${semana} already exists`, 409);
      }
      console.error('[api/v1/marketing/pautas] create error:', error);
      return fail('internal', 'Failed to create pauta', 500);
    }
    return ok(serializePauta(data as MarketingPauta, []), 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
