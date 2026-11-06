// Referências: vídeos virais enviados por link, analisados pelo worker com Gemini.
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import type { MarketingReference, Playbook } from '@/types';
import { validateReferenceInput } from '@/lib/marketing/references';
import { semanaInicioISO } from '@/lib/marketing/pauta';
import { dbErrorResponse } from '@/lib/marketing/db-error';

export async function GET() {
  let ctx;
  try {
    ctx = await requireRole('viewer');
  } catch (err) {
    return toErrorResponse(err);
  }

  const { data, error } = await ctx.supabase
    .from('marketing_references')
    .select('*')
    .eq('account_id', ctx.accountId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return dbErrorResponse('references', error);

  const { data: pauta, error: pautaErr } = await ctx.supabase
    .from('marketing_pautas')
    .select('playbook')
    .eq('account_id', ctx.accountId)
    .eq('semana_inicio', semanaInicioISO(new Date()))
    .maybeSingle();
  if (pautaErr) return dbErrorResponse('references', pautaErr);

  return NextResponse.json({
    references: (data ?? []) as MarketingReference[],
    playbook: ((pauta as { playbook?: Playbook | null } | null)?.playbook ?? null) as Playbook | null,
  });
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => null);
  const parsed = validateReferenceInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { url, normalized, platform, eixo, nicho, views } = parsed.value;

  const { data, error } = await ctx.supabase
    .from('marketing_references')
    .insert({
      account_id: ctx.accountId,
      url,
      url_normalizada: normalized,
      plataforma: platform,
      eixo,
      nicho,
      views,
      status: 'pending',
      criado_por: ctx.userId,
    })
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      const { data: existing, error: findErr } = await ctx.supabase
        .from('marketing_references')
        .select('*')
        .eq('account_id', ctx.accountId)
        .eq('url_normalizada', normalized)
        .maybeSingle();
      if (findErr || !existing) return dbErrorResponse('references', findErr ?? error);
      return NextResponse.json({ reference: existing as MarketingReference, duplicate: true });
    }
    return dbErrorResponse('references', error);
  }
  return NextResponse.json({ reference: data as MarketingReference }, { status: 201 });
}
