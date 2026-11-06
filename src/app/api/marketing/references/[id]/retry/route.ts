// Analisar de novo: só uma referência que falhou volta para a fila do worker.
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import type { MarketingReference } from '@/types';
import { dbErrorResponse } from '@/lib/marketing/db-error';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  const { id } = await params;

  const { data: current, error: findErr } = await ctx.supabase
    .from('marketing_references')
    .select('*')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle();
  if (findErr) return dbErrorResponse('references', findErr);
  if (!current) return NextResponse.json({ error: 'Referência não encontrada.' }, { status: 404 });
  if ((current as MarketingReference).status !== 'failed') {
    return NextResponse.json({ error: 'Só dá para analisar de novo uma referência que falhou.' }, { status: 409 });
  }

  const { data, error } = await ctx.supabase
    .from('marketing_references')
    .update({ status: 'pending', error: null, retry_after: null, started_at: null, finished_at: null })
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .eq('status', 'failed')
    .select()
    .maybeSingle();
  if (error) return dbErrorResponse('references', error);
  if (!data) return NextResponse.json({ error: 'A referência mudou de estado. Atualize a lista.' }, { status: 409 });
  return NextResponse.json({ reference: data as MarketingReference });
}
