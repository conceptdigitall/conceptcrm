import { NextResponse } from 'next/server';
import { financeDbContext, financeErrorResponse } from '@/lib/finance/context';
import { isMonthKey, monthOf, todayInBrazil } from '@/lib/finance/dates';

/** GET /api/financeiro/receivables?month=YYYY-MM — cobranças dos contratos no mês. */
export async function GET(request: Request) {
  try {
    const { store } = await financeDbContext();
    const month = new URL(request.url).searchParams.get('month') ?? monthOf(todayInBrazil());
    if (!isMonthKey(month)) return NextResponse.json({ error: 'Mês inválido' }, { status: 400 });
    const [receivables, contracts] = await Promise.all([store.list(month), store.contracts()]);
    return NextResponse.json({ receivables, contracts_count: contracts.length });
  } catch (err) {
    return financeErrorResponse(err);
  }
}

/** POST /api/financeiro/receivables — { month } gera as cobranças do mês (idempotente). */
export async function POST(request: Request) {
  try {
    const { store } = await financeDbContext();
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (!isMonthKey(body.month)) return NextResponse.json({ error: 'Mês inválido' }, { status: 400 });
    return NextResponse.json({ created: await store.generate(body.month) }, { status: 201 });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
