import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';
import { allowedValues, canonicalValue } from '@/lib/prospecting/columns';
import type { ColumnKind } from '@/types';

export async function PATCH(
  request: Request, { params }: { params: Promise<{ id: string; leadId: string }> },
) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  if (!isInternalAccount(ctx.accountId)) {
    return NextResponse.json({ error: 'Recurso interno da Concept Digital' }, { status: 403 });
  }
  const { id, leadId } = await params;
  const body = (await request.json().catch(() => null)) as { value?: unknown } | null;

  const { data: column } = await ctx.supabase
    .from('lead_columns')
    .select('id, kind, options')
    .eq('id', id)
    .maybeSingle();
  if (!column) return NextResponse.json({ error: 'Coluna não encontrada' }, { status: 404 });
  const kind = column.kind as ColumnKind;
  const options = (column.options ?? []) as string[];

  let corrected: string | null = null;
  if (body?.value !== null) {
    corrected = canonicalValue(kind, options, body?.value);
    if (!corrected) {
      return NextResponse.json({ error: `Valor inválido. Use: ${allowedValues(kind, options).join(', ')}` }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from('lead_column_values')
    .upsert({
      column_id: id,
      lead_id: leadId,
      account_id: ctx.accountId,
      corrected_value: corrected,
      corrected_by: corrected ? ctx.userId : null,
      corrected_at: corrected ? now : null,
      updated_at: now,
    }, { onConflict: 'column_id,lead_id' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ value: data });
}
