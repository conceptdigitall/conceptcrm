import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';
import { validateSearchInput } from '@/lib/prospecting/validate';

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

  const body = await request.json().catch(() => null);
  const parsed = validateSearchInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await ctx.supabase
    .from('lead_searches')
    .insert({
      account_id: ctx.accountId,
      created_by: ctx.userId,
      query: parsed.value.query,
      location: parsed.value.location,
      max_results: parsed.value.maxResults,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ search: data }, { status: 201 });
}
