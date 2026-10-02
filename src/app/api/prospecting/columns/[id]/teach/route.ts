import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';

// "Ensinar com Claude": once per column, Claude labels a sample of leads and the
// worker trains the column head with them (worker/learning.ts).
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
    .select('id, status, teach_requested_at, taught_at')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Coluna não encontrada' }, { status: 404 });
  if (current.teach_requested_at || current.taught_at) {
    return NextResponse.json({ error: 'Esta coluna já foi ensinada' }, { status: 409 });
  }

  // A running column picks the request up when it finishes; otherwise it goes back to the queue.
  const patch: Record<string, unknown> = { teach_requested_at: new Date().toISOString() };
  if (current.status !== 'running') Object.assign(patch, { status: 'pending', error: null, started_at: null, finished_at: null });
  const { data, error } = await ctx.supabase
    .from('lead_columns')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ column: data });
}
