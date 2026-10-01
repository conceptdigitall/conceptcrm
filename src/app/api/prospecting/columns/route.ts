import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';
import { MAX_COLUMNS, parseColumnTitle } from '@/lib/prospecting/columns';

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

  const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
  const parsed = parseColumnTitle(body?.title);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { count } = await ctx.supabase
    .from('lead_columns')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId);
  if ((count ?? 0) >= MAX_COLUMNS) {
    return NextResponse.json({ error: `Limite de ${MAX_COLUMNS} colunas. Exclua uma para criar outra.` }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from('lead_columns')
    .insert({
      account_id: ctx.accountId,
      created_by: ctx.userId,
      title: parsed.value.title,
      kind: parsed.value.kind,
      options: parsed.value.options,
      instructions: parsed.value.instructions,
      status: 'pending',
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ column: data }, { status: 201 });
}
