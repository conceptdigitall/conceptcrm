import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  if (!isInternalAccount(ctx.accountId)) {
    return NextResponse.json({ error: 'Recurso interno da Concept Digital' }, { status: 403 });
  }
  const { id } = await params;

  const { data: current } = await ctx.supabase
    .from('lead_columns')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Coluna não encontrada' }, { status: 404 });

  // Apaga apenas as predições automáticas; correções manuais (feitas com lápis) são 100% preservadas
  const { error: deleteError } = await ctx.supabase
    .from('lead_column_values')
    .delete()
    .eq('column_id', id)
    .is('corrected_value', null);

  if (deleteError) {
    return NextResponse.json({ error: `Falha ao limpar valores antigos: ${deleteError.message}` }, { status: 500 });
  }

  // Devolve a coluna para a fila (pending) para o worker reprocessar
  const { data, error } = await ctx.supabase
    .from('lead_columns')
    .update({ status: 'pending', error: null, started_at: null, finished_at: null, filled_count: 0 })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, column: data });
}
