import { NextResponse } from 'next/server';
import { financeErrorResponse, financeRepository } from '@/lib/finance/context';
import { isIsoDate } from '@/lib/finance/dates';
import { BASE_CURRENCY, FINANCE_CURRENCIES, isFinanceCurrency } from '@/lib/finance/money';
import { getRateToBrl } from '@/lib/finance/rates';
import type { RateQuote } from '@/lib/finance/types';

/**
 * GET /api/financeiro/rates?currencies=USD,EUR&date=YYYY-MM-DD
 * Sem `currencies`: todas as moedas aceitas. Sem `date`: cotação atual.
 * Moeda cuja cotação falhar vem em `unavailable`, sem derrubar as outras.
 */
export async function GET(request: Request) {
  try {
    await financeRepository(); // mesma checagem de acesso das outras rotas
    const sp = new URL(request.url).searchParams;
    const date = sp.get('date');
    if (date && !isIsoDate(date)) return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
    const requested = (sp.get('currencies') ?? FINANCE_CURRENCIES.map((c) => c.code).join(','))
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((c) => c && c !== BASE_CURRENCY);
    if (requested.some((c) => !isFinanceCurrency(c))) return NextResponse.json({ error: 'Moeda não suportada' }, { status: 400 });

    const results = await Promise.allSettled(requested.map((c) => getRateToBrl(c, date)));
    const rates: RateQuote[] = [];
    const unavailable: string[] = [];
    results.forEach((r, i) => (r.status === 'fulfilled' ? rates.push(r.value) : unavailable.push(requested[i])));
    return NextResponse.json({ rates, unavailable });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
