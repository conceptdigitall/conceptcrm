import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { DealOutcomeError, dispatchDealOutcome } from '@/lib/deals/outcome-events';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id: dealId } = await params;

    const outcome = await dispatchDealOutcome({
      db: ctx.supabase,
      admin: supabaseAdmin(),
      accountId: ctx.accountId,
      dealId,
    });

    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    if (error instanceof DealOutcomeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return toErrorResponse(error);
  }
}
