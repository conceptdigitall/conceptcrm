import { NextResponse } from 'next/server';
import { financeErrorResponse, financeRepository } from '@/lib/finance/context';
import { isIsoDate } from '@/lib/finance/dates';
import { parseMoneyInput } from '@/lib/finance/money';
import { chargeRecurring } from '@/lib/finance/service';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/financeiro/recurring/[id]/charge — { date?, actual_brl? }
 * Lança a cobrança (com a cotação do dia) e avança a próxima data um ciclo.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const repo = await financeRepository();
    const { id } = await params;
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (body.date !== undefined && !isIsoDate(body.date)) return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
    let actual: number | null = null;
    if (body.actual_brl !== undefined && body.actual_brl !== null && body.actual_brl !== '') {
      actual = parseMoneyInput(body.actual_brl);
      if (!actual) return NextResponse.json({ error: 'Valor real em reais inválido' }, { status: 400 });
    }
    const rec = await repo.getRecurring(id);
    if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const result = await chargeRecurring(repo, rec, { date: body.date as string | undefined, actual_brl_cents: actual });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
