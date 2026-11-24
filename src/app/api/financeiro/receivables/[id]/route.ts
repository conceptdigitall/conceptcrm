import { NextResponse } from 'next/server';
import { financeDbContext, financeErrorResponse } from '@/lib/finance/context';
import { isIsoDate, todayInBrazil } from '@/lib/finance/dates';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/financeiro/receivables/[id] — { action: 'pay' | 'reopen' | 'cancel', date? }
 * Pagar cria um lançamento de entrada na data (hoje, se omitida); reabrir apaga esse lançamento.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { repo, store } = await financeDbContext();
    const { id } = await params;
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (body.action === 'pay') {
      if (body.date !== undefined && !isIsoDate(body.date)) return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
      const date = (body.date as string | undefined) ?? todayInBrazil();
      return NextResponse.json({ receivable: await store.pay(repo, id, date) });
    }
    if (body.action === 'reopen') return NextResponse.json({ receivable: await store.reopen(repo, id) });
    if (body.action === 'cancel') return NextResponse.json({ receivable: await store.cancel(id) });
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
