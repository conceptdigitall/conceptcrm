import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';
import { buildLeadState, SCORE_LEVELS, type LayaQuestion } from '@/lib/prospecting/columns';
import { calculateClosingProbability, type LeadRankingResult } from '@/lib/prospecting/dynamic-search';
import { layaBatch } from '@/../worker/laya-client';
import type { Lead, LeadColumnValue } from '@/types';

// Laya leva ~65 ms por lead; a página manda só os primeiros da ordem instantânea.
const MAX_RANK_LEADS = 60;
const RANK_STATE_CHARS = 400;

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

  const body = (await request.json().catch(() => null)) as { query?: unknown; leadIds?: unknown; warm?: unknown } | null;

  // Acorda a GPU da Laya enquanto o usuário ainda digita (a 1ª chamada após um tempo parada leva segundos).
  if (body?.warm === true) {
    const layaUrl = process.env.LAYA_URL;
    if (layaUrl) {
      void layaBatch(layaUrl, ['Nome: aquecimento'], { type: 'noul', instructions: 'ok?' }, { maxAttempts: 1 }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }
  const rawQuery = typeof body?.query === 'string' ? body.query.trim() : '';

  if (!rawQuery) {
    return NextResponse.json({ error: 'Informe a busca em linguagem natural' }, { status: 400 });
  }

  if (rawQuery.length > 200) {
    return NextResponse.json({ error: 'Busca muito longa (máximo 200 caracteres)' }, { status: 400 });
  }

  // Só os trechos do `raw` que a Laya lê (buildLeadState): o JSON inteiro do Google é pesado.
  const LEAD_FIELDS =
    'id, account_id, name, category, address, rating, review_count, website, phone, is_mobile, score, score_reasons, status, contact_id, '
    + 'raw_categories:raw->categories, raw_address:raw->complete_address, raw_description:raw->description, raw_about:raw->about';

  const requestedIds = Array.isArray(body?.leadIds)
    ? body.leadIds.filter((id): id is string => typeof id === 'string').slice(0, MAX_RANK_LEADS)
    : [];

  const leadsQuery = requestedIds.length > 0
    ? ctx.supabase.from('leads').select(LEAD_FIELDS).eq('account_id', ctx.accountId).in('id', requestedIds)
    : ctx.supabase.from('leads').select(LEAD_FIELDS).eq('account_id', ctx.accountId).order('score', { ascending: false }).limit(MAX_RANK_LEADS);

  const valuesQuery = (ids: string[]) =>
    ctx.supabase.from('lead_column_values').select('*').eq('account_id', ctx.accountId).in('lead_id', ids);

  // Com os ids em mãos, as duas consultas saem juntas.
  const [leadsRes, earlyValues] = await Promise.all([
    leadsQuery,
    requestedIds.length > 0 ? valuesQuery(requestedIds) : Promise.resolve(null),
  ]);
  if (leadsRes.error) {
    return NextResponse.json({ error: leadsRes.error.message }, { status: 500 });
  }

  const leads = ((leadsRes.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const { raw_categories, raw_address, raw_description, raw_about, ...rest } = row;
    return {
      ...rest,
      raw: { categories: raw_categories, complete_address: raw_address, description: raw_description, about: raw_about },
    } as unknown as Lead;
  });
  if (leads.length === 0) {
    return NextResponse.json({ results: [], laya: false });
  }

  const { data: valuesData } = earlyValues ?? (await valuesQuery(leads.map((l) => l.id)));

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
      // Nome, categoria, local, nota, site e celular cabem no começo; o resto só deixa a Laya mais lenta.
      const states = leads.map((lead) => buildLeadState(lead).slice(0, RANK_STATE_CHARS));
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

  return NextResponse.json({ results, laya: layaScores !== null });
}
