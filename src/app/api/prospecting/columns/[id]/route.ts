import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const body = await request.json().catch(() => ({}));
  const rawDefinition = body.definition;
  const definition = typeof rawDefinition === 'string' ? rawDefinition.trim() : null;

  const { data, error } = await ctx.supabase
    .from('lead_columns')
    .update({ definition: definition || null })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Coluna não encontrada' }, { status: 404 });
  return NextResponse.json({ column: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { data, error } = await ctx.supabase.from('lead_columns').delete().eq('id', id).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Coluna não encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
