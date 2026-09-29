import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  const { id } = await params;

  const { data: current } = await ctx.supabase
    .from('lead_searches')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Busca não encontrada' }, { status: 404 });
  if (current.status !== 'failed') {
    return NextResponse.json({ error: 'Só dá pra tentar de novo uma busca com erro' }, { status: 409 });
  }

  const { data, error } = await ctx.supabase
    .from('lead_searches')
    .update({ status: 'pending', error: null, started_at: null, finished_at: null })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ search: data });
}
