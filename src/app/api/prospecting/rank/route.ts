import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';
import { buildLeadState, SCORE_LEVELS, type LayaQuestion } from '@/lib/prospecting/columns';
import { calculateClosingProbability, type LeadRankingResult } from '@/lib/prospecting/dynamic-search';
import { layaBatch } from '@/../worker/laya-client';
import type { Lead, LeadColumnValue } from '@/types';

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  if (!isInternalAccount(ctx.accountId)) {
    return NextResponse.json({ error: 'Recurso interno da Concept Digital' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { query?: unknown; leadIds?: unknown } | null;
  const rawQuery = typeof body?.query === 'string' ? body.query.trim() : '';

  if (!rawQuery) {
    return NextResponse.json({ error: 'Informe a busca em linguagem natural' }, { status: 400 });
  }

  if (rawQuery.length > 200) {
    return NextResponse.json({ error: 'Busca muito longa (máximo 200 caracteres)' }, { status: 400 });
  }

  // 1. Busca os leads da conta
  let leadsQuery = ctx.supabase
    .from('leads')
    .select('*')
    .eq('account_id', ctx.accountId)
    .order('score', { ascending: false })
    .limit(500);

  if (Array.isArray(body?.leadIds) && body.leadIds.length > 0) {
    const validIds = body.leadIds.filter((id): id is string => typeof id === 'string');
    if (validIds.length > 0) {
      leadsQuery = ctx.supabase
        .from('leads')
        .select('*')
        .eq('account_id', ctx.accountId)
        .in('id', validIds);
    }
  }

  const { data: leadsData, error: leadsError } = await leadsQuery;
  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const leads = (leadsData ?? []) as Lead[];
  if (leads.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // 2. Busca valores de colunas de IA existentes para enriquecer o contexto (PR #9)
  const leadIds = leads.map((l) => l.id);
  const { data: valuesData } = await ctx.supabase
    .from('lead_column_values')
    .select('*')
    .eq('account_id', ctx.accountId)
    .in('lead_id', leadIds);

  const valuesByLead = new Map<string, LeadColumnValue[]>();
  for (const val of (valuesData ?? []) as LeadColumnValue[]) {
    const list = valuesByLead.get(val.lead_id) ?? [];
    list.push(val);
    valuesByLead.set(val.lead_id, list);
  }

  // 3. Tenta pontuação semântica via Laya se LAYA_URL estiver configurada
  const layaUrl = process.env.LAYA_URL;
  let layaScores: Map<string, number> | null = null;

  if (layaUrl) {
    try {
      const question: LayaQuestion = {
        type: 'score',
        instructions: rawQuery,
        criteria: [...SCORE_LEVELS],
      };
      const states = leads.map((lead) => buildLeadState(lead));
      const answers = await layaBatch(layaUrl, states, question, { maxAttempts: 1 });

      layaScores = new Map();
      for (let i = 0; i < leads.length; i++) {
        const ans = answers[i];
        // O score no Laya varia de 0 (baixo) a 2 (alto). Normalizamos para 0.0 - 1.0
        const normScore = typeof ans?.score === 'number' ? Math.max(0, Math.min(1, ans.score / 2)) : 0.5;
        layaScores.set(leads[i].id, normScore);
      }
    } catch (layaErr) {
      console.warn('[prospecting/rank] Laya indisponível para busca dinâmica, aplicando fallback:', layaErr);
    }
  }

  // 4. Calcula probabilidade e motivos para cada lead
  const results: LeadRankingResult[] = leads.map((lead) => {
    const layaScore = layaScores?.get(lead.id);
    const colValues = valuesByLead.get(lead.id);
    const { probability, probabilityLevel, reasons } = calculateClosingProbability(lead, {
      query: rawQuery,
      layaScore,
      columnValues: colValues,
    });

    return {
      leadId: lead.id,
      probability,
      probabilityLevel,
      reasons,
    };
  });

  // 5. Ordena do maior para o menor potencial de fechar
  results.sort((a, b) => b.probability - a.probability);

  return NextResponse.json({ results });
}
