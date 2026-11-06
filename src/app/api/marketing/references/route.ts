// Referências: vídeos virais enviados por link, analisados pelo worker com Gemini.
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import type { MarketingReference, Playbook } from '@/types';
import { validateReferenceInput } from '@/lib/marketing/references';
import { semanaInicioISO } from '@/lib/marketing/pauta';
import { createReference } from '@/lib/marketing/reference-store';
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
  const result = await createReference(ctx.supabase, ctx.accountId, ctx.userId, parsed.value);
  if (!result.ok) return dbErrorResponse('references', result.error);
  if (result.duplicate) return NextResponse.json({ reference: result.reference, duplicate: true });
  return NextResponse.json({ reference: result.reference }, { status: 201 });
}
