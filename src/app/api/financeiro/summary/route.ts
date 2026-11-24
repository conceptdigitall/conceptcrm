import { NextResponse } from 'next/server';
import { financeErrorResponse, financeRepository } from '@/lib/finance/context';
import { isMonthKey, monthOf, monthRange, shiftMonth, todayInBrazil } from '@/lib/finance/dates';
import { BASE_CURRENCY } from '@/lib/finance/money';
import { getRateToBrl } from '@/lib/finance/rates';
import { buildSummary } from '@/lib/finance/summary';

const SERIES_MONTHS = 6;

/** GET /api/financeiro/summary?month=YYYY-MM — totais do painel, calculados aqui. */
export async function GET(request: Request) {
  try {
    const repo = await financeRepository();
    const today = todayInBrazil();
    const month = new URL(request.url).searchParams.get('month') ?? monthOf(today);
    if (!isMonthKey(month)) return NextResponse.json({ error: 'Mês inválido' }, { status: 400 });

    const from = monthRange(shiftMonth(month, -(SERIES_MONTHS - 1))).from;
    const to = monthRange(month).to;
    const [entries, categories, recurring] = await Promise.all([
      repo.listEntries({ from, to }),
      repo.listCategories(),
      repo.listRecurring(),
    ]);

    // Cotação de hoje só para as moedas dos fixos ativos (projeção do custo mensal).
    const currencies = [...new Set(recurring.filter((r) => r.active && r.currency !== BASE_CURRENCY).map((r) => r.currency))];
    const settled = await Promise.allSettled(currencies.map((c) => getRateToBrl(c)));
    const rates: Record<string, number> = {};
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') rates[currencies[i]] = r.value.rate;
    });

    return NextResponse.json({
      summary: buildSummary({ month, today, entries, categories, recurring, rates, seriesMonths: SERIES_MONTHS }),
    });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
